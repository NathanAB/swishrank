// The arithmetic of a player's rating chart (src/scripts/player.ts), which the browser draws at the card's size: the
// rating axis fitted to his line, and where each team he played for is named over it. It imports nothing that holds
// state, so it ships to the browser.
import { textWidth } from "./text-width.ts";

/** A rating axis: its floor and ceiling, and a tick every `step` between them. */
export type Axis = { lo: number; hi: number; step: number; ticks: number[] };

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200];
/** The most gaps between ticks an axis has. */
const MOST_GAPS = 5;

/** The axis for ratings from `min` to `max`: a little room past each, on round ticks, at most MOST_GAPS of them. */
export function fitAxis(min: number, max: number): Axis {
  const pad = Math.max(1, (max - min) * 0.08);
  const step = STEPS.find((s) => (max - min + 2 * pad) / s <= MOST_GAPS) ?? STEPS.at(-1)!;
  const lo = Math.floor((min - pad) / step) * step, hi = Math.ceil((max + pad) / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  return { lo, hi, step, ticks };
}

/** px a team's name keeps clear of the next. */
const AIR = 8;

/**
 * Where each team's name sits over the chart, from where his stretch with it starts (`x`) and the plot's `left` and
 * `right`: just right of the start, the first at the plot's left, each pulled left to end inside the plot and left
 * out (null) where it would run into the name before it.
 */
export function teamLabels(marks: readonly { x: number; text: string }[], left: number, right: number, size: number): (number | null)[] {
  let end = -Infinity;
  return marks.map((m, k) => {
    const w = textWidth(m.text) * size;
    const x = Math.min(k === 0 ? left : m.x + 4, right - w);
    if (x < left || x < end + AIR) return null;
    end = x + w;
    return x;
  });
}
