// Version 5's roster-based lineups (issue 70): a game's predicted lineup starts from the team's recent roster, each
// player counted at his chance of playing times his expected minutes, where both rates are learned from how players
// in the same spot fared in the seasons before the one priced (docs/adr/0002). The rule is the prototype's (branch
// prototype/model-v5, scripts/research/analysis/c2.py, run as `redist moved`), with three differences in the rule: a day's box
// scores enter only after the whole day is priced; a team's first game of a season has an empty lineup, as in version
// 4; and a report adds a player only once he has played this season, because the fit holds a value for a player
// before his first game of a season only when he plays later in it.
import { finalDays, type Abbr, type Game, type SeasonData } from "./elo.ts";
import { NBA_STATUSES, type NbaArchive, type NbaStatus, type SideReport } from "./nba-report.ts";
import { scaled, type Athlete, type Lineup, type SeasonBox, type Sides } from "./players.ts";
import type { Availability } from "./v4.ts";

/** A player's report status as a rate reads it: the report's five, not listed by a report that covers his side, or no report for his side. */
export type Status = NbaStatus | "unlisted" | "uncovered";

/**
 * One player on a side's roster before tip-off: everything a rate may read, all known before the game. A new rate
 * dimension is a new field here and its entry in TABLES.
 */
export type Prospect = {
  athlete: Athlete;
  /** Mean of his last 5 appearances' box minutes, any team, any season. A prospect has always played this season. */
  usual: number;
  /** Of the team's last 10 games this season, how many in a row up to the latest he missed: 0 when he played the latest, the window's length when he played none. */
  missed: number;
  status: Status;
  /** The side's share of rotation absent, the same for each of its prospects: see prospectsOf(). */
  absent: number;
};

/** How roster lineups price: the fill term, and which seasons the rates are learned from. */
export type RosterRule = {
  /** Margin units per 48 missing minutes. */
  fill: number;
  /** Seasons the rates are learned from. Without it: every earlier season that has an NBA report archive. With it: exactly these, and only seasons after all of them are roster-priced. */
  from?: readonly string[];
};

const RULE = {
  /** A team's last games its roster is read from. */
  window: 10,
  /** Appearances a player's usual minutes average over. */
  recent: 5,
  /** Usual minutes that make a player a regular, for the share absent and the missing minutes. */
  regular: 10,
  /** Usual minutes a player's minutes multiplier is taken against, at least. */
  floor: 4,
  /** Statuses that add a listed player missing from the team's recent games, once he has played this season. */
  back: ["Available", "Probable", "Questionable"] as readonly Status[],
  /** Statuses that count a regular absent. */
  out: ["Out", "Doubtful"] as readonly Status[],
  /** Statuses under which a regular who missed the team's latest game counts absent. */
  guessed: ["unlisted", "uncovered"] as readonly Status[],
};

/** One rate dimension: its name, its bucket labels in order, and a prospect's label among them. */
type Dim = { name: string; labels: readonly string[]; of: (p: Prospect) => string };
const banded = (name: string, value: (p: Prospect) => number, edges: readonly number[], labels: readonly string[]): Dim => ({
  name,
  labels,
  of: (p) => labels[edges.filter((e) => value(p) >= e).length],
});
const STATUSES: readonly Status[] = [...NBA_STATUSES, "unlisted", "uncovered"];
const DIMS = {
  status: { name: "status", labels: STATUSES, of: (p) => p.status },
  missed: banded("missed", (p) => p.missed, [1, 2, 3, 6], ["0", "1", "2", "3-5", "6+"]),
  usual: banded("usual", (p) => p.usual, [10, 18, 26], ["<10", "10-18", "18-26", "26+"]),
  absent: banded("absent", (p) => p.absent, [0.08, 0.2, 0.35], ["<8%", "8-20%", "20-35%", "35%+"]),
} satisfies Record<string, Dim>;

/**
 * A rate table: its dimensions, what one prospect of a played side observes (undefined for nothing), and its lookup
 * chain, prefixes of `dims` longest first, each used when its cell holds at least `min` observations, else `otherwise`.
 */
