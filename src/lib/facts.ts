// Facts the pages show, derived from compute()'s season model. Every per-game change here is the
// displayed one (shownChange), so a list and a table that show the same game agree.
import { addDays, ranksOf, shownChange, type Abbr, type Result, type Season } from "./elo.ts";
import { percent, points } from "./format.ts";

export type Side = "h" | "a";

/** One team's side of a final game, as the reader sees it. */
export type Line = {
  abbr: Abbr;
  side: Side;
  score: number;
  /** Pre-game win chance, 0 to 1. */
  chance: number;
  /** Rating change as displayed: the gap between the rounded ratings the team ended the day before and the game's day with. */
  change: number;
  /** The team's rating on the chart at the end of the game's day, unrounded. */
  rating: number;
  won: boolean;
};

export type Outcome = { result: Result; home: Line; away: Line; winner: Line; loser: Line };

export function outcome(result: Result): Outcome {
  const { game, p, pre, post, shown } = result;
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
    rating: shown[side],
    won: side === "h" ? homeWon : !homeWon,
  });
  const home = line("h");
  const away = line("a");
  return { result, home, away, winner: homeWon ? home : away, loser: homeWon ? away : home };
}

/**
 * Whether the win was an upset: the winner's pre-game chance shows under UPSET percent. A third of all winners
 * had under 50% in 2023-24 to 2025-26, too many to call out; under 35% it is about one game in nine. The
 * chance as shown decides, so a 34.6% winner shown at 35% is not one.
 */
export const UPSET = 35;
export const upset = (o: Outcome) => percent(o.winner.chance) < UPSET;

/**
 * The lowest and highest displayed rating any team has held this season, today included, so a scale over it
 * fits every day of every team's line, its preseason seed included.
 */
export function ratingRange(model: Season): { lo: number; hi: number } {
  const all = model.abbrs.flatMap((a) => [model.stats[a].lo, model.stats[a].hi, model.r[a]]).map(Math.round);
  return { lo: Math.min(...all), hi: Math.max(...all) };
}

/** Each team's change in displayed rating over the week to the latest day, and the day it is measured from. */
export type Week = { from: string; change: Record<Abbr, number> };

/** How far back the home page's weekly change looks, in days. */
const WEEK_BACK = 7;

/**
 * The week's change: from the last day at least WEEK_BACK days before the latest one, or from the season's first
 * day while it is younger than that, so the first week reads from each team's seed.
 */
export function weekChange(model: Pick<Season, "abbrs" | "series">): Week | null {
  const last = model.series.at(-1);
  if (!last) return null;
  const cutoff = addDays(last.day, -WEEK_BACK);
  const then = model.series.findLast((d) => d.day <= cutoff) ?? model.series[0];
  return { from: then.day, change: Object.fromEntries(model.abbrs.map((a) => [a, Math.round(last.r[a]) - Math.round(then.r[a])])) };
}

/**
 * The week in a sentence or two: the biggest rise, the biggest fall, and a new team at the top. Null when no team
 * moved.
 */
export function weekFinding(model: Pick<Season, "abbrs" | "series" | "data">, week: Week): string | null {
  const the = (a: Abbr) => `the ${model.data.teams[a].short}`;
  const The = (a: Abbr) => `The ${model.data.teams[a].short}`;
  const { change } = week;
  const most = (pick: (a: number, b: number) => number) => model.abbrs.reduce((m, a) => pick(change[a], change[m]) > 0 ? a : m);
  const up = most((a, b) => a - b);
  const down = most((a, b) => b - a);
  const tied = (a: Abbr) => model.abbrs.some((b) => b !== a && change[b] === change[a]);
  // The top is the one team ranked first on displayed ratings; a tie for first has no one at the top.
  const top = (r: Record<Abbr, number>) => {
    const firsts = Object.entries(ranksOf(r)).filter(([, rank]) => rank === 1);
    return firsts.length === 1 ? firsts[0][0] : null;
  };
  const before = model.series.find((d) => d.day === week.from);
  const now = model.series.at(-1);
  if (!before || !now) return null;
  const was = top(before.r);
  const is = top(now.r);
  const newTop = is !== null && was !== is ? is : null;

  const parts: string[] = [];
  if (change[up] > 0) {
    parts.push(`${The(up)} rose ${points(change[up])} this week, ${tied(up) ? "tied for the most" : "the most"} in the league${newTop === up ? " and took first place" : ""}.`);
  }
  if (change[down] < 0) {
    const lost = newTop && was === down ? (newTop === up ? " and lost first place" : ` and lost first place to ${the(newTop)}`) : "";
    parts.push(`${The(down)} fell ${points(-change[down])}${lost}.`);
  }
  if (newTop && newTop !== up && was !== down) parts.push(`${The(newTop)} took first place.`);
  return parts.length ? parts.join(" ") : null;
}
