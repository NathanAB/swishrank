import { test } from "node:test";
import assert from "node:assert/strict";
import { routePath, switchTarget } from "./routes.ts";

const now = { id: "2026-27", current: true };
const past = { id: "2025-26", current: false };
const anyTeam = () => true;

test("the current season lives at the root and a past season under its id", () => {
  assert.equal(routePath({ kind: "home", season: now }), "/");
  assert.equal(routePath({ kind: "team", season: now, abbr: "OKC" }), "/teams/okc/");
  assert.equal(routePath({ kind: "team", season: past, abbr: "OKC" }), "/2025-26/teams/okc/");
  assert.equal(routePath({ kind: "games", season: now }), "/games/");
  assert.equal(routePath({ kind: "games", season: past }), "/2025-26/games/");
});

test("the season switch keeps the page but not a month, and a team the other season lacks goes to its home", () => {
  assert.deepEqual(switchTarget({ kind: "team", season: now, abbr: "OKC" }, past, anyTeam), { kind: "team", season: past, abbr: "OKC" });
  assert.deepEqual(switchTarget({ kind: "games", season: past, month: "2026-06" }, now, anyTeam), { kind: "games", season: now });
  assert.deepEqual(switchTarget({ kind: "team", season: now, abbr: "SEA" }, past, () => false), { kind: "home", season: past });
});
