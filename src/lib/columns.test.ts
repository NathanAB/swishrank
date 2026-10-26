import { test } from "node:test";
import assert from "node:assert/strict";
import { columns } from "./columns.ts";

test("games fill each column top to bottom before the next, the last column taking what is left", () => {
  assert.deepEqual(columns(8, 3), [[0, 1, 2], [3, 4, 5], [6, 7]]);
  assert.deepEqual(columns(5, 2), [[0, 1, 2], [3, 4]]);
});

test("a day of three games or fewer is one list", () => {
  assert.deepEqual(columns(3, 3), [[0, 1, 2]]);
  assert.deepEqual(columns(1, 2), [[0]]);
  assert.deepEqual(columns(0, 3), []);
});
