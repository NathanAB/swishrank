import { test } from "node:test";
import assert from "node:assert/strict";
import type { OddsDay } from "./odds.ts";
import { contenders, moveWords, NAMED, oddsPct, raceLead } from "./race.ts";

const day = (d: string, title: Record<string, number>): OddsDay => ({ day: d, title, playoffs: Object.fromEntries(Object.keys(title).map((a) => [a, 50])) });
const names: Record<string, string> = { A: "Aces", B: "Bears", C: "Cubs", D: "Dukes", E: "Eagles", F: "Foxes" };

test("chances are written whole, with the ends kept apart from 0% and 100%", () => {
  assert.deepEqual([0, 0.2, 0.5, 13.4, 99.4, 99.6, 100].map(oddsPct), ["0%", "<1%", "1%", "13%", "99%", ">99%", ">99%"]);
});

test("the race names the five likeliest, or a champion and the four that ran highest", () => {
  const h = [day("2026-10-20", { A: 30, B: 20, C: 15, D: 10, E: 5, F: 1 }), day("2026-10-21", { A: 25, B: 25, C: 10, D: 12, E: 2, F: 3 })];
  assert.equal(contenders(h, null).length, NAMED);
  assert.deepEqual(contenders(h, null), ["A", "B", "D", "C", "F"]);
  assert.ok(contenders(h, "F").includes("F"));
});

test("a week's move compares with seven days before, or with opening night in the first week", () => {
  const h = Array.from({ length: 10 }, (_, i) => day(`2026-10-${String(20 + i).padStart(2, "0")}`, { A: 10 + i, B: 20 - i }));
  assert.deepEqual(moveWords(h, "A", "title"), { text: "+7 this week", sign: 1 });
  assert.deepEqual(moveWords(h.slice(0, 3), "B", "title"), { text: "−2 since opening night", sign: -1 });
});

test("the headline names the leader and the week's biggest moves, or how a champion's chances ran", () => {
  const h = Array.from({ length: 9 }, (_, i) => day(`2026-10-${String(20 + i).padStart(2, "0")}`, { A: 10 + 2 * i, B: 30 - 2 * i }));
  assert.equal(raceLead(h, (a) => names[a], "2026–27", null), "The Aces have the best chance to win the title, at 26%. This week the Aces rose the most, from 12% to 26%, and the Bears fell the most, from 28% to 14%.");
  const done = raceLead(h, (a) => names[a], "2025–26", "A");
  assert.match(done, /^The Aces won the 2025–26 title\. They started the season with a 10% chance and peaked at 26% in late October\./);
});
