import { test } from "node:test";
import assert from "node:assert/strict";
import { routePath, shareImage, sharePath, switchTarget, type Route } from "./routes.ts";

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

test("a conference's table lives under its name in either season", () => {
  assert.equal(routePath({ kind: "home", season: now, conference: "East" }), "/east/");
  assert.equal(routePath({ kind: "home", season: past, conference: "West" }), "/2025-26/west/");
});

test("the seasons list, the season menu's fallback, lives at /seasons/", () => {
  assert.equal(routePath({ kind: "seasons" }), "/seasons/");
});

test("a team page shares its team's picture, a season's pages that season's, and a page without one the current season's", () => {
  const shared = (route?: Route) => sharePath(shareImage(route, now));
  assert.equal(shared({ kind: "team", season: past, abbr: "OKC" }), "/share/2025-26-okc.png");
  assert.equal(shared({ kind: "home", season: past, conference: "West" }), "/share/2025-26.png");
  assert.equal(shared({ kind: "games", season: past, month: "2026-03" }), "/share/2025-26.png");
  assert.equal(shared({ kind: "seasons" }), "/share/2026-27.png");
  assert.equal(shared({ kind: "about" }), "/share/2026-27.png");
  assert.equal(shared(undefined), "/share/2026-27.png");
});

test("the season switch keeps the conference", () => {
  assert.deepEqual(switchTarget({ kind: "home", season: now, conference: "East" }, past, anyTeam), { kind: "home", season: past, conference: "East" });
});

test("the season switch keeps the page but not a month, and a team the other season lacks goes to its home", () => {
  assert.deepEqual(switchTarget({ kind: "team", season: now, abbr: "OKC" }, past, anyTeam), { kind: "team", season: past, abbr: "OKC" });
  assert.deepEqual(switchTarget({ kind: "games", season: past, month: "2026-06" }, now, anyTeam), { kind: "games", season: now });
  assert.deepEqual(switchTarget({ kind: "team", season: now, abbr: "SEA" }, past, () => false), { kind: "home", season: past });
});
