// How it works, step 1 (components/explain/SeasonFan.astro): the season's lines drawn left to right in one sweep,
// and the two teams labelled at the right end.

/**
 * The day a sweep across a season's plot of `days` daily points is drawing when its front is `p` of the way
 * across (0 to 1): the day whose games move the lines from the point before to the next. The first point is the
 * eve of opening night, every team at 1000, so the sweep names opening night first and lands on the last day.
 */
export const sweepDay = (p: number, days: number) => Math.min(days - 1, Math.max(1, Math.ceil(p * (days - 1))));

/** Two end labels' heights, top then bottom, pushed apart around their middle when closer than `pitch`. */
export function spread(top: number, bottom: number, pitch: number): [number, number] {
  const room = Math.max(0, pitch - (bottom - top)) / 2;
  return [top - room, bottom + room];
}
