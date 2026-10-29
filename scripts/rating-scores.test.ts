import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// npm run ratings on a copy of the repository's data, with an injury archive written for 2025-26, a finished season.
let dir = "";
before(() => {
  dir = mkdtempSync(join(tmpdir(), "rating-scores-"));
  for (const path of ["scripts", "src/lib", "src/data"]) cpSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), join(dir, path), { recursive: true });
  mkdirSync(join(dir, "src/data/injuries"), { recursive: true });
});
after(() => rmSync(dir, { recursive: true, force: true }));

const judge = (day: string) => {
  const injury = { athlete: 1, team: "CHI", status: "Out", date: `${day}T12:00Z`, returnDate: "2025-11-30" };
  const report = { fetched: `${day}T12:00:00.000Z`, injuries: [injury] };
  writeFileSync(join(dir, "src/data/injuries/2025-26.json"), JSON.stringify({ season: "2025-26", days: { [day]: report } }));
  const run = spawnSync(process.execPath, [join(dir, "scripts/rating-scores.ts"), "2025-26"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
};

test("the injury report is judged against the usual rotation the site shows, not the curve it adjusts", () => {
  // The report names no one in a rotation, so D is the curve, C, and its miss differs from B's.
  const out = judge("2025-10-21");
  const miss = (name: string) => Number(new RegExp(`^${name} +RMS miss (\\S+) over \\d+ team-days$`, "m").exec(out)?.[1]);
  assert.ok(miss("B usual rotation") > 0 && miss("D with report") > 0, out);
  assert.notEqual(miss("D with report"), miss("B usual rotation"), out);
  assert.match(out, /^D minus B, mean squared miss -?\d\.\d+, 95% interval -?\d\.\d+ to -?\d\.\d+ over \d+ weeks$/m);
  assert.match(out, /^(The site keeps B|D replaces B)\.$/m);
});

test("with no team-day to score, the judgment says there are too few report days", () => {
  const out = judge("2026-06-01");
  assert.match(out, /^Too few report days to judge/m);
  assert.doesNotMatch(out, /NaN/);
});
