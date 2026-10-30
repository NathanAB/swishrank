import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, type Result } from "./elo.ts";
import { outcome, ratingRange, upset, weekChange, weekFinding } from "./facts.ts";

const result = (pre: number, shift: number, p = 0.6): Result => ({
  game: { id: "1", t: "2026-10-20T23:00Z", home: "DET", away: "BOS", hs: 121, as: 113, final: true, neutral: false, note: null },
  day: "2026-10-20", p,
  pre: { h: pre, a: 1000 }, post: { h: pre + shift, a: 1000 - shift }, shown: { h: pre + shift, a: 1000 - shift },
});

test("a game's change is the gap between the displayed ratings, not the rounded move", () => {
  // 1000.4 shows as 1000 and 1005.8 as 1006: the reader sees +6, though the move rounds to 5.
  assert.equal(outcome(result(1000.4, 5.4)).winner.change, 6);
});

test("an upset is a win by the side whose pre-game chance shows under 35%", () => {
  // The home side wins each game; p is its chance. 34.6% shows as 35%, so that winner is not called an upset.
  assert.deepEqual([0.3, 0.344, 0.346, 0.45].map((p) => upset(outcome(result(1000, 5, p)))), [true, true, false, false]);
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

// A season of daily snapshots, one rating per team per day from opening night.
const days = (start: string, rows: Record<string, number[]>) => {
  const abbrs = Object.keys(rows);
  const n = rows[abbrs[0]].length;
  return {
    abbrs,
    data: { season: "2026-27", games: [], teams: Object.fromEntries(abbrs.map((a) => [a, { name: a, short: a, color: "000000", alternateColor: "ffffff" }])) },
    series: Array.from({ length: n }, (_, i) => ({
      day: new Date(Date.parse(start + "T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10),
      r: Object.fromEntries(abbrs.map((a) => [a, rows[a][i]])),
    })),
  };
};

test("the week's change runs from seven days before the latest day, between displayed ratings", () => {
  // Ten days: the change is day 9 against day 2. 1000.4 shows as 1000 and 1011.6 as 1012, so A shows +12.
  const m = days("2026-10-20", { A: [990, 995, 1000.4, 1003, 1004, 1006, 1008, 1009, 1010, 1011.6], B: [1000, 1000, 1010, 1008, 1006, 1004, 1002, 1000, 998, 995] });
  assert.deepEqual(weekChange(m), { from: "2026-10-22", change: { A: 12, B: -15 } });
});

test("in the season's first week the change runs from each team's seed", () => {
  const m = days("2026-10-20", { A: [1000, 1010, 1020], B: [1000, 990, 985] });
  assert.deepEqual(weekChange(m), { from: "2026-10-20", change: { A: 20, B: -15 } });
});

test("the week's finding names the biggest rise and fall, and who lost first place to whom", () => {
  // A led a week ago and falls under C; B rises most, but stays below the top.
  const m = days("2026-10-20", { A: [1100, 1100, 1100, 1090, 1080, 1075, 1070, 1062], B: [900, 900, 905, 915, 925, 935, 940, 950], C: [1080, 1080, 1080, 1080, 1080, 1080, 1080, 1080] });
  assert.equal(weekFinding(m, weekChange(m)!), "The B rose 50 points this week, the most in the league. The A fell 38 points and lost first place to the C.");
});

test("a quiet week has no finding", () => {
  // Nine days, so the week is measured as usual: A moved and came back, B never moved.
  const m = days("2026-10-20", { A: [1000, 1000, 1000, 1010, 1005, 1000, 1000, 1000, 1000], B: Array(9).fill(990) });
  assert.equal(weekFinding(m, weekChange(m)!), null);
});
