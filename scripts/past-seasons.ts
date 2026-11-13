// The past-seasons test (docs/adr/0002): a candidate version of the model against version 4, season by season, with
// every setting of the candidate chosen from the seasons before the one scored. scripts/backtest-v5.ts loads the
// files, runs every candidate in scripts/candidates/ through scoreboard() and prints the tables. Nothing here reads a
// file or a betting number: Vegas and Polymarket reach marketLines() only, after every game is priced (docs/adr/0001).
import { EARLY, expected, finalDays, phi, TZ, dayKey, type FinalGame, type FitDay, type SeasonData } from "../src/lib/elo.ts";
import type { SeasonFiles } from "../src/lib/inputs.ts";
import { parseNbaArchive } from "../src/lib/nba-report.ts";
import { parseBox, type Athlete, type BoxLine, type Lineup, type Sides } from "../src/lib/players.ts";
import { blockBootstrap, loss, type Diff, type Paired } from "./evaluate.ts";

/**
 * One season on file as a version may read it: its games, box scores, preseason totals, ESPN's injury reports and
 * its play-by-play record as read from JSON, and in `nbaReports` each game's last NBA report published at least 30
 * minutes before its tip-off (scripts/nba-reports-at-tip/). Data a later version reads joins SeasonFiles
 * (src/lib/inputs.ts), and scripts/backtest-v5.ts's loader.
 */
export type Season = SeasonFiles;

/** One game as a version priced it before its tip-off. */
export type Call = {
  /** The home side's chance. */
  p: number;
  /** Each side's predicted lineup: shares of 48 minutes, 5 a side. A gap slot, with a negative id, is minutes on no named player, and the lineup measure counts them as misplaced. */
  lineup: Sides<Lineup>;
  /** Each player's value going into the game, in margin units per 48 minutes; a player it lacks counts 0. */
  values: ReadonlyMap<Athlete, number>;
};
/** A season's calls by game id: one for every final game. */
export type Calls = ReadonlyMap<string, Call>;

/** A candidate with its settings chosen. */
export type Chosen = {
  /** The chosen settings, as the tables print them. */
  settings: string;
  /**
   * Prices `season`, the one after the seasons the settings were chosen from. It walks forward: a game's call reads
   * no game played on its day or later, which changedByLaterResults() checks.
   */
  price(season: Season): Calls;
};

/** A version of the model the scoreboard can score. scripts/candidates/ holds one a file, as its default export. */
export type Candidate = {
  /** Its name in the tables. */
  name: string;
  /**
   * Chooses every setting from `earlier`, the seasons before the one to score, oldest first. The scored season
   * reaches only the returned `price`, so no setting can be chosen on it.
   */
  choose(earlier: readonly Season[]): Chosen;
};

/** Whether `v`, a candidate file's default export, has a Candidate's name and choose(). */
export const isCandidate = (v: unknown): v is Candidate =>
  typeof v === "object" && v !== null && "name" in v && typeof v.name === "string" && "choose" in v && typeof v.choose === "function";

/**
 * The calls of a walk-forward fit (src/lib/elo.ts fitSeason): each game's chance is Phi(expected margin / sigma),
 * with sigma `widen` times wider while either side has played fewer than EARLY.games, as scripts/evaluate.ts price()
 * has it; its lineup is the one the fit priced, and its values the fit's before the game's day.
 */
export function callsOf(data: SeasonData, days: readonly FitDay[], sigma: number, widen = 1): Calls {
  const played = new Map<string, number>(Object.keys(data.teams).map((a) => [a, 0]));
  const count = (a: string) => played.get(a) ?? 0;
  const out = new Map<string, Call>();
  for (const { games, before } of days) {
    for (const pg of games) {
      const k = Math.min(count(pg.game.home), count(pg.game.away));
      out.set(pg.game.id, { p: phi(expected(before, pg) / (sigma * (k < EARLY.games ? widen : 1))), lineup: pg.lineup, values: before.v });
    }
    for (const { game: g } of games) { played.set(g.home, count(g.home) + 1); played.set(g.away, count(g.away) + 1); }
  }
  return out;
}

/** A final game with both versions' chances: `day` counts from the season's first game day, `y` is 1 for a home win. */
export type ScoredGame = { id: string; season: string; day: number; y: 0 | 1; candidate: number; baseline: number };

/** Predicted lineups against the minutes played, over the team-games with a box score, minutes scaled to 240 a side. */
export type LineupScore = {
  teamGames: number;
  /** Minutes a team-game on the wrong players, half the summed |predicted - played|: `a` the candidate's, `b` the baseline's. */
  misplaced: Diff;
  /** Root mean square of sum (predicted - played) / 48 * value, at each version's own values, in margin units. */
  valueError: { candidate: number; baseline: number };
};
/** The candidate against the baseline on some games: in `logLoss`, `a` is the candidate's and `b` the baseline's. */
export type Line = { logLoss: Diff; lineups: LineupScore };
export type SeasonLine = Line & {
  season: string;
  /** The seasons handed to each version's choose(): every one on file before `season`. */
  chosenFrom: readonly string[];
  settings: { candidate: string; baseline: string };
};
export type Board = { candidate: string; baseline: string; seasons: SeasonLine[]; pooled: Line; games: readonly ScoredGame[] };

