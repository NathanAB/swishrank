// Facts the pages show, derived from compute()'s season model. Every per-game change here is the
// displayed one (shownChange), so a list and a table that show the same game agree.
import { addDays, ranksOf, shownChange, type Abbr, type Result, type Season, type Snapshot } from "./elo.ts";
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

/** The days the home page's weekly change covers: the ones before today. */
export const WEEK_DAYS = 7;

/**
 * A week's move this many displayed points or more stands out. In 2023-24 to 2025-26 the median team's week moved 7
 * points and a quarter of team-weeks moved 15 or more.
 */
export const NOTABLE_MOVE = 15;

/** Each team's change in displayed rating over a week, between the ratings it started and ended with. */
export type Week = { from: Snapshot; to: Snapshot; change: Record<Abbr, number> };

/**
 * The WEEK_DAYS before `today`: from the ratings at the end of the day before the week began, or the seeds while the
 * season is younger, to the latest ratings. A week with no games, such as the All-Star break, changes
 * nothing. Null before the season has a day.
 */
export function weekChange(model: Pick<Season, "abbrs" | "series">, today: string): Week | null {
  const to = model.series.at(-1);
  if (!to) return null;
  const start = addDays(today, -WEEK_DAYS);
  const from = model.series.findLast((d) => d.day < start) ?? model.series[0];
  return { from, to, change: Object.fromEntries(model.abbrs.map((a) => [a, shownChange(from.r[a], to.r[a])])) };
}

/**
 * The week of `teams` in a sentence or two: the biggest rise, the biggest fall and a new team alone in first place,
 * with every team tied for a biggest move named. `conference` names where the teams play, for its own first place.
 * Null when none of them moved.
 */
export function weekFinding(model: Pick<Season, "data">, week: Week, teams: readonly Abbr[], conference?: string): string | null {
  const name = (a: Abbr) => `the ${model.data.teams[a].short}`;
  const list = (xs: readonly Abbr[]) => (xs.length === 1 ? name(xs[0]) : `${xs.slice(0, -1).map(name).join(", ")} and ${name(xs[xs.length - 1])}`);
  const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  const scope = conference ? `the ${conference}` : "the league";
  const first = conference ? `first place in the ${conference}` : "first place";
  const { change } = week;
  const best = Math.max(...teams.map((a) => change[a]));
  const worst = Math.min(...teams.map((a) => change[a]));
  const risers = best > 0 ? teams.filter((a) => change[a] === best) : [];
  const fallers = worst < 0 ? teams.filter((a) => change[a] === worst) : [];
  // First place is the teams ranked first on displayed ratings; only a team alone there takes it.
  const firsts = (r: Record<Abbr, number>) => {
    const ranks = ranksOf(Object.fromEntries(teams.map((a) => [a, r[a]])));
    return teams.filter((a) => ranks[a] === 1);
  };
  const before = firsts(week.from.r);
  const after = firsts(week.to.r);
  const taker = after.length === 1 && !before.includes(after[0]) ? after[0] : null;
  const loser = taker && before.length === 1 ? before[0] : null;

  const parts: string[] = [];
  let told = false;
  if (risers.length) {
    const takes = risers.length === 1 && risers[0] === taker;
    told = takes;
    parts.push(`${sentence(list(risers))} rose ${points(best)} this week, ${risers.length > 1 ? "tied for the most" : "the most"} in ${scope}${takes ? `, and took ${first}` : ""}.`);
  }
  if (fallers.length) {
    const loses = taker !== null && fallers.length === 1 && fallers[0] === loser;
    parts.push(`${sentence(list(fallers))} fell ${risers.length ? -worst : points(-worst)}${loses ? (told ? ` and lost ${first}` : ` and lost ${first} to ${name(taker)}`) : ""}.`);
    told ||= loses;
  }
  if (taker && !told) parts.push(`${sentence(name(taker))} took ${first}${loser ? ` from ${name(loser)}` : ""}.`);
  return parts.length ? parts.join(" ") : null;
}
