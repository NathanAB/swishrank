import { test } from "node:test";
import assert from "node:assert/strict";
import type { Game, SeasonData } from "./elo.ts";
import { lineups, usualRotations, type BoxLine, type SeasonBox } from "./players.ts";

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

test("a team's usual rotation is everyone in its last 10 games, each at his minutes per team game, scaled to 240", () => {
  // Player 2 plays A's first game only, for 40 minutes; player 1 plays all twelve, 30 minutes then 20.
  const games = Array.from({ length: 12 }, (_, i) => ({ ...game(String(i + 1), 10 + i) }));
  const data: SeasonData = { season: "x", teams: { A: team("A"), B: team("B") }, games };
  const box: SeasonBox = {
    season: "x",
    games: Object.fromEntries(games.map((g, i) => [g.id, { A: i === 0 ? [line(1, 30), line(2, 40)] : [line(1, 20)], B: [line(9, 30)] }])),
  };
  const rotation = usualRotations([{ data, box }]).get("x")!;
  const shares = (day: number) => Object.fromEntries(rotation.get(`2026-10-${10 + day}`)!.A!.map((p) => [p.athlete, (p.share * 48).toFixed(6)]));
  const of = (minutes: Record<number, number>) => Object.fromEntries(Object.entries(minutes).map(([a, m]) => [a, m.toFixed(6)]));
  assert.deepEqual(shares(0), of({ 1: 240 * (30 / 70), 2: 240 * (40 / 70) }));
  assert.deepEqual(shares(9), of({ 1: 240 * (21 / 25), 2: 240 * (4 / 25) }), "player 1 averages (30 + 9 * 20) / 10 a game, player 2 40 / 10");
  assert.deepEqual(shares(10), of({ 1: 240 }), "player 2 has missed A's last 10 games");
});

test("until a team has played 10 games, a player's minutes per game last season count as one more game", () => {
  // Last season player 1 played two games for B, 30 and 42 minutes. This season he and player 3, a rookie, play
  // 18 minutes in each of A's games.
  const at = (season: string, month: string, n: number) => Array.from({ length: n }, (_, i) => ({ ...game(`${season}${i + 1}`, 10 + i), t: `${month}-${10 + i}T23:00Z` }));
  const before = at("w", "2025-10", 2), now = at("x", "2026-10", 10);
  const seasons = [
    { data: { season: "w", teams: { A: team("A"), B: team("B") }, games: before }, box: { season: "w", games: Object.fromEntries(before.map((g, i) => [g.id, { A: [line(9, 30)], B: [line(1, i ? 42 : 30)] }])) } },
    { data: { season: "x", teams: { A: team("A"), B: team("B") }, games: now }, box: { season: "x", games: Object.fromEntries(now.map((g) => [g.id, { A: [line(1, 18), line(3, 18)], B: [line(9, 30)] }])) } },
  ];
  const rotation = usualRotations(seasons).get("x")!;
  const minutes = (day: number) => Object.fromEntries(rotation.get(`2026-10-${10 + day}`)!.A!.map((p) => [p.athlete, (p.share * 48).toFixed(6)]));
  assert.deepEqual(minutes(0), { 1: (240 * (27 / 45)).toFixed(6), 3: (240 * (18 / 45)).toFixed(6) }, "player 1 counts (18 + 36) / 2, player 3 18");
  assert.deepEqual(minutes(8), { 1: (240 * (19.8 / 37.8)).toFixed(6), 3: (240 * (18 / 37.8)).toFixed(6) }, "player 1 counts (9 * 18 + 36) / 10");
  assert.deepEqual(minutes(9), { 1: "120.000000", 3: "120.000000" }, "from A's 10th game, this season alone");
});
