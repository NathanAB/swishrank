import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, type Game } from "./elo.ts";
import { closest, fixture, mostOneSided, nextDays } from "./fixtures.ts";

const game = (id: string, t: string, away: string, home: string, more: Partial<Game> = {}): Game => ({
  id, t, home, away, hs: null, as: null, final: false, neutral: false, note: null, ...more,
});

test("the week ahead is seven US Eastern days from today, in tip-off order, empty days kept", () => {
  const model = compute({
    season: "2026-27",
    teams: { A: { name: "A A", short: "A" }, B: { name: "B B", short: "B" } },
    games: [
      game("played", "2026-10-24T23:00Z", "A", "B", { hs: 100, as: 90, final: true }),
      game("stale", "2026-10-24T23:30Z", "A", "B"),
      // 11:30 PM Eastern on the 25th, though it is already the 26th in UTC.
      game("late", "2026-10-26T03:30Z", "B", "A"),
      game("early", "2026-10-25T23:00Z", "A", "B"),
      game("last", "2026-10-31T23:00Z", "A", "B"),
      game("beyond", "2026-11-01T23:00Z", "A", "B"),
    ],
  });
  const week = nextDays(model, "2026-10-25", 7);
  assert.deepEqual(
    week.map((d) => [d.day, d.fixtures.map((f) => f.game.id)]),
    [
      ["2026-10-25", ["early", "late"]],
      ["2026-10-26", []],
      ["2026-10-27", []],
      ["2026-10-28", []],
      ["2026-10-29", []],
      ["2026-10-30", []],
      ["2026-10-31", ["last"]],
    ],
  );
});

test("the spread sits with the favourite: home court counts, except at a neutral site", () => {
  const r = { STRONG: 1650, EVEN: 1500, WEAK: 1500 };
  const call = (g: Game) => {
    const f = fixture(g, r);
    return { fav: f.lines.find((l) => l.side === f.fav)?.abbr, spread: f.spread };
  };
  // Level teams: 100 points of home court is 3.6 points, 3.5 to the half point.
  assert.deepEqual(call(game("1", "2026-10-25T23:00Z", "WEAK", "EVEN")), { fav: "EVEN", spread: 3.5 });
  // 150 points better on the road: 50 net, 1.8 points, 2 to the half point.
  assert.deepEqual(call(game("2", "2026-10-25T23:00Z", "STRONG", "EVEN")), { fav: "STRONG", spread: 2 });
  // The same teams on neutral ground: 150 net, 5.4 points, 5.5.
  assert.deepEqual(call(game("3", "2026-10-25T23:00Z", "STRONG", "EVEN", { neutral: true })), { fav: "STRONG", spread: 5.5 });
});

test("the closest and the most one-sided game, by how far the favourite leans", () => {
  const r = { A: 1500, B: 1580, C: 1700 };
  const fixtures = [
    fixture(game("home edge", "2026-10-25T23:00Z", "A", "B"), r), // 180 net
    fixture(game("near even", "2026-10-25T23:30Z", "B", "A"), r), // 20 net, to the home side
    fixture(game("road favourite", "2026-10-26T00:00Z", "C", "A"), r), // 100 net, to the road side
  ];
  assert.deepEqual([closest(fixtures)?.game.id, mostOneSided(fixtures)?.game.id], ["near even", "home edge"]);
  assert.equal(closest([]), null);
});
