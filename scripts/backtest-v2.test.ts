import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { V2 } from "./evaluate.ts";

test("version 2 as frozen in scripts/evaluate.ts is the choice docs/model-v2.md's Check line records", () => {
  const doc = readFileSync(new URL("../docs/model-v2.md", import.meta.url), "utf8");
  const check = /^Version 2 as frozen in scripts\/evaluate\.ts matches the choice, `(\{.*\})`\.$/m.exec(doc);
  assert.ok(check, "docs/model-v2.md's Check line says version 2 matches the choice");
  const r = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;
  const have = { ...V2.params, sigma: r(V2.params.sigma, 3), widen: r(V2.early.widen, 2), provisional: V2.provisional };
  assert.equal(JSON.stringify(have), check[1]);
});
