import { test } from "node:test";
import assert from "node:assert/strict";
import { hashTeam, routePath, switchTarget } from "./routes.ts";

const now = { id: "2026-27", current: true };
const past = { id: "2025-26", current: false };
const anyTeam = () => true;

test("the current season lives at the root and a past season under its id", () => {
  assert.equal(routePath({ kind: "home", season: now }), "/");
  assert.equal(routePath({ kind: "team", season: now, abbr: "OKC" }), "/teams/okc/");
  assert.equal(routePath({ kind: "team", season: past, abbr: "OKC" }), "/2025-26/teams/okc/");
  assert.equal(routePath({ kind: "fixtures", season: now }), "/fixtures/");
  assert.equal(routePath({ kind: "fixtures", season: past }), "/2025-26/fixtures/");
});

test("the season switch keeps the page, even fixtures in a season with none left", () => {
  assert.deepEqual(switchTarget({ kind: "team", season: now, abbr: "OKC" }, past, anyTeam), { kind: "team", season: past, abbr: "OKC" });
  assert.deepEqual(switchTarget({ kind: "fixtures", season: now }, past, anyTeam), { kind: "fixtures", season: past });
  assert.deepEqual(switchTarget({ kind: "results", season: past, month: "2026-06" }, now, anyTeam), { kind: "results", season: now });
  assert.deepEqual(switchTarget({ kind: "team", season: now, abbr: "SEA" }, past, () => false), { kind: "teams", season: past });
});

test("the graph lives under its season, keeps its page across the season switch, and carries a pick in its hash", () => {
  assert.equal(routePath({ kind: "graph", season: now }), "/graph/");
  assert.equal(routePath({ kind: "graph", season: past }), "/2025-26/graph/");
  assert.equal(routePath({ kind: "graph", season: now, abbr: "OKC" }), "/graph/#okc");
  assert.deepEqual(switchTarget({ kind: "graph", season: past }, now, anyTeam), { kind: "graph", season: now });
});

test("a hash picks the team it names on the page, and no hash or another hash picks none", () => {
  const onPage = ["MIN", "OKC", "BOS"];
  assert.equal(hashTeam("#okc", onPage), "OKC");
  assert.equal(hashTeam("#OKC", onPage), "OKC");
  assert.equal(hashTeam("", onPage), null);
  assert.equal(hashTeam("#lal", onPage), null);
  assert.equal(hashTeam("#h-league-table", onPage), null);
});
