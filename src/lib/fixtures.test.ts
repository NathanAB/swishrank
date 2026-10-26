import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, type Game } from "./elo.ts";
import { fixture, nextDays } from "./fixtures.ts";

const game = (id: string, t: string, away: string, home: string, more: Partial<Game> = {}): Game => ({
  id, t, home, away, hs: null, as: null, final: false, neutral: false, note: null, ...more,
});

test("the week ahead is seven US Eastern days from today, in tip-off order, empty days kept", () => {
  const model = compute({
    season: "2026-27",
    teams: { A: { name: "A A", short: "A", color: "000000", alternateColor: "ffffff" }, B: { name: "B B", short: "B", color: "000000", alternateColor: "ffffff" } },
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

test("the favourite is the side at 50% or more, home court counted", () => {
  const model = { r: { STRONG: 1650, EVEN: 1500, WEAK: 1500 }, home: 100, log: { STRONG: [], EVEN: [], WEAK: [] } };
  const fav = (g: Game) => {
    const f = fixture(g, model);
    return f.lines.find((l) => l.side === f.fav)?.abbr;
  };
  // Level teams: home court makes the home side the favourite.
  assert.equal(fav(game("1", "2026-10-25T23:00Z", "WEAK", "EVEN")), "EVEN");
  // 150 points better on the road outweighs 100 of home court.
  assert.equal(fav(game("2", "2026-10-25T23:00Z", "STRONG", "EVEN")), "STRONG");
});

test("a game between teams with few games behind them gets a chance nearer even, which settles once both have five", () => {
  const g = game("1", "2026-10-25T23:00Z", "B", "A");
  const chance = (games: number) => {
    const log = { A: Array(games).fill(null), B: Array(games + 1).fill(null) };
    return fixture(g, { r: { A: 1600, B: 1500 }, home: 0, log }).lines[1].chance;
  };
  assert.ok(chance(4) < chance(5) - 0.04, `${chance(4)} vs ${chance(5)}`);
  assert.equal(chance(5), chance(40));
});
