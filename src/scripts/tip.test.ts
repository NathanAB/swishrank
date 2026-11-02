import { test } from "node:test";
import assert from "node:assert/strict";
import { tipAt } from "./tip.ts";

const tip = { w: 100, h: 40 };
const area = { w: 600, h: 300 };

test("a readout sits above and right of the pointer, 12px clear of a mouse and 24px clear of a finger", () => {
  assert.deepEqual(tipAt({ tip, area, x: 200, y: 150, finger: false, side: "beside" }), { left: 212, top: 98 });
  assert.deepEqual(tipAt({ tip, area, x: 200, y: 150, finger: true, side: "beside" }), { left: 224, top: 86 });
});

test("a readout with no room on the pointer's right goes to its left", () => {
  assert.deepEqual(tipAt({ tip, area, x: 550, y: 150, finger: false, side: "beside" }), { left: 438, top: 98 });
  assert.deepEqual(tipAt({ tip, area, x: 550, y: 150, finger: true, side: "beside" }), { left: 426, top: 86 });
});

test("a tip stays inside its area, at the top beside a pointer near it and on the left in an area narrower than it", () => {
  assert.deepEqual(tipAt({ tip, area, x: 200, y: 20, finger: false, side: "beside" }), { left: 212, top: 0 });
  assert.deepEqual(tipAt({ tip, area: { w: 80, h: 300 }, x: 40, y: 150, finger: false, side: "beside" }), { left: 0, top: 98 });
});

test("a centred tip sits over the pointer and inside its area's sides", () => {
  assert.deepEqual(tipAt({ tip, area, x: 300, y: 150, finger: false, side: "above" }), { left: 250, top: 98 });
  assert.deepEqual(tipAt({ tip, area, x: 10, y: 150, finger: false, side: "above" }), { left: 0, top: 98 });
  assert.deepEqual(tipAt({ tip, area, x: 590, y: 150, finger: true, side: "above" }), { left: 500, top: 86 });
});

test("with no room above the pointer, a centred tip holds to the top or goes below the pointer, clear of it", () => {
  assert.deepEqual(tipAt({ tip, area, x: 300, y: 30, finger: false, side: "above" }), { left: 250, top: 0 });
  assert.deepEqual(tipAt({ tip, area, x: 300, y: 30, finger: false, side: "above-or-below" }), { left: 250, top: 42 });
  assert.deepEqual(tipAt({ tip, area, x: 300, y: 30, finger: true, side: "above-or-below" }), { left: 250, top: 54 });
});

test("a rising tip may leave its area's top by its own height for a finger, and not for a mouse", () => {
  assert.deepEqual(tipAt({ tip, area, x: 200, y: 30, finger: true, side: "beside", rise: true }), { left: 224, top: -34 });
  assert.deepEqual(tipAt({ tip, area, x: 200, y: 5, finger: true, side: "beside", rise: true }), { left: 224, top: -40 });
  assert.deepEqual(tipAt({ tip, area, x: 200, y: 30, finger: false, side: "beside", rise: true }), { left: 212, top: 0 });
});