/**
 * Scores `candidate` against `baseline` on each of `scored`, oldest first. For season s both versions choose from
 * the seasons of `seasons` before s, then price s; results come from s's games, never from a version. Throws when a
 * version has no call for a final game, or `scored` names a season that is not in `seasons`.
 */
export function scoreboard(run: { seasons: readonly Season[]; scored: readonly string[]; candidate: Candidate; baseline: Candidate }): Board {
  const seasons = [...run.seasons].sort((x, y) => x.data.season.localeCompare(y.data.season));
  const ids = seasons.map((s) => s.data.season);
  const lines: SeasonLine[] = [], games: ScoredGame[] = [], paired: Paired[] = [], teamGames: TeamGame[] = [];
  for (const id of [...run.scored].sort()) {
    const at = ids.indexOf(id);
    if (at < 0) throw new Error(`scoreboard: season ${id} is not on file`);
    const season = seasons[at], earlier = seasons.slice(0, at);
    const base = run.baseline.choose(earlier), cand = run.candidate.choose(earlier);
    const baseCalls = base.price(season), candCalls = cand.price(season);
    const finals = finalGames(season.data);
    const box = season.box === undefined ? undefined : parseBox(season.box, id);
    const own: Paired[] = [], ownTeams: TeamGame[] = [];
    for (const { game: g, day } of finals) {
      const c = candCalls.get(g.id), b = baseCalls.get(g.id);
      if (!c) throw new Error(`scoreboard: ${run.candidate.name} has no call for ${id} game ${g.id}`);
      if (!b) throw new Error(`scoreboard: ${run.baseline.name} has no call for ${id} game ${g.id}`);
      const y = g.hs > g.as ? 1 : 0;
      games.push({ id: g.id, season: id, day, y, candidate: c.p, baseline: b.p });
      own.push({ season: id, day, a: loss(c.p, y), b: loss(b.p, y) });
      if (box) for (const side of ["home", "away"] as const) {
        const played = box.games[g.id]?.[g[side]];
        if (played?.length) ownTeams.push({ season: id, day, candidate: lineupMiss(c, side, played), baseline: lineupMiss(b, side, played) });
      }
    }
    paired.push(...own);
    teamGames.push(...ownTeams);
    lines.push({ season: id, chosenFrom: ids.slice(0, at), settings: { candidate: cand.settings, baseline: base.settings }, logLoss: blockBootstrap(own), lineups: lineupScore(ownTeams) });
  }
  return { candidate: run.candidate.name, baseline: run.baseline.name, seasons: lines, pooled: { logLoss: blockBootstrap(paired), lineups: lineupScore(teamGames) }, games };
}

/** A season's final games with `day`, whole days from its first final game day. */
function finalGames(data: SeasonData): { game: FinalGame; day: number }[] {
  const days = finalDays(data);
  if (!days.length) return [];
  const first = Date.parse(days[0].day);
  return days.flatMap(({ day, games }) => games.map((game) => ({ game, day: Math.round((Date.parse(day) - first) / 86_400_000) })));
}

type Miss = { misplaced: number; value: number };
type TeamGame = { season: string; day: number; candidate: Miss; baseline: Miss };

/** One side's predicted lineup against its box lines, played minutes scaled to 240. */
function lineupMiss(call: Call, side: keyof Sides<Lineup>, played: readonly BoxLine[]): Miss {
  const total = played.reduce((t, l) => t + l[1], 0);
  const gap = new Map<Athlete, number>();
  for (const l of played) gap.set(l[0], (gap.get(l[0]) ?? 0) - (l[1] * 240) / total);
  for (const s of call.lineup[side]) if (s.athlete > 0) gap.set(s.athlete, (gap.get(s.athlete) ?? 0) + s.share * 48);
  let off = 0, value = 0;
  for (const [athlete, d] of gap) { off += Math.abs(d); value += (d / 48) * (call.values.get(athlete) ?? 0); }
  return { misplaced: off / 2, value };
}

const rms = (xs: number[]) => Math.sqrt(xs.reduce((t, x) => t + x * x, 0) / xs.length);
function lineupScore(teamGames: readonly TeamGame[]): LineupScore {
  return {
    teamGames: teamGames.length,
    misplaced: blockBootstrap(teamGames.map((t) => ({ season: t.season, day: t.day, a: t.candidate.misplaced, b: t.baseline.misplaced }))),
    valueError: { candidate: rms(teamGames.map((t) => t.candidate.value)), baseline: rms(teamGames.map((t) => t.baseline.value)) },
  };
}

/** A market's log loss beside both versions' on the games it has a chance for. */
export type MarketLine = { games: number; market: number; candidate: number; baseline: number };
/**
 * `chances`, a market's home chance by game id, scored on a finished board: a line for each season with a game it
 * has, and the pooled line. It takes no candidate, so no market number reaches a call or a choice.
 */
