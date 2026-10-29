// PROTOTYPE (team ledger): every move of a team's shown rating split into its parts, so each row adds up
// exactly to the change shown. Mirrors compute() in elo.ts day by day. Throwaway; see prototype/team-ledger.
import { ELO_PER_SIGMA, PARAMS, START, addDays, dayKey, fitSeasonSteps, playerPart, shownChange, shownLineups, type Abbr, type Fit } from "./elo.ts";
import { shortDay } from "./format.ts";
import { parseArchive, type Injury } from "./injuries.ts";
import type { Lineup } from "./players.ts";
import { seasonInputs, team, type SeasonView } from "./season.ts";

const NAME_FILES = import.meta.glob<Record<string, string>>("../data/prototype-names-*.json", { eager: true, import: "default" });
const INJURY_FILES = import.meta.glob<unknown>("../data/injuries/*.json", { eager: true, import: "default" });

export type PlayerMove = {
  athlete: number;
  name: string;
  /** Minutes a game the rating counted him for, before and after the day. */
  before: number;
  after: number;
  /** His value per 48 minutes, in rating points. */
  value: number;
  points: number;
  /** His minutes in the team's game that day, null when he did not play in it, undefined on a day off. */
  played?: number | null;
  status: "joined" | "left" | "more" | "fewer";
  /** True when he had no minutes in any earlier game of the season, for any team. */
  debut: boolean;
  injury?: Injury;
};

export type LedgerGame = {
  opp: Abbr; venue: "home" | "away" | "neutral"; won: boolean; us: number; them: number; id: string; stage: string | null;
  /** Whether the model made this team the favourite before the game; null for an even game. */
  favored: boolean | null;
};

/** The parts, in rating points: the team's own game, everyone else's games that day, and its players. */
export type Parts<T> = { game: T; others: T; rotation: T };

/** One other game that day, and what adding it to the fit did to this team. */
export type OtherGame = { home: Abbr; away: Abbr; hs: number; as: number; points: number; met: { abbr: Abbr; day: string; won: boolean }[] };

/** One player's value change from the team's own game, times his share of the minutes. */
export type OwnPlayer = { athlete: number; name: string; points: number };

