import { test } from "node:test";
import assert from "node:assert/strict";
import type { Game, SeasonData } from "./elo.ts";
import { lineups, type BoxLine, type SeasonBox } from "./players.ts";

const team = (name: string) => ({ name, short: name, color: "000000", alternateColor: "ffffff" });
const game = (id: string, day: number): Game => ({
  id, t: `2026-10-${day}T23:00Z`, home: "A", away: "B", hs: 100, as: 90, final: true, neutral: false, note: null,
});
const line = (athlete: number, minutes: number): BoxLine => [athlete, minutes, 10, 4, 8, 2, 2, 1, 3, 2, 1, 0, 1, 2];

test("a game is predicted with the players of the team's previous game, never with those who played in it", () => {
  // Players 1 and 2 play the first game for A; player 2 sits out the second and player 3 comes in.
  const data: SeasonData = { season: "x", teams: { A: team("A"), B: team("B") }, games: [game("1", 20), game("2", 22), game("3", 24)] };
  const box: SeasonBox = {
    season: "x",
    games: {
      1: { A: [line(1, 30), line(2, 30)], B: [line(9, 30)] },
      2: { A: [line(1, 30), line(3, 30)], B: [line(9, 30)] },
      3: { A: [line(1, 30), line(2, 30)], B: [line(9, 30)] },
    },
  };
  const season = lineups([{ data, box }]).get("x")!;
  const players = (l: { athlete: number }[] | undefined) => l?.map((p) => p.athlete);
  assert.deepEqual(players(season.previous.get("1")!.home), [], "a team's first game has no players");
  assert.deepEqual(players(season.previous.get("2")!.home), [1, 2], "player 3 had not played yet");
  assert.deepEqual(players(season.previous.get("3")!.home), [1, 3], "player 2 missed the game before");
  assert.deepEqual(players(season.next.get("2026-10-22")!.A), [1, 3]);
});
