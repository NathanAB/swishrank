// Where a readout box (.tip in global.css) sits by the pointer: the rating charts' and the title race's readouts, How
// it works' season fan, the odds page's season results, a team's seeds and the heatmap's tiles. It keeps clear of the
// pointer, further from a fingertip, which covers more, and stays inside the area it is drawn over. tipAt is the
// arithmetic; placeTip measures the page and moves the tip.

/** How far a tip keeps from the pointer, in px. */
const GAP = { mouse: 12, finger: 24 } as const;

/**
 * Where a tip goes from the pointer. "beside": a chart's readout, above and right of the pointer, or left of it where
 * the right has no room, so it never covers the line being read. "above": centred above it. "above-or-below": centred
 * above it, or below it where the top has no room, so it never covers the tile under the pointer.
 */
export type Side = "beside" | "above" | "above-or-below";

type Size = { w: number; h: number };
/** A pointer's event, or a point for a keyboard's focus, which keeps a mouse's distance. */
export type Pointer = { clientX: number; clientY: number; pointerType?: string };

type Place = { tip: Size; area: Size; x: number; y: number; finger: boolean; side: Side; rise?: boolean };

const within = (v: number, least: number, most: number) => Math.max(least, Math.min(v, most));

/**
 * The tip's top left corner in its area, for a pointer at `x`, `y` from the area's top left corner. With `rise`, a
 * finger's tip may leave the area's top by up to its own height rather than stop at it, as How it works' season fan's
 * readout does over the words above its chart.
 */
export function tipAt({ tip, area, x, y, finger, side, rise = false }: Place) {
  const gap = finger ? GAP.finger : GAP.mouse;
  const left = side === "beside" ? (x + gap + tip.w > area.w ? x - gap - tip.w : x + gap) : x - tip.w / 2;
  const above = y - tip.h - gap;
  const top = side === "above-or-below" && above < 0 ? y + gap : above;
  return { left: within(left, 0, area.w - tip.w), top: within(top, rise && finger ? -tip.h : 0, area.h - tip.h) };
}

/** Moves a shown tip to its place in `area`, the box it is positioned in, for the pointer `at`. */
export function placeTip({ tip, area, at, side = "beside", rise }: { tip: HTMLElement; area: Element; at: Pointer; side?: Side; rise?: boolean }) {
  const box = area.getBoundingClientRect();
  const { left, top } = tipAt({
    tip: { w: tip.offsetWidth, h: tip.offsetHeight },
    area: { w: box.width, h: box.height },
    x: at.clientX - box.left,
    y: at.clientY - box.top,
    finger: at.pointerType === "touch",
    side,
    rise,
  });
  tip.style.transform = `translate(${left}px, ${top}px)`;
}
