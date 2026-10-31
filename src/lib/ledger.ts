// Every move of a team's shown rating split into its parts, so each row adds up exactly to the change shown.
// Mirrors compute() in elo.ts day by day.
import { ELO_PER_SIGMA, NEWCOMER, PARAMS, START, addDays, counted, dayKey, expected, fitSeasonSteps, playerPart, seasonRule, shownChange, shownLineups, type Abbr, type Fit } from "./elo.ts";
import { shortDay } from "./format.ts";
import { parseArchive, type Injury } from "./injuries.ts";
import { playerName } from "./names.ts";
import type { Lineup } from "./players.ts";
import { seasonInputs, team, type SeasonView } from "./season.ts";

const INJURY_FILES = import.meta.glob<unknown>("../data/injuries/*.json", { eager: true, import: "default" });

/** A player whose counted minutes changed that day, and what the change did at his value after the day. */
export type PlayerMove = {
  athlete: number;
  name: string;
  /** Minutes a game the rating counted him for before the day. */
  before: number;
  points: number;
  /** His minutes in the team's game that day, null when he did not play in it, undefined on a day off. */
  played?: number | null;
  status: "joined" | "left" | "more" | "fewer";
  /** True when he had no minutes in any earlier game of the season, for any team. */
  debut: boolean;
  injury?: Injury;
};

export type LedgerGame = {
  id: string;
  opp: Abbr;
  venue: "home" | "away" | "neutral";
  won: boolean;
  /** Whether the model made this team the favourite before the game; null for an even game. */
  favored: boolean | null;
  /** Whether the team's counted margin beat the margin the model expected of it before the game. */
  beat: boolean;
};

/** One other game that day, what adding it to the fit did to this team, and which of its sides this team has played. */
export type OtherGame = { home: Abbr; away: Abbr; hs: number; as: number; points: number; met: Abbr[] };

/** One player's value change from his box score in the team's own game, times his share of the minutes. */
export type BoxPlayer = { athlete: number; name: string; points: number };

export type LedgerRow = {
  day: string;
  before: number;
  after: number;
  /** The change the page shows: the gap between the two rounded ratings. */
  change: number;
  game: LedgerGame | null;
  /**
   * The move in rating points, in the walk's three parts, which add up to it exactly. `result` is what the team's
   * own game did before its players' box scores counted, and the team part's shift when they did; `players` is
   * each player's value change from his box score plus what his change in counted minutes did; `others` is the
   * day's other games and the seed's daily fading.
   */
  raw: Record<WalkKey, number>;
  /** Each player of the rotation the team took into the day, and his value change from his box score. */
  box: BoxPlayer[];
  /** Players whose counted minutes changed, largest effect first. */
  players: PlayerMove[];
  /** The day's other games, largest effect on this team first. */
  others: OtherGame[];
  /** What the seed's daily fading did. */
  seed: number;
};

/** Whole numbers that add up to `total`, as close to `raw` as the largest-remainder rule allows. */
export function apportion<K extends string>(raw: Record<K, number>, total: number): Record<K, number> {
  const keys = Object.keys(raw) as K[];
  if (!keys.length) return {} as Record<K, number>;
  const floor = Object.fromEntries(keys.map((k) => [k, Math.floor(raw[k])])) as Record<K, number>;
  let left = total - keys.reduce((s, k) => s + floor[k], 0);
  const order = [...keys].sort((a, b) => (raw[b] - floor[b]) - (raw[a] - floor[a]));
  const out = { ...floor };
  for (let i = 0; left !== 0; i = (i + 1) % order.length) {
    const step = Math.sign(left);
    if (step < 0) { const k = [...order].reverse()[i]; out[k] -= 1; } else out[order[i]] += 1;
    left -= step;
  }
  return out;
}

const ledgers = new Map<string, LedgerRow[]>();

/** A team's rows for a season, worked out once per build: a team page and every game page of its season read them. */
export function ledger(season: SeasonView, abbr: Abbr): LedgerRow[] {
  const key = `${season.id} ${abbr}`;
  let rows = ledgers.get(key);
  if (!rows) ledgers.set(key, (rows = teamLedger(season, abbr)));
  return rows;
}

