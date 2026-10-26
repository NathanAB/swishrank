import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScale, ratingAt, readout, scaleAttr } from "./readout.ts";

// 1600 drawn at y 10 and 1400 at y 210: one point of rating is one unit of height.
const scale = { hi: 1600, yHi: 10, lo: 1400, yLo: 210 };
const y = (v: number) => 10 + (1600 - v);

test("a height reads back as the rating drawn there, through the scale's attribute", () => {
  const s = parseScale(scaleAttr(scale));
  assert.ok(s);
  assert.deepEqual([1600, 1523, 1400].map((v) => ratingAt(y(v), s)), [1600, 1523, 1400]);
  assert.equal(ratingAt(55, { hi: 1500, yHi: 55, lo: 1500, yLo: 55 }), 1500);
});

test("the rank on a day counts the lines above, and equal ratings share it", () => {
  const lines = [
    { team: "A", ys: [y(1500), y(1530)] },
    { team: "B", ys: [y(1500), y(1520)] },
    { team: "C", ys: [y(1500), y(1520)] },
  ];
  assert.deepEqual(readout(lines, scale, 1, "A"), { rating: 1530, rank: 1, tied: false });
  assert.deepEqual(readout(lines, scale, 1, "C"), { rating: 1520, rank: 2, tied: true });
  assert.deepEqual(readout(lines, scale, 0, "B"), { rating: 1500, rank: 1, tied: true });
  assert.equal(readout(lines, scale, 2, "A"), null);
});
