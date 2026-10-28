// What the hover box on a rating chart says: a team's rating and rank on the day under the pointer, read back
// off the lines as drawn, so the box always agrees with the line beside it. Lines are drawn through the
// displayed (rounded) ratings, so reading one back and rounding gives the displayed rating exactly.
import type { PlotLine } from "./pick.ts";

/** Two ratings and the heights the chart draws them at, which fix its linear scale. */
export type Scale = { hi: number; yHi: number; lo: number; yLo: number };

/** The scale as a chart writes it in its data-scale attribute: "hi yHi lo yLo". */
export const scaleAttr = (s: Scale) => [s.hi, s.yHi.toFixed(2), s.lo, s.yLo.toFixed(2)].join(" ");

export function parseScale(attr: string): Scale | null {
  const [hi, yHi, lo, yLo] = attr.split(" ").map(Number);
  return [hi, yHi, lo, yLo].every(Number.isFinite) ? { hi, yHi, lo, yLo } : null;
}

/** A league rank, with whether another team shares it. */
export type Place = { rank: number; tied: boolean };

/** A line's league rank by day as a chart writes it in its data-ranks attribute: "3,3t", tied 3rd on the second day. */
export const ranksAttr = (days: readonly Place[]) => days.map((d) => `${d.rank}${d.tied ? "t" : ""}`).join(",");

export const parseRanks = (attr: string): Place[] => attr.split(",").map((s) => ({ rank: parseInt(s, 10), tied: s.endsWith("t") }));

/** The displayed rating at height `y`. A scale whose two heights meet holds one rating, its `hi`. */
export const ratingAt = (y: number, s: Scale) => Math.round(s.yHi === s.yLo ? s.hi : s.hi + ((y - s.yHi) * (s.lo - s.hi)) / (s.yLo - s.yHi));

/**
 * `team`'s rating on day `day` and its standard competition rank among the drawn lines: equal ratings share a
 * rank, as in the league table. Null when the team has no line or the line no such day.
 */
export function readout(lines: readonly PlotLine[], scale: Scale, day: number, team: string): { rating: number; rank: number; tied: boolean } | null {
  const mine = lines.find((l) => l.team === team);
  if (!mine || day < 0 || day >= mine.ys.length) return null;
  const rating = ratingAt(mine.ys[day], scale);
  const others = lines.filter((l) => l !== mine && day < l.ys.length).map((l) => ratingAt(l.ys[day], scale));
  return { rating, rank: 1 + others.filter((r) => r > rating).length, tied: others.includes(rating) };
}
