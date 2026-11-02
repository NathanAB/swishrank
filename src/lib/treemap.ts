// A squarified treemap (Bruls, Huizing and van Wijk, "Squarified Treemaps", 2000), the players heatmap's layout: rects
// for a list of weights that fill a box, each as big as its weight's share, laid in rows along the box's shorter side
// and each row grown while that keeps its rects closer to square. Callers sort the weights largest first, which is
// what keeps the rects squarest.

export type Rect = { x: number; y: number; w: number; h: number };

const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);

/** The worst aspect ratio among a row of `areas` laid along a side `side` long. */
function worst(areas: readonly number[], side: number) {
  const s = sum(areas);
  return Math.max(...areas.map((a) => Math.max((side * side * a) / (s * s), (s * s) / (side * side * a))));
}

/** Rects for positive `weights`, in their order, that fill `box` without overlapping, each with its weight's share of the area. */
export function squarify(weights: readonly number[], box: Rect): Rect[] {
  const total = sum(weights);
  const areas = weights.map((w) => (w / total) * box.w * box.h);
  const out: Rect[] = [];
  let free = { ...box };
  for (let i = 0; i < areas.length; ) {
    const side = Math.min(free.w, free.h);
    let end = i + 1;
    while (end < areas.length && worst(areas.slice(i, end + 1), side) <= worst(areas.slice(i, end), side)) end++;
    const row = areas.slice(i, end);
    i = end;
    // A row runs down the free space's left edge when it is wider than tall, else along its top.
    const across = free.w >= free.h;
    const thick = sum(row) / (across ? free.h : free.w);
    let at = across ? free.y : free.x;
    for (const a of row) {
      const long = a / thick;
      out.push(across ? { x: free.x, y: at, w: thick, h: long } : { x: at, y: free.y, w: long, h: thick });
      at += long;
    }
    free = across
      ? { x: free.x + thick, y: free.y, w: Math.max(0, free.w - thick), h: free.h }
      : { x: free.x, y: free.y + thick, w: free.w, h: Math.max(0, free.h - thick) };
  }
  return out;
}

/** `r` shrunk by `by` on every side, down to nothing but never below: a negative width would draw as an automatic one. */
export const inset = (r: Rect, by: number): Rect => {
  const dx = Math.min(by, r.w / 2), dy = Math.min(by, r.h / 2);
  return { x: r.x + dx, y: r.y + dy, w: r.w - 2 * dx, h: r.h - 2 * dy };
};
