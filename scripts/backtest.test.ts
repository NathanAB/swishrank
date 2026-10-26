import { test } from "node:test";
import assert from "node:assert/strict";
import { PARAMS } from "../src/lib/elo.ts";
import { eloScored, HELD_OUT, loadSeason, logLoss, modelRows, price } from "./evaluate.ts";

test("the site's model beats the old Elo on the held-out seasons' whole-season log loss", () => {
  const rows = HELD_OUT.flatMap((id) => modelRows(loadSeason(id), PARAMS));
  const model = logLoss(price(rows, PARAMS.sigma));
  const elo = logLoss(HELD_OUT.flatMap((id) => eloScored(loadSeason(id), rows.filter((r) => r.season === id))));
  assert.ok(model < elo, `model ${model.toFixed(4)} against Elo ${elo.toFixed(4)} over ${rows.length} games`);
});