function teamLedger(season: SeasonView, abbr: Abbr): LedgerRow[] {
  const data = season.model.data;
  const inputs = seasonInputs(season.id) ?? {};
  const name = (athlete: number) => (athlete === NEWCOMER ? "Fill-ins" : playerName(athlete) ?? `#${athlete}`);
  const rawInjuries = INJURY_FILES[`../data/injuries/${season.id}.json`];
  const injuries = rawInjuries ? parseArchive(rawInjuries, season.id) : null;
  const scale = ELO_PER_SIGMA / PARAMS.sigma;
  /** Each game's pre-game chance for its home side. */
  const homeChance = new Map(season.model.results.map((r) => [r.game.id, r.p]));
  const { players: pl } = inputs;
  const days = fitSeasonSteps(data, seasonRule(inputs), { centres: inputs.centres, players: pl && { ...pl, lineups: pl.lineups.previous } }, abbr);
  const shown = shownLineups(data, pl?.rotation);
  const box = pl?.box.games ?? {};
  const rate = (fit: Fit, lineup: Lineup) => START + (fit.r[abbr] + playerPart(fit, lineup)) * scale;
  const lastDay = [...data.games].filter((g) => g.home === abbr || g.away === abbr).map((g) => dayKey(g.t)).sort().at(-1) ?? "";
  /** This team's opponents so far. */
  const met = new Set<Abbr>();
  /** Everyone with minutes in a game on an earlier day this season. */
  const seen = new Set<number>();

  let usual = shown.opening;
  if (!days.length) return [];
  let prevShown = rate(days[0].before, usual[abbr]);
  let heldAt: number | null = null;
  const rows: LedgerRow[] = [];

  for (const { day, games, before, after, priors, steps } of days) {
    const was = usual[abbr];
    usual = shown.after.get(day)!;
    const held = heldAt !== null;
    const shownNow = held ? heldAt! : rate(after, usual[abbr]);
    if (!held && lastDay === day) heldAt = shownNow;
    const pg = games.find((p) => p.game.home === abbr || p.game.away === abbr);
    const g = pg?.game;
    // The team's own game is the first step, fitted once before its players' box ratings move (`result`) and once after.
    const own = g ? steps[0] : undefined;
    const value = (fit: Fit, athlete: number) => (fit.v.get(athlete) ?? 0) * scale;
    const result = own?.result;
    const boxed: BoxPlayer[] = own && result
      ? was.map((p) => ({ athlete: p.athlete, name: name(p.athlete), points: (value(own.fit, p.athlete) - value(result, p.athlete)) * p.share }))
      : [];
    let at = rate(own?.fit ?? priors, was);
    const others: OtherGame[] = [];
    for (const step of steps.slice(own ? 1 : 0)) {
      const next = rate(step.fit, was);
      const og = step.game;
      others.push({ home: og.home, away: og.away, hs: og.hs, as: og.as, points: next - at, met: [og.home, og.away].filter((t) => met.has(t)) });
      at = next;
    }
    const seed = rate(priors, was) - rate(before, was) + rate(after, was) - rate(steps.at(-1)?.fit ?? priors, was);
    const minutes = rate(after, usual[abbr]) - rate(after, was);
    const boxPoints = boxed.reduce((s, p) => s + p.points, 0);
    const raw: Record<WalkKey, number> = held
      ? { result: 0, players: 0, others: 0 }
      : {
          result: own ? rate(own.fit, was) - rate(priors, was) - boxPoints : 0,
          players: boxPoints + minutes,
          others: seed + others.reduce((s, o) => s + o.points, 0),
        };
    const residual = shownNow - prevShown - (raw.result + raw.players + raw.others);
    if (Math.abs(residual) > 1e-6) throw new Error(`ledger ${season.id} ${abbr} ${day}: parts miss the move by ${residual}`);
    const change = shownChange(prevShown, shownNow);
    let game: LedgerGame | null = null;
    if (pg && g) {
      const home = g.home === abbr;
      const opp = home ? g.away : g.home;
      met.add(opp);
      // The score against the margin the chances priced, both in counted points for the home side.
      const surprise = counted(g.hs - g.as, PARAMS.margin) - expected(before, pg);
      game = {
        id: g.id, opp,
        venue: g.neutral ? "neutral" : home ? "home" : "away",
        won: home === g.hs > g.as,
        favored: favoredSide(homeChance.get(g.id), home),
        beat: home ? surprise > 0 : surprise < 0,
      };
    }
    const lines = g ? box[g.id]?.[abbr] : undefined;
    const report = (injuries?.days[day] ?? injuries?.days[addDays(day, 1)])?.injuries ?? [];
    const ids = new Set([...was, ...usual[abbr]].map((p) => p.athlete));
    const players: PlayerMove[] = held ? [] : [...ids].flatMap((athlete) => {
      const s0 = was.find((p) => p.athlete === athlete)?.share ?? 0;
      const s1 = usual[abbr].find((p) => p.athlete === athlete)?.share ?? 0;
      const points = (s1 - s0) * value(after, athlete);
      if (Math.abs(points) < 0.05) return [];
      const line = lines?.find((l) => l[0] === athlete);
      return [{
        athlete, name: name(athlete), before: s0 * 48, points,
        played: g ? (lines ? (line ? line[1] : null) : undefined) : undefined,
        status: s0 === 0 ? "joined" : s1 === 0 ? "left" : s1 > s0 ? "more" : "fewer",
        debut: !seen.has(athlete),
        injury: report.find((i) => i.athlete === athlete),
      } satisfies PlayerMove];
    }).sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
    if (g || change !== 0) {
      rows.push({
        day, before: prevShown, after: shownNow, change, game, raw, players, seed,
        box: held ? [] : boxed,
        others: others.sort((x, y) => Math.abs(y.points) - Math.abs(x.points)),
      });
    }
    for (const { game: dg } of games) for (const side of Object.values(box[dg.id] ?? {})) for (const l of side ?? []) if (l[1] > 0) seen.add(l[0]);
    prevShown = shownNow;
  }
  return rows;
}

