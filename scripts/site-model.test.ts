import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Scripts that call compute() on another version's inputs on purpose: records of earlier decisions, which no workflow
 * or test runs, each with the version it records. compute() prices at the site's SIGMA, so a new script that means the site's
 * model belongs nowhere on this list.
 */
const RECORDS: Record<string, string> = {
  "scripts/rating-scores.ts": "version 2's choice of shown rating (docs/model-v2.md), on version 4's inputs",
  "scripts/early-season.ts": "version 4's early-season study (docs/early-season.md)",
};

/** Scripts that call modelInputs() beside siteInputs() for a part no version's switches change, and which part. */
const BESIDE: Record<string, string> = {
  "scripts/project.ts": "the shown rotation of the season without its injury reports",
};

const scripts = readdirSync(resolve(root, "scripts"), { recursive: true, encoding: "utf8" })
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => relative(root, resolve(root, "scripts", f)))
  .sort();

test("every script that calls compute() builds its inputs with siteInputs(), unless it is a record of an earlier version", () => {
  const callers = scripts.filter((f) => /\bcompute\(/.test(readFileSync(resolve(root, f), "utf8")));
  assert.ok(callers.includes("scripts/odds-history.ts"), `the scan found ${callers.join(", ")}`);
  for (const f of callers) {
    if (f in RECORDS) continue;
    const text = readFileSync(resolve(root, f), "utf8");
    const fix = `${f} calls compute(), which prices at the site's SIGMA (src/lib/site.ts SITE), so its inputs must be the site's too: build them with siteInputs(files, draft) from src/lib/inputs.ts, which adds the site's on-court and roster settings and the play-by-play record. If the script records an earlier version on purpose, list it in RECORDS with that version.`;
    assert.match(text, /\bsiteInputs\(/, fix);
    if (!(f in BESIDE)) assert.doesNotMatch(text, /\bmodelInputs\(/, fix);
  }
});
