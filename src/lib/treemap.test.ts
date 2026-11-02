import { test } from "node:test";
import assert from "node:assert/strict";
import { inset, squarify, type Rect } from "./treemap.ts";

const EPS = 1e-9;
const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

test("a treemap's rects fill its box without overlapping, each inside it and as big as its weight's share", () => {
  // A rotation's minutes, largest first, on a wide box and on a tall one.
  const weights = [36.2, 34.8, 33.1, 30.5, 28.4, 24, 19.7, 14.2, 11.6, 4.1, 2.3, 0.9];
  const total = weights.reduce((s, w) => s + w, 0);
  for (const box of [{ x: 10, y: 20, w: 1400, h: 860 }, { x: 0, y: 0, w: 600, h: 1600 }]) {
    const rects = squarify(weights, box);
    assert.equal(rects.length, weights.length);
    rects.forEach((r, i) => {
      assert.ok(Math.abs((r.w * r.h) / (box.w * box.h) - weights[i] / total) < EPS, `rect ${i} has ${r.w * r.h}`);
      assert.ok(r.x >= box.x - EPS && r.y >= box.y - EPS && r.x + r.w <= box.x + box.w + EPS && r.y + r.h <= box.y + box.h + EPS, `rect ${i} leaves the box`);
      for (const s of rects.slice(i + 1)) assert.ok(overlap(r, s) < EPS, `rect ${i} overlaps another`);
    });
  }
});

test("a rect too small for the gap between tiles shrinks to nothing, never to a negative size", () => {
  assert.deepEqual(inset({ x: 0, y: 0, w: 10, h: 1.5 }, 1), { x: 1, y: 0.75, w: 8, h: 0 });
});