export function marketLines(board: Board, chances: Readonly<Record<string, number>>): { seasons: (MarketLine & { season: string })[]; pooled: MarketLine } {
  const had = board.games.filter((g) => g.id in chances);
  const line = (gs: readonly ScoredGame[]): MarketLine => {
    const mean = (f: (g: ScoredGame) => number) => gs.reduce((t, g) => t + loss(f(g), g.y), 0) / gs.length;
    return { games: gs.length, market: mean((g) => chances[g.id]), candidate: mean((g) => g.candidate), baseline: mean((g) => g.baseline) };
  };
  const seasons = board.seasons.map((s) => s.season).filter((id) => had.some((g) => g.season === id));
  return { seasons: seasons.map((season) => ({ season, ...line(had.filter((g) => g.season === season)) })), pooled: line(had) };
}

/** The archive's rule: a game reads the last report published at least this many minutes before its tip-off. */
export const PRE_TIP = 30;
/**
 * How many of a season's final games have an NBA report for both sides, one or neither, and how long before each
 * tip-off its report says it was published, in minutes: the median, the shortest, and in `late` how many are under
 * PRE_TIP. `lead` is null when no final game has a report.
 */
export type ReportsRead = { finals: number; both: number; one: number; neither: number; lead: { median: number; shortest: number; late: number } | null };
export function reportsRead(season: Season): ReportsRead {
  const reports = season.nbaReports === undefined ? {} : parseNbaArchive(season.nbaReports, season.data.season).games;
  const finals = finalDays(season.data).flatMap((d) => d.games);
  let both = 0, one = 0;
  const leads: number[] = [];
  for (const g of finals) {
    const r = reports[g.id];
    const n = Number(!!r?.home) + Number(!!r?.away);
    both += Number(n === 2);
    one += Number(n === 1);
    if (r) leads.push((clockMs(eastern(g.t)) - clockMs(r.published)) / 60_000);
  }
  leads.sort((x, y) => x - y);
  const m = leads.length >> 1;
  const lead = leads.length ? { median: leads.length % 2 ? leads[m] : (leads[m - 1] + leads[m]) / 2, shortest: leads[0], late: leads.filter((x) => x < PRE_TIP).length } : null;
  return { finals: finals.length, both, one, neither: finals.length - both - one, lead };
}

const easternFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** An instant as US Eastern wall-clock time, `YYYY-MM-DDTHH:MM`, the form of a report's `published`. */
const eastern = (iso: string) => {
  const part = Object.fromEntries(easternFmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}`;
};
const clockMs = (wallClock: string) => Date.parse(`${wallClock}:00Z`);

/**
 * The walk-forward check: the ids of `season`'s games on or before `day` whose chance or lineup changes when the
 * season's later data changes. Every game on `day` or later gets another score, with a different winner, margin and
 * total, and loses its box score and play-by-play; every game after `day` loses its NBA report, and ESPN's reports of
 * the days after it go. Empty for a version whose calls read nothing of their own day or later.
 * scripts/candidates/candidates.test.ts runs it on every candidate.
 */
export function changedByLaterResults(check: { candidate: Candidate; earlier: readonly Season[]; season: Season; day: string }): string[] {
  const { season, day } = check;
  const chosen = check.candidate.choose(check.earlier);
  const idsFrom = (first: (gameDay: string) => boolean) => new Set(season.data.games.filter((g) => first(dayKey(g.t))).map((g) => g.id));
  const fromDay = idsFrom((d) => d >= day), after = idsFrom((d) => d > day);
  const changed: Season = {
    ...season,
    data: { ...season.data, games: season.data.games.map((g) => (fromDay.has(g.id) && g.hs !== null && g.as !== null ? { ...g, hs: 2 * g.as + 1, as: 2 * g.hs } : g)) },
    box: withoutKeys(season.box, "games", (id) => fromDay.has(id)),
    stints: withoutKeys(season.stints, "games", (id) => fromDay.has(id)),
    nbaReports: withoutKeys(season.nbaReports, "games", (id) => after.has(id)),
    injuries: withoutKeys(season.injuries, "days", (d) => d > day),
  };
  const as = chosen.price(season), bs = chosen.price(changed);
  return finalDays(season.data)
    .filter((d) => d.day <= day)
    .flatMap((d) => d.games)
    .filter((g) => {
      const a = as.get(g.id), b = bs.get(g.id);
      return !a || !b || a.p !== b.p || !sameLineup(a.lineup.home, b.lineup.home) || !sameLineup(a.lineup.away, b.lineup.away);
    })
    .map((g) => g.id);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** A raw season file, `{ season, [field]: { [key]: ... } }`, without the keys of `field` that `drop` names; anything else as it is. */
function withoutKeys(file: unknown, field: "games" | "days", drop: (key: string) => boolean): unknown {
  const entries = isRecord(file) ? file[field] : undefined;
  if (!isRecord(file) || !isRecord(entries)) return file;
  return { ...file, [field]: Object.fromEntries(Object.entries(entries).filter(([key]) => !drop(key))) };
}
const sameLineup = (x: Lineup, y: Lineup) => x.length === y.length && x.every((s, i) => s.athlete === y[i].athlete && s.share === y[i].share);
