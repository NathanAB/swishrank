// Facts the pages show, derived from compute()'s season model. Every per-game change here is the
// displayed one (shownChange), so a list and a table that show the same game agree.
import { shownChange, type Abbr, type Result, type Season } from "./elo.ts";

export type Side = "h" | "a";

/** One team's side of a final game, as the reader sees it. */
export type Line = {
  abbr: Abbr;
  side: Side;
  score: number;
  /** Pre-game win chance, 0 to 1. */
  chance: number;
  /** Rating change as displayed: the gap between the rounded ratings before and after. */
  change: number;
  /** Rating after the game, unrounded. */
  rating: number;
  won: boolean;
};

export type Outcome = { result: Result; home: Line; away: Line; winner: Line; loser: Line };

export function outcome(result: Result): Outcome {
  const { game, p, pre, post } = result;
  const homeScore = game.hs;
  const awayScore = game.as;
  // compute() only makes results from scored finals; elo.ts's Game type cannot say so.
  if (homeScore === null || awayScore === null) throw new Error(`Game ${game.id} has a result but no score`);
  const homeWon = homeScore > awayScore;
  const line = (side: Side): Line => ({
    abbr: side === "h" ? game.home : game.away,
    side,
    score: side === "h" ? homeScore : awayScore,
    chance: side === "h" ? p : 1 - p,
    change: shownChange(pre[side], post[side]),
    rating: post[side],
    won: side === "h" ? homeWon : !homeWon,
  });
  const home = line("h");
  const away = line("a");
  return { result, home, away, winner: homeWon ? home : away, loser: homeWon ? away : home };
}

/**
 * The lowest and highest displayed rating any team has held this season, today included, so a scale over it
 * fits every day of every team's line. It always holds the 1500 every team starts at.
 */
export function ratingRange(model: Season): { lo: number; hi: number } {
  const all = model.abbrs.flatMap((a) => [model.stats[a].lo, model.stats[a].hi, model.r[a]]).map(Math.round);
  return { lo: Math.min(...all), hi: Math.max(...all) };
}

/** The first day of the playoffs proper (play-in games come before it), if they have started. */
export const playoffsStart = (model: Season) => model.results.find((r) => /1st Round/.test(r.game.note ?? ""))?.day ?? null;
