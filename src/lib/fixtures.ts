// Games still to play, priced on the ratings as they stand now: nothing here moves a rating before tip-off,
// so a game five days out gets the same chances it would get if it were played tonight.
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

/** The days the site looks ahead: today and the six after it. The data holds a day more than this. */
export const WEEK = 7;

/** A game priced on `model`'s current ratings and home edge, and the games each side has played. */
export function fixture(game: Game, model: Pick<Season, "r" | "home" | "log">): Fixture {
  const p = winProb(gap(game, model.r, model.home), played(model.log, game));
  return {
    game,
    lines: [
      { side: "a", abbr: game.away, chance: 1 - p },
      { side: "h", abbr: game.home, chance: p },
    ],
    fav: p >= 0.5 ? "h" : "a",
  };
}

/** `count` US Eastern days from `today`, each with its games in tip-off order. A day without games stays, empty. */
export function nextDays(model: Season, today: string, count: number): FixtureDay[] {
  const games = [...model.upcoming].sort((x, y) => x.t.localeCompare(y.t));
  return Array.from({ length: count }, (_, i) => {
    const day = addDays(today, i);
    return { day, fixtures: games.filter((g) => dayKey(g.t) === day).map((g) => fixture(g, model)) };
  });
}
