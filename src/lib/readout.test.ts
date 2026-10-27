import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScale, ratingAt, readout, scaleAttr } from "./readout.ts";

const scale = { hi: 1100, yHi: 10, lo: 900, yLo: 210 };
const y = (v: number) => 10 + (1100 - v);

test("a height reads back as the rating drawn there, through the scale's attribute", () => {
  const s = parseScale(scaleAttr(scale));
  assert.ok(s);
  assert.deepEqual([1100, 1023, 900].map((v) => ratingAt(y(v), s)), [1100, 1023, 900]);
  assert.equal(ratingAt(55, { hi: 1000, yHi: 55, lo: 1000, yLo: 55 }), 1000);
});

test("the rank on a day counts the lines above, and equal ratings share it", () => {
  const lines = [
    { team: "A", ys: [y(1000), y(1030)] },
    { team: "B", ys: [y(1000), y(1020)] },
    { team: "C", ys: [y(1000), y(1020)] },
  ];
  assert.deepEqual(readout(lines, scale, 1, "A"), { rating: 1030, rank: 1, tied: false });
  assert.deepEqual(readout(lines, scale, 1, "C"), { rating: 1020, rank: 2, tied: true });
  assert.deepEqual(readout(lines, scale, 0, "B"), { rating: 1000, rank: 1, tied: true });
  assert.equal(readout(lines, scale, 2, "A"), null);
});
