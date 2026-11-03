import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { EARLY, PARAMS } from "../src/lib/elo.ts";

const doc = readFileSync(new URL("../docs/model-v4.md", import.meta.url), "utf8");

test("src/lib/elo.ts's SIGMA and widening are the fit docs/model-v4.md's Check line records", () => {
  const check = /^src\/lib\/v4\.ts V4 matches the plan's fit, `(\{.*\})`\.$/m.exec(doc);
  assert.ok(check, "docs/model-v4.md's Check line says the settings match the plan's fit");
  const r = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;
  assert.equal(JSON.stringify({ sigma: r(PARAMS.sigma, 3), widen: r(EARLY.widen, 2) }), check[1]);
});

test("docs/model-v4.md's pre-registration is the text whose latest hash it records", () => {
  const lines = doc.split("\n");
  const from = lines.indexOf("## Pre-registration");
  const to = lines.findIndex((l, i) => i > from && l.startsWith("## "));
  const hash = createHash("sha256").update(lines.slice(from + 1, to).join("\n")).digest("hex");
  assert.ok(doc.split("\n").some((l) => l.startsWith("The plan this one replaced") && l.endsWith(`\`${hash}\`.`)), "the Results line ends on the plan's current hash");
  assert.match(readFileSync(new URL("./backtest-v4.ts", import.meta.url), "utf8"), new RegExp(`const PREREGISTERED = "${hash}"`));
});