export type LedgerRow = {
  day: string;
  before: number;
  after: number;
  /** The change the page shows: the gap between the two rounded ratings. */
  change: number;
  game: LedgerGame | null;
  raw: Parts<number>;
  /** Players whose counted minutes changed, largest effect first. */
  players: PlayerMove[];
  /** The day's other games, largest effect on this team first, and what the seed's daily fading did. */
  others: OtherGame[];
  priors: { raw: number };
  /** What the team's own game did: its team part, and each player's value change times his share of the minutes. */
  own: { team: number; players: OwnPlayer[] };
  held: boolean;
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

export function ledger(season: SeasonView, abbr: Abbr): LedgerRow[] {
  const data = season.model.data;
  const inputs = seasonInputs(season.id) ?? {};
  const names = NAME_FILES[`../data/prototype-names-${season.id}.json`] ?? {};
  const rawInjuries = INJURY_FILES[`../data/injuries/${season.id}.json`];
  const injuries = rawInjuries ? parseArchive(rawInjuries, season.id) : null;
  const scale = ELO_PER_SIGMA / PARAMS.sigma;
  /** Each game's pre-game chance for its home side. */
  const homeChance = new Map(season.model.results.map((r) => [r.game.id, r.p]));
  const { players: pl } = inputs;
  const days = fitSeasonSteps(data, PARAMS, { centres: inputs.centres, players: pl && { ...pl, lineups: pl.lineups.previous } }, abbr);
  const shown = shownLineups(data, pl?.rotation);
  const box = pl?.box.games ?? {};
  const rate = (fit: Fit, lineup: Lineup) => START + (fit.r[abbr] + playerPart(fit, lineup)) * scale;
  const lastDay = [...data.games].filter((g) => g.home === abbr || g.away === abbr).map((g) => dayKey(g.t)).sort().at(-1) ?? "";
  const met: { abbr: Abbr; day: string; won: boolean }[] = [];
  /** Everyone with minutes in a game on an earlier day this season. */
  const seen = new Set<number>();

  let usual = shown.opening;
  if (!days.length) return [];
  let prevShown = rate(days[0].before, usual[abbr]);
  let heldAt: number | null = null;
  const rows: LedgerRow[] = [];

  for (const { day, games, before, after, priors, steps } of days) {
    const old = usual;
    usual = shown.after.get(day)!;
    const was = old[abbr];
    const held = heldAt !== null;
    const shownNow = held ? heldAt! : rate(after, usual[abbr]);
    if (!held && lastDay === day) heldAt = shownNow;
    const g = games.find((pg) => pg.game.home === abbr || pg.game.away === abbr)?.game;
    let at = rate(priors, was);
    const own = g ? rate(steps[0].fit, was) - at : 0;
    const ownParts = {
      team: g ? (steps[0].fit.r[abbr] - priors.r[abbr]) * scale : 0,
      players: g ? was.map((p): OwnPlayer => {
        const v = (fit: Fit) => (fit.v.get(p.athlete) ?? 0) * p.share * scale;
        return { athlete: p.athlete, name: names[String(p.athlete)] ?? `#${p.athlete}`, points: v(steps[0].fit) - v(priors) };
      }) : [],
    };
    if (g) at = rate(steps[0].fit, was);
    const others: OtherGame[] = [];
    for (const step of steps.slice(g ? 1 : 0)) {
      const next = rate(step.fit, was);
      const og = step.game;
      others.push({ home: og.home, away: og.away, hs: og.hs, as: og.as, points: next - at, met: met.filter((m) => m.abbr === og.home || m.abbr === og.away) });
      at = next;
    }
    const priorMove = rate(priors, was) - rate(before, was) + rate(after, was) - rate(steps.at(-1)?.fit ?? priors, was);
    const raw: Parts<number> = held
      ? { game: 0, others: 0, rotation: 0 }
      : { game: own, others: priorMove + others.reduce((s, o) => s + o.points, 0), rotation: rate(after, usual[abbr]) - rate(after, was) };
    const residual = shownNow - prevShown - (raw.game + raw.others + raw.rotation);
    if (Math.abs(residual) > 1e-6) throw new Error(`ledger ${season.id} ${abbr} ${day}: parts miss the move by ${residual}`);
    const change = shownChange(prevShown, shownNow);
    if (g) met.push({ abbr: g.home === abbr ? g.away : g.home, day, won: (g.home === abbr) === (g.hs > g.as) });
    const game: LedgerGame | null = g
      ? {
          id: g.id, stage: g.note,
          opp: g.home === abbr ? g.away : g.home,
          venue: g.neutral ? "neutral" : g.home === abbr ? "home" : "away",
          won: (g.home === abbr) === (g.hs > g.as),
          us: g.home === abbr ? g.hs : g.as, them: g.home === abbr ? g.as : g.hs,
          favored: favoredSide(homeChance.get(g.id), g.home === abbr),
        }
      : null;
    const lines = g ? box[g.id]?.[abbr] : undefined;
    const report = (injuries?.days[day] ?? injuries?.days[addDays(day, 1)])?.injuries ?? [];
    const ids = new Set([...was, ...usual[abbr]].map((p) => p.athlete));
    const players: PlayerMove[] = held ? [] : [...ids].flatMap((athlete) => {
      const s0 = was.find((p) => p.athlete === athlete)?.share ?? 0;
      const s1 = usual[abbr].find((p) => p.athlete === athlete)?.share ?? 0;
      const value = (after.v.get(athlete) ?? 0) * scale;
      const points = (s1 - s0) * value;
      if (Math.abs(points) < 0.05) return [];
      const line = lines?.find((l) => l[0] === athlete);
      return [{
        athlete, name: names[String(athlete)] ?? `#${athlete}`, before: s0 * 48, after: s1 * 48, value, points,
        played: g ? (lines ? (line ? line[1] : null) : undefined) : undefined,
        status: s0 === 0 ? "joined" : s1 === 0 ? "left" : s1 > s0 ? "more" : "fewer",
        debut: !seen.has(athlete),
        injury: report.find((i) => i.athlete === athlete),
      } satisfies PlayerMove];
    }).sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
    if (g || change !== 0) {
      rows.push({
        day, before: prevShown, after: shownNow, change, game, raw, players, held,
        others: others.sort((x, y) => Math.abs(y.points) - Math.abs(x.points)),
        priors: { raw: priorMove },
        own: held ? { team: 0, players: [] } : ownParts,
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
 * What an opened row draws: its rating from `from` to `to`, through each part whose whole figure isn't 0. `whole`
 * holds all three parts, for the row's columns. `tipped` marks a small move that rounding made a whole point.
 */
export type Walk = { from: number; to: number; whole: Record<WalkKey, number>; parts: WalkPart[]; tipped: boolean };

const LABELS: Record<WalkKey, string> = { result: "Result", players: "Players", others: "Other games" };
const byMagnitude = (a: { points: number }, b: { points: number }) => Math.abs(b.points) - Math.abs(a.points);

/**
 * The team's result in a few words: where, and how it went against what the model expected. An upset says so
 * ("despite being favored", "despite being the underdog"); otherwise the margin did, joined as a player's phrase is:
 * "and by more" when the result and the expectation agree (a win better than expected, a loss worse), "but by
 * less" when they pull apart. A favourite can't lose better than expected, nor an underdog win worse, so these six
 * cases are all of them. The score itself is on the row.
 */
function resultPhrase(season: SeasonView, g: LedgerGame, points: number): string {
  const opp = team(season, g.opp);
  const place = opp.name.slice(0, opp.name.length - opp.short.length).trim() || opp.short;
  const where = g.venue === "home" ? "at home" : g.venue === "away" ? `at ${place}` : "on a neutral floor";
  const result = `${g.won ? "Won" : "Lost"} ${where}`;
  if (g.favored === true && !g.won) return `${result} despite being favored`;
  if (g.favored === false && g.won) return `${result} despite being the underdog`;
  return `${result} ${g.won === points >= 0 ? "and by more" : "but by less"} than expected`;
}

/** A team's side of a home chance: favoured above an even game, not below it, neither at exactly even or unknown. */
function favoredSide(p: number | undefined, home: boolean): boolean | null {
  if (p === undefined || p === 0.5) return null;
  return home ? p > 0.5 : p < 0.5;
}

/**
 * A player's whole day in a few plain words, from two signals: how he played (the sign of his value change from the
 * game, left out under 0.1) and his minutes against what was expected (left out within 2 minutes). With both, "and"
 * joins them when the two effects push the rating the same way, "but" when they pull against each other.
 */
function playerPhrase(value: number, move: PlayerMove | undefined): string {
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
 * whole effect (his value change from the game plus his change in expected minutes), and other games. The whole
 * points are split again from those raw parts by the largest-remainder rule, so they still add up to the change.
 */
export function walk(season: SeasonView, row: LedgerRow): Walk {
  const raw: Record<WalkKey, number> = { result: row.own.team, players: row.raw.game - row.own.team + row.raw.rotation, others: row.raw.others };
  const whole = apportion(raw, row.change);
  const short = (abbr: Abbr) => team(season, abbr).short;

  const byAthlete = new Map<number, { name: string; own: number; move?: PlayerMove }>();
  for (const p of row.own.players) byAthlete.set(p.athlete, { name: p.name, own: p.points });
  for (const p of row.players) byAthlete.set(p.athlete, { name: p.name, own: byAthlete.get(p.athlete)?.own ?? 0, move: p });
  const players = [...byAthlete.values()].map(({ name, own, move }): WalkItem => (
    { kind: "player", name, points: own + (move?.points ?? 0), phrase: playerPhrase(own, move) }
  ));
  const others: WalkItem[] = [
    ...row.others.map((o): WalkItem => {
      const [w, l] = o.hs > o.as ? [o.home, o.away] : [o.away, o.home];
      const known = new Set(o.met.map((m) => m.abbr)).size;
      return { kind: "other", name: `${short(w)} beat the ${short(l)}`, points: o.points, phrase: known > 1 ? "Both past opponents" : known ? "One a past opponent" : "" };
    }),
    { kind: "seed", name: "Preseason estimate", points: row.priors.raw, phrase: "Fading a little, as it does each day" },
  ];
  const items: Record<WalkKey, WalkItem[]> = {
    result: row.game ? [{ kind: "team", name: LABELS.result, points: row.own.team, phrase: resultPhrase(season, row.game, row.own.team) }] : [],
    players,
    others,
  };

  const parts = (Object.keys(LABELS) as WalkKey[])
    .filter((key) => whole[key] !== 0)
    .map((key): WalkPart => ({ key, label: LABELS[key], whole: whole[key], lines: partLines(items[key], whole[key]) }));
  const real = row.after - row.before;
  return {
    from: Math.round(row.before), to: Math.round(row.after), whole, parts,
    tipped: Math.abs(real - row.change) >= 0.5 && Math.abs(real) < 1,
  };
}
