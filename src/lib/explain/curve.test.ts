import { test } from "node:test";
import assert from "node:assert/strict";
import { cubicBezier, readout } from "./curve.ts";

test("the answer gives the favourite's chance first, then the underdog's, and names the gap", () => {
  assert.deepEqual(readout(64).chances, ["59%", "41%"]);
  assert.deepEqual(readout(100).chances, ["63%", "37%"]);
  assert.equal(readout(100).tag, "100-point gap");
  assert.equal(readout(100).points, "100 points");
});

test("the easing follows CSS's cubic-bezier, ending where it starts and stops", () => {
  const linear = cubicBezier(1 / 3, 1 / 3, 2 / 3, 2 / 3);
  for (const t of [0, 0.1, 0.5, 0.9, 1]) assert.ok(Math.abs(linear(t) - t) < 1e-6);
  // CSS's "ease", cubic-bezier(0.25, 0.1, 0.25, 1), is 80.24% of the way at half time.
  assert.ok(Math.abs(cubicBezier(0.25, 0.1, 0.25, 1)(0.5) - 0.8024) < 1e-3);
  assert.equal(cubicBezier(0.2, 0, 0, 1)(0), 0);
  assert.equal(cubicBezier(0.2, 0, 0, 1)(1), 1);
});
