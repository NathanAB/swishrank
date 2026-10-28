import { test } from "node:test";
import assert from "node:assert/strict";
import { guessPath, routePath, shareImage, sharePath, switchTarget, type Route } from "./routes.ts";

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

test("a mistyped path leads to the page it meant: any case, the current season by its id, a team by its name", () => {
  const aliases = { ny: "ny", knicks: "ny", "new-york-knicks": "ny", "trail-blazers": "por" };
  const guess = (path: string) => guessPath(path, { current: now.id, aliases, months: {} });
  assert.equal(guess("/teams/NY/"), "/teams/ny/");
  assert.equal(guess("/East/"), "/east/");
  assert.equal(guess("/2026-27/"), "/");
  assert.equal(guess("/2026-27/teams/knicks/"), "/teams/ny/");
  assert.equal(guess("/2025-26/teams/New%20York%20Knicks"), "/2025-26/teams/ny/");
  assert.equal(guess("/teams/Trail%20Blazers/"), "/teams/por/");
  assert.equal(guess("/2025%E2%80%9326/"), "/2025-26/");
});

test("a month of games goes under the season it belongs to, from any season's address", () => {
  const guess = (path: string) => guessPath(path, { current: now.id, aliases: {}, months: { "2025-11": "2025-26", "2026-10": "2026-27" } });
  assert.equal(guess("/games/2025-11/"), "/2025-26/games/2025-11/");
  assert.equal(guess("/2024-25/games/2025-11/"), "/2025-26/games/2025-11/");
  assert.equal(guess("/2025-26/games/2026-10/"), "/games/2026-10/");
});

test("a path with no better guess, or one that is already its own guess, gets none, so the not-found page never loops", () => {
  const guess = (path: string) => guessPath(path, { current: now.id, aliases: { knicks: "ny" }, months: { "2025-11": "2025-26" } });
  assert.equal(guess("/teams/nyk/"), null);
  assert.equal(guess("/north/"), null);
  assert.equal(guess("/teams/%E0%A4%A/"), null);
  assert.equal(guess("/teams/a%2Fb/"), null);
  assert.equal(guess("/2025-26/games/2025-11/"), null);
  assert.equal(guess("/games/2026-13/"), null);
});

test("a game lives under its season's games at its US Eastern day and its two teams, vs at a neutral site", () => {
  const game = { t: "2026-01-24T01:00Z", home: "OKC", away: "IND", neutral: false };
  assert.equal(routePath({ kind: "game", season: past, game }), "/2025-26/games/2026-01-23/ind-at-okc/");
  assert.equal(routePath({ kind: "game", season: now, game: { ...game, neutral: true } }), "/games/2026-01-23/ind-vs-okc/");
});

test("a game's page shares its season's picture", () => {
  const game = { t: "2026-01-24T01:00Z", home: "OKC", away: "IND", neutral: false };
  assert.equal(sharePath(shareImage({ kind: "game", season: past, game }, now)), "/share/2025-26.png");
});

test("a game's link from its season at the root finds it under that season once the next one starts", () => {
  const guess = (path: string) => guessPath(path, { current: now.id, aliases: {}, months: { "2026-01": "2025-26" } });
  assert.equal(guess("/games/2026-01-23/ind-at-okc/"), "/2025-26/games/2026-01-23/ind-at-okc/");
});
