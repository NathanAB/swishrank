import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EARLY, PARAMS, PROVISIONAL } from "../src/lib/elo.ts";

test("src/lib/elo.ts's settings are the choice docs/model-v2.md's Check line records", () => {
  const doc = readFileSync(new URL("../docs/model-v2.md", import.meta.url), "utf8");
  const check = /^src\/lib\/elo\.ts PARAMS, EARLY and PROVISIONAL match the choice, `(\{.*\})`\.$/m.exec(doc);
  assert.ok(check, "docs/model-v2.md's Check line says the settings match the choice");
  const r = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;
  const have = { ...PARAMS, sigma: r(PARAMS.sigma, 3), widen: r(EARLY.widen, 2), provisional: PROVISIONAL };
  assert.equal(JSON.stringify(have), check[1]);
});
