import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { V3 } from "../src/lib/v3.ts";

test("src/lib/v3.ts's settings are the fit docs/model-v3.md's Check line records", () => {
  const doc = readFileSync(new URL("../docs/model-v3.md", import.meta.url), "utf8");
  const check = /^src\/lib\/v3\.ts V3 matches the plan's fit, `(\{.*\})`\.$/m.exec(doc);
  assert.ok(check, "docs/model-v3.md's Check line says the settings match the plan's fit");
  const r = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;
  assert.equal(JSON.stringify({ home: V3.home, out: V3.out, rookieNp: V3.rookieNp, sigma: r(V3.sigma, 3), widen: r(V3.widen, 2) }), check[1]);
});
