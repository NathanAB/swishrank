// How it works, step 2: the favourite's chance against the rating gap, and the motion that moves its dot.
// GapCurve.astro draws it on the server and its script redraws it.
import { winProb } from "../elo.ts";
import { int, pct, points } from "../format.ts";

/** The widest gap the curve shows, in points. */
export const GAP_MAX = 400;
/** The gap it opens on, the summary's "a team rated 100 points higher". */
export const GAP_START = 100;

/** A chance's height on the plot, from 50% at the bottom to 100% at the top, as a percentage from its top. */
export const height = (p: number) => (1 - (p - 0.5) / 0.5) * 100;

/** A gap's point on the curve, as percentages of the plot from its left and from its top. */
export const place = (g: number) => ({ x: (g / GAP_MAX) * 100, y: height(winProb(g)) });

/** What the graphic says at a whole-point gap: the favourite's and the underdog's chances, and the gap in words for the
 * axis and for the slider. */
export function readout(g: number) {
  const p = winProb(g);
  return {
    p,
    chances: [pct(p), pct(1 - p)] as const,
    tag: `${int(g)}-point gap`,
    points: points(g),
  };
}

/** CSS's cubic-bezier(x1, y1, x2, y2): how far along a move is at each moment of it, both from 0 to 1. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (p1: number, p2: number, s: number) => 3 * p1 * s * (1 - s) ** 2 + 3 * p2 * s * s * (1 - s) + s ** 3;
  return (t: number) => {
    if (t <= 0 || t >= 1) return Math.min(Math.max(t, 0), 1);
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < t) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}
