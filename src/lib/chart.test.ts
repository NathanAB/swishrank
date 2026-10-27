import { test } from "node:test";
import assert from "node:assert/strict";
import { clearOfMark, dateTicks, ratingTicks } from "./chart.ts";

test("a date label under the season-end label is dropped, and those clear of it on either side stay", () => {
  // 101 days, so day i sits at i% across. The label covers 60% to 80%, ending at the marker on day 80.
  const ticks = [10, 58, 70, 79, 83, 95].map((i) => ({ i, text: `d${i}` }));
  const kept = clearOfMark(ticks, 101, { i: 80 }, { mark: 0.2, tick: 0.06 });
  assert.deepEqual(kept.map((t) => t.i), [10, 95]);
  assert.deepEqual(clearOfMark(ticks, 101, null, { mark: 0.2, tick: 0.06 }), ticks);
});

test("day labels end on the last day, at least two label widths apart on a plot too narrow for more", () => {
  const week = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
  // Wide: a label is 5% of the plot, so the six days between the first and last get labels two days apart.
  assert.deepEqual(dateTicks(week, 0.05).map((t) => t.text), ["Oct 21", "Oct 23", "Oct 25"]);
  // Narrow: a label is a quarter of the plot, so labels sit at least half the plot, three days, apart.
  assert.deepEqual(dateTicks(week, 0.25).map((t) => t.text), ["Oct 22", "Oct 25"]);
});

test("a rating axis takes the finest round step with at most six ticks, so the lines fill most of its height", () => {
  // The 2026-27 opening week ran from 917 to 1106: steps of 50 fit, where 100 would leave 1100 to 1200 empty.
  assert.deepEqual(ratingTicks(917, 1106), { lo: 900, hi: 1150, ticks: [900, 950, 1000, 1050, 1100, 1150] });
  assert.deepEqual(ratingTicks(757, 1268), { lo: 700, hi: 1300, ticks: [700, 850, 1000, 1150, 1300] });
});
