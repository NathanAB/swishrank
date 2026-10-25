import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, ranksOf, type SeasonData } from "./elo.ts";

const teams = { BOS: { name: "Boston Celtics", short: "Celtics" }, DET: { name: "Detroit Pistons", short: "Pistons" } };
const game = (over: Partial<SeasonData["games"][number]>) => ({
  id: "1", t: "2026-10-20T23:00Z", home: "DET", away: "BOS", hs: 121, as: 113, final: true, neutral: false, note: null, ...over,
});

test("opening-night exchange matches FiveThirtyEight's formula", () => {
  const [res] = compute({ season: "x", teams, games: [game({})] }).results;
  assert.ok(Math.abs(res.p - 0.640065) < 1e-6, `home win chance ${res.p}`);
  assert.ok(Math.abs(res.shift - 6.051781) < 1e-6, `points to the home team ${res.shift}`);
});

test("a neutral-site game gives no home-court edge", () => {
  const [res] = compute({ season: "x", teams, games: [game({ neutral: true })] }).results;
  assert.equal(res.p, 0.5);
});

test("equal displayed ratings share a rank and the next rank skips", () => {
  assert.deepEqual(ranksOf({ A: 1523.4, B: 1522.6, C: 1510, D: 1530 }), { D: 1, A: 2, B: 2, C: 4 });
});
