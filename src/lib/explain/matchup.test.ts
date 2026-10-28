import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, type Game } from "../elo.ts";
import { fixture } from "../fixtures.ts";
import { ahead, before, told, worked, type Pairing } from "./matchup.ts";

const team = (name: string) => ({ name, short: name, color: "000000", alternateColor: "ffffff" });
const game = (id: string, day: number, away: string, home: string, score: [number, number] | null, neutral = false): Game => ({
  id, t: `2026-10-${20 + day}T23:00Z`, home, away, hs: score?.[1] ?? null, as: score?.[0] ?? null, final: score !== null, neutral, note: null,
});

const model = compute({
  season: "2026-27",
  teams: Object.fromEntries(["A", "B", "C", "D", "E", "F"].map((a) => [a, team(a)])),
  games: [
    ...[0, 1, 2, 3, 4].map((d) => game(`ab${d}`, d, d % 2 ? "A" : "B", d % 2 ? "B" : "A", d % 2 ? [112, 100] : [95, 104])),
    game("cd", 1, "C", "D", [99, 120]),
    game("ec", 2, "E", "C", [101, 98]),
    game("fd", 3, "F", "D", [90, 118]),
    game("next ab", 9, "B", "A", null),
    game("next cd", 9, "C", "D", null),
    game("next fe", 9, "F", "E", null),
    game("next ca", 9, "C", "A", null),
    game("next neutral", 9, "D", "A", null, true),
  ],
});
const pairing = (over: Partial<Pairing>): Pairing => ({ away: "A", home: "B", neutral: false, r: { away: 1000, home: 1000 }, p: 0.5, ...over });

test("a listed game is worked out from today's ratings, at the chance the games page gives it", () => {
  for (const g of model.upcoming) {
    const listed = ahead(fixture(g, model), model);
    assert.deepEqual(listed.r, { away: model.r[g.away], home: model.r[g.home] }, g.id);
    assert.equal(listed.p, fixture(g, model).lines[1].chance, `${g.id} home side's chance`);
  }
});

test("a neutral-site game gets no home court", () => {
  const g = model.upcoming.find((u) => u.neutral)!;
  const listed = worked(ahead(fixture(g, model), model), model.home);
  assert.equal(listed.court, 0);
  assert.equal(listed.gap, listed.home - listed.away);
});

test("the shown figures add up to the shown gap, though rounding each differs from rounding the sum", () => {
  const w = worked(pairing({ r: { away: 900.4, home: 1040.5 } }), 64.5);
  assert.deepEqual([w.home, w.court, w.away, w.gap], [1041, 65, 900, 206]);
});

test("a played game is worked out from the ratings before it, at the chance it was given", () => {
  const last = model.results.at(-1)!;
  const shown = before(last, model);
  assert.deepEqual(shown.r, { away: last.pre.a, home: last.pre.h });
  assert.equal(shown.p, last.p);
});

test("says which side is ahead, by how much, with home court named only when it counts", () => {
  const names = { away: "Heat", home: "Hawks" };
  assert.equal(told({ away: 902, home: 1040, court: 64, gap: 202 }, names), "Hawks 1040 plus 64 for home court is 202 points above Heat 902.");
  assert.equal(told({ away: 1096, home: 949, court: 64, gap: -83 }, names), "Heat 1096 is 83 points above Hawks 949 plus 64 for home court.");
  assert.equal(told({ away: 1000, home: 1003, court: 0, gap: 3 }, names), "Hawks 1003 is 3 points above Heat 1000.");
});