/** The three parts a row's change is split into for showing: the team's own result, its players, and other games. */
export type WalkKey = "result" | "players" | "others";

/** One cause the walk steps through, at its true effect in rating points, with the few words that explain it. */
export type WalkItem = { kind: "team" | "player" | "other" | "seed"; name: string; points: number; phrase: string };

/** A line of the walk at its whole-point share: one item, or every item under a point folded into one closing line. */
export type WalkLine =
  | (WalkItem & { whole: number })
  /** `items` are the ones worth a tenth of a point or more, at their true effect; `points` counts the rest too. */
  | { kind: "group"; whole: number; points: number; phrase: string; items: WalkItem[] };

export type WalkPart = { key: WalkKey; label: string; whole: number; lines: WalkLine[] };

/**
 * What an opened row draws: its rating from `from` to `to`, through the team's result on a game day and each other
 * part whose whole figure isn't 0. `whole` holds all three parts, for the row's columns. `tipped` marks a small move that rounding made a whole point.
 */
export type Walk = { from: number; to: number; whole: Record<WalkKey, number>; parts: WalkPart[]; tipped: boolean };

const LABELS: Record<WalkKey, string> = { result: "Result", players: "Players", others: "Other games" };
const byMagnitude = (a: { points: number }, b: { points: number }) => Math.abs(b.points) - Math.abs(a.points);

/**
 * The team's result in a few words: where, and how it went against what the model expected. An upset says so
 * ("despite being favored", "despite being the underdog"); otherwise the score against the expected margin does,
 * joined as a player's phrase is: "and by more" when the result and the expectation agree (a win better than
 * expected, a loss worse), "but by less" when they pull apart. A favourite can't lose better than expected, nor an
 * underdog win worse, so these six cases are all of them. The phrase reads the score, not the Result's points: the
 * fit can move a team a point against a score a hair either side of what was expected.
 */
function resultPhrase(season: SeasonView, g: LedgerGame): string {
  const opp = team(season, g.opp);
  const place = opp.name.slice(0, opp.name.length - opp.short.length).trim() || opp.short;
  const where = g.venue === "home" ? "at home" : g.venue === "away" ? `at ${place}` : "on a neutral floor";
  const result = `${g.won ? "Won" : "Lost"} ${where}`;
  if (g.favored === true && !g.won) return `${result} despite being favored`;
  if (g.favored === false && g.won) return `${result} despite being the underdog`;
  return `${result} ${g.won === g.beat ? "and by more" : "but by less"} than expected`;
}

/** A team's side of a home chance: favoured above an even game, not below it, neither at exactly even or unknown. */
function favoredSide(p: number | undefined, home: boolean): boolean | null {
  if (p === undefined || p === 0.5) return null;
  return home ? p > 0.5 : p < 0.5;
}

/**
 * A player's whole day in a few plain words, from two signals: how he played (the sign of his value change from his
 * box score, left out under 0.1) and his minutes against what was expected (left out within 2 minutes). With both, "and"
 * joins them when the two effects push the rating the same way, "but" when they pull against each other.
 */
function playerPhrase(value: number, move: PlayerMove | undefined): string {
  if (move?.athlete === NEWCOMER) return "In the minutes of players out for weeks, at replacement level";
  // On a day off only the injury report or a player leaving moves the rotation.
  if (move && move.played === undefined) {
    if (move.status === "left" && move.injury) return `Out injured${move.injury.returnDate ? ` until ${shortDay(move.injury.returnDate)}` : ""}`;
    if (move.status === "more") return "Counted for more minutes";
    if (move.status === "fewer") return "Counted for fewer minutes";
  }
  if (move?.played === null) return move.injury ? `Out injured${move.injury.returnDate ? ` until ${shortDay(move.injury.returnDate)}` : ""}` : "Didn't play";
  const how = Math.abs(value) < 0.1 ? "" : value > 0 ? "well" : "poorly";
  if (move?.status === "joined" && move.debut) return how ? `Played ${how} in his first minutes of the season` : "First minutes of the season";
  const gap = move?.played != null ? move.played - move.before : 0;
  const long = Math.abs(gap) <= 2 ? "" : gap > 0 ? "longer" : "shorter";
  if (how && long) return `Played ${how} ${Math.sign(value) === Math.sign(move?.points ?? 0) ? "and" : "but"} for ${long} than expected`;
  if (how) return `Played ${how}`;
  if (long) return `Played for ${long} than expected`;
  return "About as expected";
}

