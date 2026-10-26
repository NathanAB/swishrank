// Which team a pointer on the rating chart means: the day under it, then the team whose line is nearest in
// height on that day. The whole plot is one target, so a fingertip picks the closest line.

/** One team's line: its height on each day, in the plot's own units, first day first. */
export type PlotLine = { team: string; ys: ArrayLike<number> };

/**
 * The team whose line is nearest the point. `fx` is the point's place across the plot, 0 on the first day and
 * 1 on the last; `y` is its height in the lines' units. A tie goes to `prefer`, the picked team drawn on top,
 * and otherwise to the earlier line. Null only when there are no lines.
 */
export function nearestLine(lines: readonly PlotLine[], fx: number, y: number, prefer: string | null = null): string | null {
  let best: string | null = null;
  let gap = Infinity;
  for (const l of lines) {
    if (l.ys.length === 0) continue;
    const day = Math.round(fx * (l.ys.length - 1));
    const d = Math.abs(l.ys[day] - y);
    if (d < gap || (d === gap && l.team === prefer)) {
      best = l.team;
      gap = d;
    }
  }
  return best;
}
