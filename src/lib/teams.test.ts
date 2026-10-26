import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, type Game } from "./elo.ts";
import { nextGames, stage } from "./teams.ts";

test("Cup semifinals are regular-season games and conference semifinals are playoffs", () => {
  assert.deepEqual(stage("NBA Cup - Semifinals"), { phase: "regular", label: "Cup semifinal" });
  assert.deepEqual(stage("East Semifinals - Game 3"), { phase: "playoffs", label: "East semis game 3" });
});

test("a team's next games are the games page's week: today and the six days after it, in US Eastern days", () => {
  const game = (id: string, t: string): Game => ({ id, t, home: "A", away: "B", hs: null, as: null, final: false, neutral: false, note: null });
  const model = compute({
    season: "2026-27",
    teams: { A: { name: "A A", short: "A" }, B: { name: "B B", short: "B" } },
    // 11:30 PM Eastern on the 31st is already November 1 in UTC; the next evening is the eighth day.
    games: [game("yesterday", "2026-10-24T23:00Z"), game("last", "2026-11-01T03:30Z"), game("first", "2026-10-25T23:00Z"), game("eighth", "2026-11-01T23:00Z")],
  });
  assert.deepEqual(nextGames(model, "A", "2026-10-25").map((g) => g.id), ["first", "last"]);
});