/** "9 players under a point each", "2 games and the preseason estimate under a point each". */
function groupPhrase(items: WalkItem[], all: number): string {
  if (!items.length) return `${all} effect${all === 1 ? "" : "s"} under a tenth of a point${all > 1 ? " each" : ""}`;
  const counts = new Map<WalkItem["kind"], number>();
  for (const x of items) counts.set(x.kind, (counts.get(x.kind) ?? 0) + 1);
  const parts = [...counts].map(([kind, n]) => {
    if (kind === "seed") return "the preseason estimate";
    return `${n} ${kind === "player" ? "player" : "game"}${n === 1 ? "" : "s"}`;
  });
  const text = `${parts.join(" and ")} under a point${items.length > 1 ? " each" : ""}`;
  return text[0].toUpperCase() + text.slice(1);
}

/**
 * A part's lines: each item of a point or more (and the team's result) on its own, then one line for the rest. The
 * part's whole figure is split across them by the largest-remainder rule, so they add up to it. The closing line
 * lists its items of a tenth or more, and is left out when it has none and its share is 0.
 */
function partLines(items: WalkItem[], whole: number): WalkLine[] {
  // Judged at the tenth the drawer prints, so nothing in a line "under a point" reads as 1.0.
  const big = items.filter((x) => x.kind === "team" || Math.abs(x.points) >= 0.95).sort(byMagnitude);
  const rest = items.filter((x) => !big.includes(x));
  const restPoints = rest.reduce((s, x) => s + x.points, 0);
  const shares = apportion(Object.fromEntries([...big.map((x, i) => [String(i), x.points]), ["rest", restPoints]]), whole);
  const lines: WalkLine[] = big.map((x, i) => ({ ...x, whole: shares[String(i)] }));
  const listed = rest.filter((x) => Math.abs(x.points) >= 0.05).sort(byMagnitude);
  if (listed.length || shares.rest !== 0) lines.push({ kind: "group", whole: shares.rest, points: restPoints, phrase: groupPhrase(listed, rest.length), items: listed });
  return lines;
}

/**
 * A row as the walk draws it, in three parts that never show a player twice: the team's own result, each player's
 * whole effect (his value change from his box score plus his change in expected minutes), and other games. The
 * whole points are split again from those raw parts by the largest-remainder rule, so they still add up to the change.
 */
export function walk(season: SeasonView, row: LedgerRow): Walk {
  const whole = apportion(row.raw, row.change);
  const short = (abbr: Abbr) => team(season, abbr).short;

  const byAthlete = new Map<number, { name: string; box: number; move?: PlayerMove }>();
  for (const p of row.box) byAthlete.set(p.athlete, { name: p.name, box: p.points });
  for (const p of row.players) byAthlete.set(p.athlete, { name: p.name, box: byAthlete.get(p.athlete)?.box ?? 0, move: p });
  const players = [...byAthlete.values()].map(({ name, box, move }): WalkItem => (
    { kind: "player", name, points: box + (move?.points ?? 0), phrase: playerPhrase(box, move) }
  ));
  const others: WalkItem[] = [
    ...row.others.map((o): WalkItem => {
      const [w, l] = o.hs > o.as ? [o.home, o.away] : [o.away, o.home];
      return { kind: "other", name: `${short(w)} beat the ${short(l)}`, points: o.points, phrase: o.met.length > 1 ? "Both past opponents" : o.met.length ? "One a past opponent" : "" };
    }),
    { kind: "seed", name: "Preseason estimate", points: row.seed, phrase: "Fading a little, as it does each day" },
  ];
  const items: Record<WalkKey, WalkItem[]> = {
    result: row.game ? [{ kind: "team", name: LABELS.result, points: row.raw.result, phrase: resultPhrase(season, row.game) }] : [],
    players,
    others,
  };

  const parts = (Object.keys(LABELS) as WalkKey[])
    .filter((key) => whole[key] !== 0 || (key === "result" && row.game !== null))
    .map((key): WalkPart => ({ key, label: LABELS[key], whole: whole[key], lines: partLines(items[key], whole[key]) }));
  const real = row.after - row.before;
  return {
    from: Math.round(row.before), to: Math.round(row.after), whole, parts,
    tipped: Math.abs(real - row.change) >= 0.5 && Math.abs(real) < 1,
  };
}
