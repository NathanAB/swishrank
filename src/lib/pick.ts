// Which team a pointer on the rating chart means: the team whose line, as drawn between days, is nearest in
// height at the point. The whole plot is one target, so a fingertip picks the closest line.

/** One team's line: its height on each day, in the plot's own units, first day first. */
export type PlotLine = { team: string; ys: ArrayLike<number> };

/** The day under a point `fx` across a plot of `days` days (0 on the first day, 1 on the last), kept on the plot. */
export const dayAt = (fx: number, days: number) => Math.min(days - 1, Math.max(0, Math.round(fx * (days - 1))));

/** A line's height at `fx`, along the straight segment between the two days either side, kept on the plot. */
const heightAt = (ys: ArrayLike<number>, fx: number) => {
  const at = Math.min(1, Math.max(0, fx)) * (ys.length - 1);
  const i = Math.floor(at);
  return i >= ys.length - 1 ? ys[ys.length - 1] : ys[i] + (ys[i + 1] - ys[i]) * (at - i);
};

/**
 * The team whose line is nearest the point. `fx` is the point's place across the plot, 0 on the first day and
 * 1 on the last; `y` is its height in the lines' units. A tie goes to the earlier line. Null only when there
 * are no lines.
 */
export function nearestLine(lines: readonly PlotLine[], fx: number, y: number): string | null {
  let best: string | null = null;
  let gap = Infinity;
  for (const l of lines) {
    if (l.ys.length === 0) continue;
    const d = Math.abs(heightAt(l.ys, fx) - y);
    if (d < gap) {
      best = l.team;
      gap = d;
    }
  }
  return best;
}
