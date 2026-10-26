import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compute } from "./elo.ts";
import { monthRoute, months, recentDays } from "./results.ts";
import { routePath } from "./routes.ts";

const last = compute(JSON.parse(readFileSync(new URL("../data/games/2025-26.json", import.meta.url), "utf8")));
const all = months(last);

test("the 2025-26 results split into its nine calendar months, every final game on exactly one page", () => {
  assert.deepEqual(all.map((m) => m.key), ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
  const ids = all.flatMap((m) => m.days.flatMap((d) => d.results.map((r) => r.game.id)));
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

test("the latest results are the game days in the week that ends on the newest one, newest first", () => {
  // The 2025-26 Finals ended on June 13 after games on June 5, 8 and 10.
  assert.deepEqual(recentDays(last, 7).map((d) => d.day), ["2026-06-13", "2026-06-10", "2026-06-08"]);
  assert.deepEqual(recentDays(compute({ season: "x", teams: {}, games: [] }), 7), []);
});

test("every month links to its own page, the newest month included", () => {
  const past = { id: "2025-26", current: false };
  assert.equal(routePath(monthRoute(past, "2026-06")), "/2025-26/games/2026-06/");
  assert.equal(routePath(monthRoute(past, "2026-03")), "/2025-26/games/2026-03/");
});
