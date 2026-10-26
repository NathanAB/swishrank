import { test } from "node:test";
import assert from "node:assert/strict";
import { clearOfMark } from "./chart.ts";

test("a date label under the playoffs label is dropped, and those clear of it on either side stay", () => {
  // 101 days, so day i sits at i% across. The label covers 60% to 80%, ending at the marker on day 80.
  const ticks = [10, 58, 70, 79, 83, 95].map((i) => ({ i, text: `d${i}` }));
  const kept = clearOfMark(ticks, 101, { i: 80 }, { mark: 0.2, tick: 0.06 });
  assert.deepEqual(kept.map((t) => t.i), [10, 95]);
  assert.deepEqual(clearOfMark(ticks, 101, null, { mark: 0.2, tick: 0.06 }), ticks);
});
