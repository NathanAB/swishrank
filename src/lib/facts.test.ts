import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compute, type Result } from "./elo.ts";
import { bySwing, finals, outcome } from "./facts.ts";

const last = compute(JSON.parse(readFileSync(new URL("../data/games/2025-26.json", import.meta.url), "utf8")));

test("the 2025-26 Finals went to the Knicks, 4-1 over the Spurs", () => {
  const f = finals(last);
  assert.deepEqual(f && { champion: f.champion, runnerUp: f.runnerUp, wins: f.wins, losses: f.losses }, { champion: "NY", runnerUp: "SA", wins: 4, losses: 1 });
});

const result = (pre: number, shift: number): Result => ({
  game: { id: "1", t: "2026-10-20T23:00Z", home: "DET", away: "BOS", hs: 121, as: 113, final: true, neutral: false, note: null },
  day: "2026-10-20", p: 0.6, shift,
  pre: { h: pre, a: 1500 }, post: { h: pre + shift, a: 1500 - shift },
  rankPre: { h: 1, a: 1 }, rankPost: { h: 1, a: 2 },
});

test("a game's change is the gap between the displayed ratings, not the rounded exchange", () => {
  // 1500.4 shows as 1500 and 1505.8 as 1506: the reader sees +6, though the exchange rounds to 5.
  assert.equal(outcome(result(1500.4, 5.4)).winner.change, 6);
});

test("biggest swing first", () => {
  const small = result(1500, 3);
  const large = result(1500, 12);
  assert.deepEqual(bySwing([small, large]).map((r) => r.shift), [12, 3]);
});