type Table = {
  dims: readonly Dim[];
  observe: (p: Prospect, played: ReadonlyMap<Athlete, number>) => number | undefined;
  chain: readonly { depth: number; min: number }[];
  otherwise: number;
};
const TABLE_NAMES = ["plays", "minutes"] as const;
type TableName = (typeof TABLE_NAMES)[number];
const TABLES: Record<TableName, Table> = {
  /** Whether he plays. */
  plays: {
    dims: [DIMS.status, DIMS.missed, DIMS.usual],
    observe: (p, played) => (played.has(p.athlete) ? 1 : 0),
    chain: [{ depth: 3, min: 40 }, { depth: 2, min: 1 }, { depth: 1, min: 1 }],
    otherwise: 0.5,
  },
  /** When he plays, his minutes of 240 over his usual minutes, at least RULE.floor. */
  minutes: {
    dims: [DIMS.usual, DIMS.absent],
    observe: (p, played) => { const m = played.get(p.athlete); return m === undefined ? undefined : m / Math.max(p.usual, RULE.floor); },
    chain: [{ depth: 2, min: 1 }],
    otherwise: 1,
  },
};

/** One side as the walk saw it: its prospects before tip-off, and each player's minutes scaled to 240 after it, null for a side without a box score. */
type SideSeen = { prospects: readonly Prospect[]; played: ReadonlyMap<Athlete, number> | null };
/** A season walked: every game final or to come, in the order it was seen. */
type SeasonSeen = { season: string; games: Map<string, Sides<SideSeen>> };

const SIDES = ["home", "away"] as const;
const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);
const byTip = (x: Game, y: Game) => x.t.localeCompare(y.t) || x.id.localeCompare(y.id);

/**
 * Every season's sides, seasons oldest first; no rate is read. Across seasons it keeps each player's last minutes,
 * his latest team, and the team whose report listed him since his last game (`sighted`); within a season, each team's
 * last games' players. A final day's games are seen in tip order, each after its report's sightings, and the day's box
 * scores enter only after every one of its games is seen. The games still to come follow, from the state the last
 * final day left.
 */
function walk(seasons: readonly { data: SeasonData; box: SeasonBox }[], archives: ReadonlyMap<string, NbaArchive>): SeasonSeen[] {
  const minutes = new Map<Athlete, number[]>();
  const teamOf = new Map<Athlete, Abbr>();
  const sighted = new Map<Athlete, Abbr>();
  return seasons.map(({ data, box }) => {
    const archive = archives.get(data.season);
    const recent = new Map<Abbr, Athlete[][]>();
    const appeared = new Set<Athlete>();
    const games = new Map<string, Sides<SideSeen>>();
    /** A side's roster: the team's recent players still its own, then players its report lists as back who have played this season. `report` is null for a side no report covers. */
    const prospectsOf = (abbr: Abbr, report: SideReport | null): Prospect[] => {
      const latestFirst = [...(recent.get(abbr) ?? [])].reverse();
      if (!latestFirst.length) return [];
      const ids = new Set<Athlete>();
      for (const players of latestFirst) for (const a of players) if (teamOf.get(a) === abbr && (sighted.get(a) ?? abbr) === abbr) ids.add(a);
      for (const [key, status] of Object.entries(report ?? {})) if (RULE.back.includes(status) && appeared.has(Number(key))) ids.add(Number(key));
      const base = [...ids].map((a) => {
        const back = latestFirst.findIndex((players) => players.includes(a));
        const listed: NbaStatus | undefined = report?.[a];
        const status: Status = report ? (listed ?? "unlisted") : "uncovered";
        return { athlete: a, usual: sum(minutes.get(a)!) / minutes.get(a)!.length, missed: back === -1 ? latestFirst.length : back, status };
      });
      const regulars = base.filter((p) => p.usual >= RULE.regular);
      const away = regulars.filter((p) => RULE.out.includes(p.status) || (p.missed >= 1 && RULE.guessed.includes(p.status)));
      const total = sum(regulars.map((p) => p.usual));
      const absent = total ? sum(away.map((p) => p.usual)) / total : 0;
      return base.map((p) => ({ ...p, absent }));
    };
    const see = (g: Game): Sides<readonly Prospect[]> => {
      const report = archive?.games[g.id];
      for (const which of SIDES) for (const key of Object.keys(report?.[which] ?? {})) {
        const team = teamOf.get(Number(key));
        if (team !== undefined && team !== g[which]) sighted.set(Number(key), g[which]);
      }
      return { home: prospectsOf(g.home, report?.home ?? null), away: prospectsOf(g.away, report?.away ?? null) };
    };
    for (const { games: today } of finalDays(data)) {
      const seen = [...today].sort(byTip).map((g) => ({ g, prospects: see(g) }));
      for (const { g, prospects } of seen) {
        const side = (which: "home" | "away"): SideSeen => {
          const abbr = g[which];
          const lines = box.games[g.id]?.[abbr];
          if (!lines?.length) return { prospects: prospects[which], played: null };
          recent.set(abbr, [...(recent.get(abbr) ?? []), lines.map((l) => l[0])].slice(-RULE.window));
          for (const l of lines) {
            minutes.set(l[0], [...(minutes.get(l[0]) ?? []), l[1]].slice(-RULE.recent));
            teamOf.set(l[0], abbr);
            appeared.add(l[0]);
            sighted.delete(l[0]);
          }
          const total = sum(lines.map((l) => l[1]));
          return { prospects: prospects[which], played: new Map(lines.map((l) => [l[0], (l[1] * 240) / total])) };
        };
        games.set(g.id, { home: side("home"), away: side("away") });
      }
    }
    for (const g of data.games.filter((x) => !x.final).sort(byTip)) {
      const prospects = see(g);
      games.set(g.id, { home: { prospects: prospects.home, played: null }, away: { prospects: prospects.away, played: null } });
    }
    return { season: data.season, games };
  });
}

