import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, type Game } from "./elo.ts";
import { rating } from "./format.ts";
import { gameView } from "./game.ts";
import { gameTitle, homeHeading, homeTitle, structuredData, teamDescription, teamTitle } from "./meta.ts";
import { routePath, type Route } from "./routes.ts";

test("a season home's document title names Elo ratings and power rankings for the league, and power rankings alone for one conference", () => {
  assert.equal(homeTitle({ label: "2026–27" }), "NBA Elo ratings and power rankings 2026–27");
  assert.equal(homeTitle({ label: "2026–27" }, "East"), "2026–27 East power rankings");
});

test("a season home's heading names NBA Elo ratings for the league, and the conference for one conference", () => {
  assert.equal(homeHeading({ label: "2026–27" }), "2026–27 NBA Elo ratings");
  assert.equal(homeHeading({ label: "2026–27" }, "East"), "2026–27 · Eastern Conference");
});

test("a team page's description gives the team's rank of every team, a shared rank as tied, and its record, as the table has them", () => {
  const team = (short: string) => ({ name: short, short, color: "000000", alternateColor: "ffffff" });
  const final = (id: string, away: string): Game => ({ id, t: "2026-10-25T23:00Z", home: "OKC", away, hs: 110, as: 100, final: true, neutral: false, note: null });
  // The Thunder beat the Celtics and the Knicks by the same score at home, so those two are level behind them.
  const model = compute({ season: "2026-27", teams: { OKC: team("Thunder"), BOS: team("Celtics"), NY: team("Knicks") }, games: [final("1", "BOS"), final("2", "NY")] });
  const season = { model, current: true };
  assert.equal(teamDescription(season, "OKC"), `The Thunder are 1st of 3 at ${rating(model.r.OKC)} with a 2–0 record. Playoff and title odds, rating chart, rating history and next games.`);
  assert.equal(teamDescription(season, "BOS"), `The Celtics are tied 2nd of 3 at ${rating(model.r.BOS)} with a 0–1 record. Playoff and title odds, rating chart, rating history and next games.`);
});

test("a team page's document title ends in the team's rank of every team, and has none before its first game", () => {
  const team = (name: string) => ({ name, short: name, color: "000000", alternateColor: "ffffff" });
  const teams = { OKC: team("Oklahoma City Thunder"), BOS: team("Boston Celtics"), NY: team("New York Knicks") };
  const final = (id: string, away: string): Game => ({ id, t: "2026-10-25T23:00Z", home: "OKC", away, hs: 110, as: 100, final: true, neutral: false, note: null });
  const played = { model: compute({ season: "2026-27", teams, games: [final("1", "BOS"), final("2", "NY")] }), label: "2026–27" };
  assert.equal(teamTitle(played, "OKC"), "Oklahoma City Thunder power ranking 2026–27: 1st of 3");
  assert.equal(teamTitle(played, "BOS"), "Boston Celtics power ranking 2026–27: tied 2nd of 3");
  const unplayed = { model: compute({ season: "2026-27", teams, games: [] }), label: "2026–27" };
  assert.equal(teamTitle(unplayed, "OKC"), "Oklahoma City Thunder power ranking 2026–27");
});

test("a page's structured data names the site on the current home, and gives a team, game or player page the pages above it", () => {
  const url = (route: Route) => `https://swishrank.com${routePath(route)}`;
  const now = { id: "2026-27", current: true };
  const then = { id: "2015-16", current: false };
  const item = (position: number, name: string, item: string) => ({ "@type": "ListItem", position, name, item });
  const trail = (...itemListElement: object[]) => [{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement }];

  assert.deepEqual(structuredData({ kind: "home", season: now }, { label: "2026–27" }, "2026–27 NBA Elo ratings", url), [
    { "@context": "https://schema.org", "@type": "WebSite", name: "SwishRank", url: "https://swishrank.com/" },
  ]);
  assert.deepEqual(structuredData({ kind: "home", season: now, conference: "East" }, { label: "2026–27" }, "East", url), []);
  assert.deepEqual(structuredData({ kind: "home", season: then }, { label: "2015–16" }, "2015–16 NBA Elo ratings", url), []);
  assert.deepEqual(structuredData({ kind: "about" }, { label: "2026–27" }, "How the ratings work", url), []);
  assert.deepEqual(structuredData(undefined, { label: "2026–27" }, "Not found", url), []);

  assert.deepEqual(
    structuredData({ kind: "team", season: then, abbr: "ATL" }, { label: "2015–16" }, "Atlanta Hawks", url),
    trail(item(1, "2015–16 NBA Elo ratings", "https://swishrank.com/2015-16/"), item(2, "Atlanta Hawks", "https://swishrank.com/2015-16/teams/atl/")),
  );
  assert.deepEqual(
    structuredData({ kind: "game", season: now, game: { t: "2026-11-02T00:00Z", home: "CHI", away: "CLE", neutral: false } }, { label: "2026–27" }, "Cavaliers at Bulls", url),
    trail(
      item(1, "2026–27 NBA Elo ratings", "https://swishrank.com/"),
      item(2, "Games", "https://swishrank.com/games/"),
      item(3, "Cavaliers at Bulls", "https://swishrank.com/games/2026-11-01/cle-at-chi/"),
    ),
  );
  assert.deepEqual(
    structuredData({ kind: "player", id: 4067017, name: "A.J. Lawson" }, { label: "2026–27" }, "A.J. Lawson", url),
    trail(item(1, "Players", "https://swishrank.com/players/"), item(2, "A.J. Lawson", "https://swishrank.com/players/a-j-lawson-4067017/")),
  );
});

test("a game page's document title gives the score once it is played, away team first, and before that says it is a prediction", () => {
  const team = (short: string) => ({ name: short, short, color: "000000", alternateColor: "ffffff" });
  const played: Game = { id: "1", t: "2015-10-28T00:00Z", home: "CHI", away: "CLE", hs: 97, as: 95, final: true, neutral: false, note: null };
  const ahead: Game = { id: "2", t: "2015-12-03T01:00Z", home: "CHI", away: "CLE", hs: null, as: null, final: false, neutral: false, note: null };
  const model = compute({ season: "2015-16", teams: { CHI: team("Bulls"), CLE: team("Cavaliers") }, games: [played, ahead] });
  assert.equal(gameTitle({ model }, gameView(model, played)), "Cavaliers 95, Bulls 97, Oct 27, 2015");
  assert.equal(gameTitle({ model }, gameView(model, ahead)), "Cavaliers vs Bulls prediction and win probability, Dec 2, 2015");
});
