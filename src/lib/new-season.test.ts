import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("the suite the deploy runs before the fetch passes on a season with no box scores or preseason totals yet", () => {
  const dir = mkdtempSync(join(tmpdir(), "new-season-"));
  try {
    for (const name of ["lib", "data"]) cpSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), join(dir, name), { recursive: true });
    const seasons = JSON.parse(readFileSync(join(dir, "data", "seasons.json"), "utf8")) as { id: string; end?: string }[];
    const current = seasons.find((s) => !s.end)!.id;
    for (const kind of ["box", "preseason"]) rmSync(join(dir, "data", kind, `${current}.json`));
    // Without NODE_TEST_CONTEXT, which node --test sets, the child runs as a suite of its own and exits with its result.
    const { NODE_TEST_CONTEXT: _, ...env } = process.env;
    const run = spawnSync(process.execPath, ["--test", join(dir, "lib", "every-game.test.ts")], { encoding: "utf8", env });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
