// The real games the about page draws to explain the model, picked from a season's results.
import { shownChange, type Abbr, type Result, type Snapshot } from "./elo.ts";
import { outcome, type Outcome } from "./facts.ts";

export type ContrastKind = "close" | "blowout" | "upset";
export type Contrast = { kind: ContrastKind; game: Outcome; margin: number };

const margin = (o: Outcome) => o.winner.score - o.loser.score;

/** The first game in `list` with the lowest `key`, so the earliest game wins a tie. */
const lowest = (list: readonly Outcome[], key: (o: Outcome) => number) =>
  list.reduce<Outcome | undefined>((best, o) => (best === undefined || key(o) < key(best) ? o : best), undefined);

/**
 * The games the about page draws: the season's first game, then three wins in the order the page compares
 * them. A favourite's close win comes first, then an underdog's win by the same margin, which differs from
 * it only in surprise, then the favourite's widest, which differs from the first in margin. The shared
 * margin is the narrowest that both a favourite and an underdog have won by, earliest game first; with none
 * yet, each takes its own narrowest. A kind with no game yet is left out; an even game has no favourite, so
 * it is never one of the three.
 */
export function examples(results: readonly Result[]) {
  const games = results.map(outcome);
  const favourites = games.filter((o) => o.winner.chance > 0.5);
  const underdogs = games.filter((o) => o.winner.chance < 0.5);
  const upsetMargins = new Set(underdogs.map(margin));
  const shared = lowest(favourites.filter((o) => upsetMargins.has(margin(o))), margin);
  const sameAs = (o: Outcome | undefined) => (o ? underdogs.filter((u) => margin(u) === margin(o)) : underdogs);
  const picks: [ContrastKind, Outcome | undefined][] = [
    ["close", shared ?? lowest(favourites, margin)],
    ["upset", lowest(sameAs(shared), margin)],
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
