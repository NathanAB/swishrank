// What the two drawings of the season's ratings share: the rating chart's card and the chart built into the
// league table label their dates and mark the playoffs the same way.
import type { Season } from "./elo.ts";
import { playoffsStart } from "./facts.ts";
import { monthShort, shortDay } from "./format.ts";

/** Date labels on one step that lands on the last day: month starts for a long season, days for a short one. */
export function dateTicks(days: readonly string[]): { i: number; text: string }[] {
  const n = days.length;
  const out: { i: number; text: string }[] = [];
  if (n > 60) {
    const firsts = days.flatMap((d, i) => (d.endsWith("-01") ? [i] : []));
    const k = Math.ceil(firsts.length / 4);
    firsts.forEach((i, j) => { if (j % k === 0) out.push({ i, text: monthShort(days[i].slice(0, 7)) }); });
  } else {
    const k = Math.max(1, Math.ceil((n - 1) / 4));
    for (let i = n - 1; i >= 1; i -= k) out.unshift({ i, text: shortDay(days[i]) });
  }
  return out;
}

/** The day the playoffs proper began, as an index into the daily series, with its label; null before then. */
export function playoffsMark(model: Season): { i: number; label: string } | null {
  const day = playoffsStart(model);
  const i = day ? model.series.findIndex((d) => d.day === day) : -1;
  return day && i >= 0 ? { i, label: `Playoffs from ${shortDay(day)}` } : null;
}

/**
 * The date labels that keep clear of the playoffs label, where both share the plot's top edge: that label
 * ends just left of its marker. Places and widths are fractions of the plot's width; give the widths at the
 * narrowest plot that shows the labels, so they stay apart at every wider one.
 */
export function clearOfMark<T extends { i: number }>(ticks: readonly T[], n: number, mark: { i: number } | null, widths: { mark: number; tick: number }): T[] {
  if (!mark || n < 2) return [...ticks];
  const end = mark.i / (n - 1);
  const start = end - widths.mark;
  return ticks.filter((t) => {
    const at = t.i / (n - 1);
    return at + widths.tick / 2 < start || at - widths.tick / 2 > end;
  });
}
