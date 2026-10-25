import { test } from "node:test";
import assert from "node:assert/strict";
import { signed } from "./format.ts";

test("changes carry a sign, with a real minus", () => {
  assert.deepEqual([signed(21), signed(-1322), signed(0)], ["+21", "−1,322", "0"]);
});
