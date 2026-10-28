import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, type Game } from "./elo.ts";
import { fixture } from "./fixtures.ts";
import { blockShare, gameView } from "./game.ts";

const colours = { color: "000000", alternateColor: "ffffff" };
const teams = Object.fromEntries(["OKC", "IND", "BOS"].map((a) => [a, { name: a, short: a, ...colours }]));
const game = (id: string, day: number, home: string, away: string, hs: number | null, as: number | null): Game => ({
  id, t: `2026-01-${String(day).padStart(2, "0")}T23:00Z`, home, away, hs, as, final: hs !== null, neutral: false, note: null,
});

// On days 1 to 6 OKC beats BOS and BOS beats IND, then IND beats OKC on day 10; OKC hosts IND again on day 20.
const games = [
  ...[1, 2, 3, 4, 5, 6].map((d) => game(`b${d}`, d, "OKC", "BOS", 120, 100)),
  ...[1, 2, 3, 4, 5, 6].map((d) => game(`i${d}`, d, "BOS", "IND", 115, 100)),
  game("upset", 10, "OKC", "IND", 100, 112),
  game("next", 20, "OKC", "IND", null, null),
];
const model = compute({ season: "2025-26", teams, games });

test("a game lists each team's last five games before it, oldest first, an upset marked on both sides, and the record it left", () => {
  const view = gameView(model, games.find((g) => g.id === "upset")!);
  assert.deepEqual(view.home.previous.map((g) => g.result.game.id), ["b2", "b3", "b4", "b5", "b6"]);
  assert.deepEqual(view.away.previous.map((g) => g.result.game.id), ["i2", "i3", "i4", "i5", "i6"]);
  assert.deepEqual(view.home.record, [6, 1]);
  assert.deepEqual(view.away.record, [1, 6]);
  const next = gameView(model, games.find((g) => g.id === "next")!);
  assert.deepEqual(next.away.previous.map((g) => [g.result.game.id, g.upset]), [["i3", false], ["i4", false], ["i5", false], ["i6", false], ["upset", true]]);
  assert.deepEqual(next.home.previous.map((g) => [g.result.game.id, g.upset]), [["b3", false], ["b4", false], ["b5", false], ["b6", false], ["upset", true]]);
});

test("a played game shows its chances at tip-off and an upset; a game to come shows today's chances and ratings", () => {
  const played = gameView(model, games.find((g) => g.id === "upset")!);
  const result = model.results.find((r) => r.game.id === "upset")!;
  assert.equal(played.home.chance, result.p);
  assert.deepEqual([played.away.upset, played.home.upset], [true, false]);
  const next = gameView(model, games.find((g) => g.id === "next")!);
  assert.equal(next.away.line, null);
  assert.equal(next.away.rating, model.r.IND);
  assert.equal(next.home.chance, fixture(next.game, model).lines[1].chance);
});

test("a block takes its team's share of the points once played, held off the edges so its name still fits", () => {
  const played = gameView(model, games.find((g) => g.id === "upset")!);
  assert.equal(blockShare(played, played.away), 112 / 212);
  const next = gameView(model, games.find((g) => g.id === "next")!);
  assert.equal(blockShare(next, { ...next.home, chance: 0.97 }), 0.76);
});

test("a played game shows each team's place as its day left it, not as it stands now", () => {
  // IND beats BOS four times after the upset, so IND ends the season 2nd where the upset left it 3rd.
  const later = [...games.filter((g) => g.id !== "next"), ...[11, 12, 13, 14].map((d) => game(`r${d}`, d, "IND", "BOS", 130, 90))];
  const m = compute({ season: "2025-26", teams, games: later });
  assert.equal(m.rank.IND, 2);
  assert.equal(gameView(m, later.find((g) => g.id === "upset")!).away.place, "3rd");
});

test("a playoff game names the series' leader and its score after the game, or a tie, and counts only playoff games in the record", () => {
  const round = (id: string, day: number, home: string, away: string, hs: number, as: number, n: number): Game => ({
    ...game(id, day, home, away, hs, as), note: `West 1st Round - Game ${n}`,
  });
  const series = [...games.filter((g) => g.final), round("p1", 21, "OKC", "IND", 110, 100, 1), round("p2", 23, "OKC", "IND", 99, 104, 2), round("p3", 25, "IND", "OKC", 95, 120, 3)];
  const m = compute({ season: "2025-26", teams, games: series });
  const at = (id: string) => gameView(m, series.find((g) => g.id === id)!).series;
  assert.deepEqual([at("p1"), at("p2"), at("p3"), at("upset")], ["OKC lead 1–0", "Series tied 1–1", "OKC lead 2–1", null]);
  assert.deepEqual(gameView(m, series.find((g) => g.id === "p3")!).home.record, [1, 2]);
});
