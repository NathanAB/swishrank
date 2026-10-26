import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, type Result } from "./elo.ts";
import { outcome, ratingRange } from "./facts.ts";

const result = (pre: number, shift: number): Result => ({
  game: { id: "1", t: "2026-10-20T23:00Z", home: "DET", away: "BOS", hs: 121, as: 113, final: true, neutral: false, note: null },
  day: "2026-10-20", p: 0.6,
  pre: { h: pre, a: 1500 }, post: { h: pre + shift, a: 1500 - shift },
});

test("a game's change is the gap between the displayed ratings, not the rounded move", () => {
  // 1500.4 shows as 1500 and 1505.8 as 1506: the reader sees +6, though the move rounds to 5.
  assert.equal(outcome(result(1500.4, 5.4)).winner.change, 6);
});

test("the rating range reaches the highs and lows a team held before today, so every day's line fits on it", () => {
  const game = (id: string, t: string, home: string, hs: number, as: number) =>
    ({ id, t, home, away: home === "A" ? "B" : "A", hs, as, final: true, neutral: false, note: null });
  // A peaks after winning night one, then gives most of it back: both teams end inside the range they held.
  const m = compute({
    season: "2026-27",
    teams: { A: { name: "Alpha", short: "Alpha", color: "000000", alternateColor: "ffffff" }, B: { name: "Beta", short: "Beta", color: "000000", alternateColor: "ffffff" } },
    games: [game("1", "2026-10-21T23:00Z", "A", 130, 100), game("2", "2026-10-22T23:00Z", "B", 110, 108)],
  });
  const { lo, hi } = ratingRange(m);
  const today = m.abbrs.map((a) => Math.round(m.r[a]));
  assert.ok(hi > Math.max(...today) && lo < Math.min(...today), "the range is wider than today's ratings");
  for (const day of m.series) for (const a of m.abbrs) {
    const v = Math.round(day.r[a]);
    assert.ok(lo <= v && v <= hi, `${a} on ${day.day} at ${v} fits ${lo} to ${hi}`);
  }
});
