import { test } from "node:test";
import assert from "node:assert/strict";
import { nearDay, signed } from "./format.ts";

test("changes carry a sign, with a real minus", () => {
  assert.deepEqual([signed(21), signed(-1322), signed(0)], ["+21", "−1,322", "0"]);
});

test("the week ahead calls today Tonight and the next day Tomorrow, across a month's end, and names no later day", () => {
  assert.deepEqual(["2026-10-31", "2026-11-01", "2026-11-02"].map((d) => nearDay(d, "2026-10-31")), ["Tonight", "Tomorrow", null]);
});
