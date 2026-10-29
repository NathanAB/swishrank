// Games still to play, priced on the ratings as they stand now: nothing here moves a rating before tip-off,
// so a game five days out gets the same chances it would get if it were played tonight, apart from a back-to-back,
// which the schedule already shows.
import { addDays, dayKey, gap, played, winProb, type Abbr, type Game, type Season } from "./elo.ts";
import type { Side } from "./facts.ts";

export type FixtureLine = {
  side: Side;
  abbr: Abbr;
  /** Win chance on current ratings, 0 to 1. */
  chance: number;
};

export type Fixture = {
  game: Game;
  /** Away first, then home, the order a schedule reads in ("Magic at Knicks"). */
  lines: readonly [FixtureLine, FixtureLine];
  /** The side given 50% or more; the home side when the two are dead level. */
  fav: Side;
};

export type FixtureDay = { day: string; fixtures: Fixture[] };

/** The days the games page looks ahead: today and the six after it. */
export const WEEK = 7;

/** A game priced on `model`'s current pricing ratings, home edge and back-to-back term, and the games each side has played. */
export const fixture = (game: Game, model: Pick<Season, "pricing" | "home" | "log" | "b2b">): Fixture =>
  priced(game, winProb(gap(game, model.pricing, model.home) + model.b2b[game.id], played(model.log, game)));

/** A game with `p`, the home side's chance. */
export function priced(game: Game, p: number): Fixture {
  return {
    game,
    lines: [
      { side: "a", abbr: game.away, chance: 1 - p },
      { side: "h", abbr: game.home, chance: p },
    ],
    fav: p >= 0.5 ? "h" : "a",
  };
}

/** The game days among the `count` US Eastern days from `today`, each with its games in tip-off order. */
export function nextDays(model: Season, today: string, count: number): FixtureDay[] {
  const end = addDays(today, count);
  return fixtureDays(model, model.upcoming.filter((g) => dayKey(g.t) >= today && dayKey(g.t) < end));
}

/** `games` priced on `model`'s current ratings and grouped by US Eastern day, in tip-off order. */
export function fixtureDays(model: Season, games: readonly Game[]): FixtureDay[] {
  const days = new Map<string, Fixture[]>();
  for (const g of [...games].sort((x, y) => x.t.localeCompare(y.t))) days.set(dayKey(g.t), [...(days.get(dayKey(g.t)) ?? []), fixture(g, model)]);
  return [...days].map(([day, fixtures]) => ({ day, fixtures }));
}
