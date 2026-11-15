import { test } from "node:test";
import assert from "node:assert/strict";
import type { Game, SeasonData } from "./elo.ts";
import { modelInputs } from "./inputs.ts";
import { keepEver, walkTimeline, type PlayerTimeline } from "./player-timeline.ts";
import type { BoxLine } from "./players.ts";

const team = (name: string) => ({ name, short: name, color: "000000", alternateColor: "ffffff" });
const game = (id: string, day: string): Game => ({ id, t: `${day}T23:00Z`, home: "A", away: "B", hs: 100, as: 90, final: true, neutral: false, note: null });
const line = (athlete: number, minutes: number): BoxLine => [athlete, minutes, 10, 4, 8, 2, 2, 1, 3, 2, 1, 0, 1, 2];

// Two seasons of A against B. Player 1 plays 250 minutes in each of A's first two games, so he passes 500 before the
// first weekly sample. Player 3 plays 100 a game: for B, then A from Oct 30, then B again in the next season, where his
// fifth game takes him to 500 exactly. Player 5 plays 10 minutes once and is never ranked.
const before: SeasonData = {
  season: "2024-25", teams: { A: team("A"), B: team("B") },
  games: [game("1", "2024-10-20"), game("2", "2024-10-22"), game("3", "2024-10-30"), game("4", "2024-11-02")],
};
const now: SeasonData = { season: "2025-26", teams: { A: team("A"), B: team("B") }, games: [game("5", "2025-10-21"), game("6", "2025-10-23")] };
const box = {
  "2024-25": {
    1: { A: [line(1, 250)], B: [line(3, 100)] },
    2: { A: [line(1, 250)], B: [line(3, 100), line(5, 10)] },
    3: { A: [line(1, 100), line(3, 100)], B: [line(2, 100)] },
    4: { A: [line(1, 100), line(3, 100)], B: [line(2, 100)] },
  },
  "2025-26": { 5: { A: [line(1, 100)], B: [line(3, 100)] }, 6: { A: [line(1, 100)], B: [line(3, 100), line(2, 100)] } },
};
const inputs = modelInputs([before, now].map((data) => ({ data, box: { season: data.season, games: box[data.season as keyof typeof box] }, preseason: undefined })));
const timeline = walkTimeline(
  [
    { id: "2025-26", label: "2025–26", current: true, data: now, inputs: inputs.get("2025-26")! },
    { id: "2024-25", label: "2024–25", current: false, data: before, inputs: inputs.get("2024-25")! },
  ],
  (a) => `Player ${a}`,
);
const player = (id: number) => timeline.players.find((p) => p.id === id);
const rated = (id: number) => player(id)?.v.map((v) => v !== null);

test("a finished season is read the day before its first game, weekly, and on its last game day; the season under way on every game day", () => {
  assert.deepEqual(timeline.days, ["2024-10-19", "2024-10-30", "2024-11-02", "2025-10-20", "2025-10-21", "2025-10-23"]);
  assert.deepEqual(timeline.seasons, [
    { id: "2024-25", label: "2024–25", from: 0, to: 2 },
    { id: "2025-26", label: "2025–26", from: 3, to: 5 },
  ]);
});

test("a player is ranked once his career minutes reach 500, counted across seasons", () => {
  assert.deepEqual(rated(1), [false, true, true, true, true, true], "500 minutes after A's second game");
  assert.deepEqual(rated(3), [false, false, false, false, true, true], "400 minutes in his first season, 500 after his first game in the next");
});

test("a player's stint opens at his first sample and wherever his team changes, the next season's from opening night", () => {
  assert.deepEqual(player(3)?.stints, [[0, "B"], [1, "A"], [3, "B"]]);
  assert.deepEqual(player(1)?.stints, [[0, "A"]]);
});

test("the walk holds every player, and the players page's table only those ever ranked near the top", () => {
  assert.deepEqual(timeline.players.map((p) => p.id).sort(), [1, 2, 3, 5]);
  assert.deepEqual(keepEver(timeline).map((p) => p.id).sort(), [1, 3]);
});

test("a player is kept when he was in the top `top` at any sample, and dropped when he never was", () => {
  const p = (name: string, v: (number | null)[]) => ({ id: name.charCodeAt(0), name, v, stints: [] });
  const t: PlayerTimeline = {
    days: ["2026-01-01", "2026-01-08"],
    seasons: [{ id: "x", label: "x", from: 0, to: 1 }],
    players: [p("W", [2, 1]), p("X", [10, 5]), p("Y", [8, 9]), p("Z", [1, 7])],
  };
  // Sample 0 ranks X, Y, W, Z; sample 1 ranks Y, Z, X, W. W is never in the top two.
  assert.deepEqual(keepEver(t, 2).map((x) => x.name), ["X", "Y", "Z"]);
});
