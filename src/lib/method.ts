// The real games the about page draws to explain the model, picked from a season's results.
import type { Result } from "./elo.ts";
import { outcome, type Outcome } from "./facts.ts";

export type ContrastKind = "close" | "blowout" | "upset";
export type Contrast = { kind: ContrastKind; game: Outcome; margin: number };

const margin = (o: Outcome) => o.winner.score - o.loser.score;

/** The first game in `list` with the lowest `key`, so the earliest game wins a tie. */
const lowest = (list: readonly Outcome[], key: (o: Outcome) => number) =>
  list.reduce<Outcome | undefined>((best, o) => (best === undefined || key(o) < key(best) ? o : best), undefined);

/**
 * The games the about page draws: the season's first game, then three wins in the order the page compares
 * them. The favourite's narrowest win comes first, then the underdog's narrowest, which differs from it in
 * surprise, then the favourite's widest, which differs from it in margin. A kind with no game yet is left
 * out; an even game has no favourite, so it is never one of the three.
 */
export function examples(results: readonly Result[]) {
  const games = results.map(outcome);
  const favourites = games.filter((o) => o.winner.chance > 0.5);
  const underdogs = games.filter((o) => o.winner.chance < 0.5);
  const picks: [ContrastKind, Outcome | undefined][] = [
    ["close", lowest(favourites, margin)],
    ["upset", lowest(underdogs, margin)],
    ["blowout", lowest(favourites, (o) => -margin(o))],
  ];
  return {
    opener: games[0] ?? null,
    contrasts: picks.flatMap(([kind, game]): Contrast[] => (game ? [{ kind, game, margin: margin(game) }] : [])),
  };
}
