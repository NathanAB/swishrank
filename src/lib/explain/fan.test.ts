import { test } from "node:test";
import assert from "node:assert/strict";
import { spread, sweepDay } from "./fan.ts";

test("the sweep names opening night from its first frame, each day while its games are drawn, and the last day as it lands", () => {
  assert.equal(sweepDay(0, 9), 1);
  assert.equal(sweepDay(0.1, 9), 1);
  assert.equal(sweepDay(0.2, 9), 2);
  assert.equal(sweepDay(0.25, 9), 2);
  assert.equal(sweepDay(0.26, 9), 3);
  assert.equal(sweepDay(1, 9), 8);
});

test("end labels a line of text apart or more stay level with their lines, and closer ones part evenly around their middle", () => {
  assert.deepEqual(spread(20, 140, 16), [20, 140]);
  assert.deepEqual(spread(70, 80, 16), [67, 83]);
});