/** Observations summed by cell, keyed by table name and a prefix of its dimensions' labels. Tallies merge by addition. */
type Tally = Map<string, { sum: number; n: number }>;
const cellKey = (name: TableName, labels: readonly string[]) => [name, ...labels].join("|");
const labelsOf = (name: TableName, p: Prospect) => TABLES[name].dims.map((d) => d.of(p));

/** A season's observations, from its sides with a box score, at every prefix of every table's dimensions. */
function tally(season: SeasonSeen): Tally {
  const out: Tally = new Map();
  for (const sides of season.games.values()) for (const which of SIDES) {
    const { prospects, played } = sides[which];
    if (!played) continue;
    for (const p of prospects) for (const name of TABLE_NAMES) {
      const x = TABLES[name].observe(p, played);
      if (x === undefined) continue;
      const labels = labelsOf(name, p);
      for (let depth = 1; depth <= labels.length; depth++) {
        const key = cellKey(name, labels.slice(0, depth));
        const cell = out.get(key) ?? { sum: 0, n: 0 };
        out.set(key, { sum: cell.sum + x, n: cell.n + 1 });
      }
    }
  }
  return out;
}

function merge(tallies: readonly Tally[]): Tally {
  const out: Tally = new Map();
  for (const t of tallies) for (const [key, c] of t) {
    const cell = out.get(key) ?? { sum: 0, n: 0 };
    out.set(key, { sum: cell.sum + c.sum, n: cell.n + c.n });
  }
  return out;
}

/** A table's rate for a prospect: the mean of the first cell on its chain with enough observations, else its `otherwise`. */
function rate(rates: Tally, name: TableName, p: Prospect): number {
  const labels = labelsOf(name, p);
  for (const { depth, min } of TABLES[name].chain) {
    const cell = rates.get(cellKey(name, labels.slice(0, depth)));
    if (cell && cell.n >= min) return cell.sum / cell.n;
  }
  return TABLES[name].otherwise;
}

/**
 * A side priced from its prospects alone: each at plays x minutes x max(usual, RULE.floor), scaled to 240 in roster
 * order, those at 0 left out. `missing`, for the fill term, is over regulars who missed at most the latest game:
 * 5 x sum(usual x (1 - plays)) / sum(usual), with the sum at least 1.
 */
