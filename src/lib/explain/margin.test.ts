import { test } from "node:test";
import assert from "node:assert/strict";
import { counted, PARAMS } from "../elo.ts";
import { worth } from "./margin.ts";

test("names how many times a 1-point win a wider win counts, to one decimal", () => {
  const times = (counted(43, PARAMS.margin) / counted(1, PARAMS.margin)).toFixed(1);
  assert.deepEqual(worth(43), ["A 43-point win counts ", `${times} times`, " as much as a 1-point win."]);
  assert.equal(worth(1).join(""), "A 1-point win is the least a win counts.");
});
