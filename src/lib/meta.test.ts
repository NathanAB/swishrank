import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, type Game } from "./elo.ts";
import { rating } from "./format.ts";
import { homeHeading, homeTitle, teamDescription } from "./meta.ts";

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
