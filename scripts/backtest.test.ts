import { test } from "node:test";
import assert from "node:assert/strict";
import { eloScored, HELD_OUT, loadSeason, logLoss, modelRows, price, V1 } from "./evaluate.ts";

test("version 1 beats the old Elo on the held-out seasons' whole-season log loss", () => {
  const rows = HELD_OUT.flatMap((id) => modelRows(loadSeason(id), V1.params));
  const model = logLoss(price(rows, V1.params.sigma));
  const elo = logLoss(HELD_OUT.flatMap((id) => eloScored(loadSeason(id), rows.filter((r) => r.season === id))));
  assert.ok(model < elo, `model ${model.toFixed(4)} against Elo ${elo.toFixed(4)} over ${rows.length} games`);
});
