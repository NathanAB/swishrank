import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compute } from "./elo.ts";
import { gamesIn, monthRoute, months } from "./results.ts";
import { routePath } from "./routes.ts";

const last = compute(JSON.parse(readFileSync(new URL("../data/games/2025-26.json", import.meta.url), "utf8")));
const all = months(last);

test("the 2025-26 results split into its nine calendar months, every final game on exactly one page", () => {
  assert.deepEqual(all.map((m) => m.key), ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
  const ids = all.flatMap((m) => gamesIn(m).map((r) => r.game.id));
  assert.equal(ids.length, 1322);
  assert.equal(new Set(ids).size, 1322);
});

test("a month lists its days newest first and each day's games in tip-off order", () => {
  for (const m of all) {
    const days = m.days.map((d) => d.day);
    assert.deepEqual(days, [...days].sort().reverse(), m.key);
    for (const d of m.days) {
      const tips = d.results.map((r) => r.game.t);
      assert.deepEqual(tips, [...tips].sort(), d.day);
      assert.ok(d.results.every((r) => r.day === d.day && d.day.startsWith(m.key)), d.day);
    }
  }
});

test("every month links to its own page, the newest month included", () => {
  const past = { id: "2025-26", current: false };
  assert.equal(routePath(monthRoute(past, "2026-06")), "/2025-26/results/2026-06/");
  assert.equal(routePath(monthRoute(past, "2026-03")), "/2025-26/results/2026-03/");
});
