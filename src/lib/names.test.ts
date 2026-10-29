import { test } from "node:test";
import assert from "node:assert/strict";
import { playerName } from "./names.ts";

test("a player's name is found by his numeric athlete id, and an unknown id has none", () => {
  assert.equal(playerName(4278073), "Shai Gilgeous-Alexander");
  assert.equal(playerName(1), undefined);
});
