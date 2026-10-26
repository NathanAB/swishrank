// What the two drawings of the season's ratings share: the rating chart's card and the chart built into the
// league table label their dates and mark the end of the regular season the same way.
import { START, type Season } from "./elo.ts";
import { monthShort, shortDay } from "./format.ts";
import { regularSeasonEnd } from "./teams.ts";

/**
 * Date labels on one step that lands on the last day: month starts for a long season, days for a short one.
 * `tick` is a day label's width as a fraction of the narrowest plot that shows them. The last day's label
 * ends at the plot's edge while the others centre on their day, so days at least two labels apart leave
 * half a label of air before the last.
 */
export function dateTicks(days: readonly string[], tick: number): { i: number; text: string }[] {
  const n = days.length;
  const out: { i: number; text: string }[] = [];
  if (n > 60) {
    const firsts = days.flatMap((d, i) => (d.endsWith("-01") ? [i] : []));
    const k = Math.ceil(firsts.length / 4);
    firsts.forEach((i, j) => { if (j % k === 0) out.push({ i, text: monthShort(days[i].slice(0, 7)) }); });
  } else {
    const k = Math.max(1, Math.ceil((n - 1) / 4), Math.ceil(2 * tick * (n - 1)));
    for (let i = n - 1; i >= 1; i -= k) out.unshift({ i, text: shortDay(days[i]) });
  }
  return out;
}

/** A rating axis: 3 to 6 round ticks that include 1500, the top one above the highest rating. */
export function ratingTicks(min: number, max: number): { lo: number; hi: number; ticks: number[] } {
  for (const step of [25, 50, 100, 150, 200, 250, 300, 500]) {
    const lo = START - Math.ceil((START - min) / step) * step;
    let hi = START + Math.ceil((max - START) / step) * step;
    if (hi <= max) hi += step;
    const ticks: number[] = [];
    for (let v = lo; v <= hi; v += step) ticks.push(v);
    if (ticks.length <= 6 || step === 500) return { lo, hi, ticks };
  }
  throw new Error("unreachable: the last step always returns");
}

/**
 * The regular season's last day, as an index into the daily series, with its label; null until the postseason
 * has a game. The lines of the teams it ended stop at this mark.
 */
export function seasonEndMark(model: Season): { i: number; label: string } | null {
  const day = regularSeasonEnd(model);
  const i = day ? model.series.findIndex((d) => d.day === day) : -1;
  return day && i >= 0 ? { i, label: `Regular season ends ${shortDay(day)}` } : null;
}

/**
 * The date labels that keep clear of the season-end label, where both share the plot's top edge: that label
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
