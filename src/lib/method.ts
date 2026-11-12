// The real games the about page draws to explain the model, picked from a season's results.
import { shownChange, type Abbr, type Result, type Snapshot } from "./elo.ts";
import { outcome, type Outcome } from "./facts.ts";

export type ContrastKind = "close" | "blowout" | "upset";
export type Contrast = { kind: ContrastKind; game: Outcome; margin: number };

const margin = (o: Outcome) => o.winner.score - o.loser.score;

/** The first game in `list` with the lowest `key`, so the earliest game wins a tie. */
const lowest = (list: readonly Outcome[], key: (o: Outcome) => number) =>
  list.reduce<Outcome | undefined>((best, o) => (best === undefined || key(o) < key(best) ? o : best), undefined);

const mean = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * A favourite's win and an underdog's by the same margin that show what the two earn on the whole: of every such
 * pair where the underdog's earned more, the one whose two gains are nearest the season's mean gain for each
 * kind, the narrower margin and the earlier games first on a tie. One game's change also turns on how far into
 * the season it came and who sat out, so a pair taken by margin alone can show the reverse, and the widest gap
 * would overstate it (upsetRatio).
 */
function surprisePair(favourites: readonly Outcome[], underdogs: readonly Outcome[]): [Outcome, Outcome] | undefined {
  const gain = (o: Outcome) => o.winner.change;
  const usual = { f: mean(favourites.map(gain)), u: mean(underdogs.map(gain)) };
  let best: { pair: [Outcome, Outcome]; off: number } | undefined;
  for (const m of [...new Set(favourites.map(margin))].sort((a, b) => a - b)) {
    const dogs = underdogs.filter((u) => margin(u) === m);
    for (const f of favourites.filter((o) => margin(o) === m)) {
      for (const u of dogs) {
        const off = Math.abs(gain(f) - usual.f) + Math.abs(gain(u) - usual.u);
        if (gain(u) > gain(f) && (!best || off < best.off)) best = { pair: [f, u], off };
      }
    }
  }
  return best?.pair;
}

/**
 * How many times a favourite's gain an underdog's win earns, on average over every win of each: about 2 in
 * 2025-26 and 2026-27. Null until both have won and the favourites' wins gain on average.
 */
export function upsetRatio(results: readonly Result[]): number | null {
  const games = results.map(outcome);
  const gains = (keep: (chance: number) => boolean) => games.filter((o) => keep(o.winner.chance)).map((o) => o.winner.change);
  const favourites = gains((c) => c > 0.5), underdogs = gains((c) => c < 0.5);
  if (favourites.length === 0 || underdogs.length === 0 || mean(favourites) <= 0) return null;
  return mean(underdogs) / mean(favourites);
}

/**
 * The games the about page draws: the season's first game, then three wins in the order the page compares
 * them. A favourite's win comes first, then an underdog's win by the same margin, which differs from it only
 * in surprise and earned more (surprisePair), then the favourite's widest, which differs from the first in
 * margin. With no such pair yet, the first is the favourite's narrowest win and the underdog's is left out. A
 * kind with no game yet is left out; an even game has no favourite, so it is never one of the three.
 */
export function examples(results: readonly Result[]) {
  const games = results.map(outcome);
  const favourites = games.filter((o) => o.winner.chance > 0.5);
  const underdogs = games.filter((o) => o.winner.chance < 0.5);
  const pair = surprisePair(favourites, underdogs);
  const picks: [ContrastKind, Outcome | undefined][] = [
    ["close", pair?.[0] ?? lowest(favourites, margin)],
    ["upset", pair?.[1]],
    ["blowout", lowest(favourites, (o) => -margin(o))],
  ];
  return {
    opener: games[0] ?? null,
    contrasts: picks.flatMap(([kind, game]): Contrast[] => (game ? [{ kind, game, margin: margin(game) }] : [])),
  };
}

export type OffDay = { abbr: Abbr; day: string; change: number; beaten: Outcome; win: Outcome };

/**
 * A team that rose on a day it did not play because a team it had beaten won that day, which shows each
 * morning's fit re-reading every past game: the biggest such rise, earliest first on a tie. `beaten` is the
 * team's earlier win and `win` the beaten team's win that day; of several, the one that lifted the beaten
 * team most. Null until a season has such a day, and always null under the site's model since 2026-11-01, in
 * which a team's rating moves only on its own game days (elo.ts PARAMS `idle`).
 */
export function offDay(results: readonly Result[], series: readonly Snapshot[]): OffDay | null {
  const games = results.map(outcome);
  let best: OffDay | null = null;
  for (let i = 1; i < series.length; i++) {
    const { day, r } = series[i];
    const before = series[i - 1].r;
    const today = games.filter((o) => o.result.day === day);
    const wins = new Map(today.map((o) => [o.winner.abbr, o]));
    const played = new Set(today.flatMap((o) => [o.winner.abbr, o.loser.abbr]));
    for (const abbr of Object.keys(r)) {
      const change = shownChange(before[abbr], r[abbr]);
      if (played.has(abbr) || change <= (best?.change ?? 0)) continue;
      const beaten = lowest(
        games.filter((o) => o.result.day < day && o.winner.abbr === abbr && wins.has(o.loser.abbr)),
        (o) => -wins.get(o.loser.abbr)!.winner.change,
      );
      if (beaten) best = { abbr, day, change, beaten, win: wins.get(beaten.loser.abbr)! };
    }
  }
  return best;
}