function priceSide(rates: Tally, prospects: readonly Prospect[]): { lineup: Lineup; missing: number } {
  const priced = prospects.map((p) => ({ p, plays: rate(rates, "plays", p) }));
  const lineup = scaled(priced.map(({ p, plays }) => ({ athlete: p.athlete, min: plays * rate(rates, "minutes", p) * Math.max(p.usual, RULE.floor) })).filter((x) => x.min > 0));
  const regulars = priced.filter(({ p }) => p.usual >= RULE.regular && p.missed <= 1);
  const usual = sum(regulars.map(({ p }) => p.usual));
  return { lineup, missing: (5 * sum(regulars.map(({ p, plays }) => p.usual * (1 - plays)))) / Math.max(usual, 1) };
}

/** Indices of the walked seasons whose tallies price season `i`, or none when `rule` leaves it on version 4. */
function sourcesOf(walked: readonly SeasonSeen[], i: number, archives: ReadonlyMap<string, NbaArchive>, rule: RosterRule): number[] {
  if (!rule.from) return walked.flatMap((s, j) => (j < i && archives.has(s.season) ? [j] : []));
  const at = rule.from.map((season) => walked.findIndex((s) => s.season === season));
  return at.every((j) => j >= 0 && j < i) ? at : [];
}

/**
 * Every season's roster-based lineups, in version 4's shape so modelInputs() swaps them whole. A season with no source
 * season under `rule` takes `v4`'s entry itself. A game's extra term is fill x (home missing - away missing), set only
 * when the two differ, as version 4 does.
 */
export function rosterAvailability(
  seasons: readonly { data: SeasonData; box: SeasonBox }[],
  archives: ReadonlyMap<string, NbaArchive>,
  rule: RosterRule,
  v4: ReadonlyMap<string, Availability>,
): Map<string, Availability> {
  const walked = walk(seasons, archives);
  const tallies = new Map<number, Tally>();
  const tallyOf = (j: number) => tallies.get(j) ?? tallies.set(j, tally(walked[j])).get(j)!;
  return new Map(walked.map((seen, i) => {
    const sources = sourcesOf(walked, i, archives, rule);
    if (!sources.length) return [seen.season, v4.get(seen.season)!];
    const rates = merge(sources.map(tallyOf));
    const out: Availability = { lineups: new Map(), extra: new Map(), missing: new Map() };
    for (const [id, sides] of seen.games) {
      const home = priceSide(rates, sides.home.prospects), away = priceSide(rates, sides.away.prospects);
      out.lineups.set(id, { home: home.lineup, away: away.lineup });
      out.missing.set(id, { home: home.missing, away: away.missing });
      if (home.missing !== away.missing) out.extra.set(id, rule.fill * (home.missing - away.missing));
    }
    return [seen.season, out];
  }));
}

/**
 * The rates learned from the `from` seasons, for printing: every cell observed, by its table and the labels of its
 * table's leading dimensions, with its sum and count; each dimension's labels in order; and the rate a prospect looks
 * up in a table.
 */
export function rosterRates(seasons: readonly { data: SeasonData; box: SeasonBox }[], archives: ReadonlyMap<string, NbaArchive>, from: readonly string[]) {
  const rates = merge(walk(seasons, archives).filter((s) => from.includes(s.season)).map(tally));
  const cells = TABLE_NAMES.flatMap((name) => [...rates].flatMap(([key, { sum, n }]) => {
    const [table, ...labels] = key.split("|");
    return table === name ? [{ table: name, at: Object.fromEntries(labels.map((l, d) => [TABLES[name].dims[d].name, l])), sum, n }] : [];
  }));
  const labels: Record<keyof typeof DIMS, readonly string[]> = { status: DIMS.status.labels, missed: DIMS.missed.labels, usual: DIMS.usual.labels, absent: DIMS.absent.labels };
  return { cells, labels, rate: (table: TableName, p: Prospect) => rate(rates, table, p) };
}
