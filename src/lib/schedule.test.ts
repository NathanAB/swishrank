import { test } from "node:test";
import assert from "node:assert/strict";
import type { Game, SeasonData } from "./elo.ts";
import { fillSeason, parseSchedule, scheduledFixtures, SEASON_GAMES } from "./schedule.ts";
import { CONFERENCES } from "./teams.ts";

const abbrs = [...CONFERENCES.East, ...CONFERENCES.West];
const team = { name: "x", short: "x", color: "000000", alternateColor: "ffffff" };
const game = (id: string, t: string, home: string, away: string, final = false): Game => ({ id, t, home, away, hs: final ? 100 : null, as: final ? 90 : null, final, neutral: false, note: null });

test("stand-ins bring every team to 82 games, about half at home, and favour the formula's opponents", () => {
  const played = [game("1", "2026-10-21T00:00Z", "BOS", "NY", true), game("2", "2026-10-22T00:00Z", "LAL", "GS", true)];
  const filled = fillSeason(abbrs, played, 45, "2026-10-31", "2027-04-12");
  const count = new Map(abbrs.map((a) => [a, 0]));
  const home = new Map(abbrs.map((a) => [a, 0]));
  for (const g of [...played, ...filled]) { count.set(g.home, count.get(g.home)! + 1); count.set(g.away, count.get(g.away)! + 1); home.set(g.home, home.get(g.home)! + 1); }
  for (const a of abbrs) {
    assert.equal(count.get(a), SEASON_GAMES, a);
    assert.ok(Math.abs(home.get(a)! - SEASON_GAMES / 2) <= 2, `${a} at home ${home.get(a)}`);
  }
  // A division rival comes up four times, a team across the league twice.
  const meet = (x: string, y: string) => [...played, ...filled].filter((g) => (g.home === x && g.away === y) || (g.home === y && g.away === x)).length;
  assert.equal(meet("BOS", "NY"), 4);
  assert.equal(meet("BOS", "LAL"), 2);
  assert.ok(filled.every((g) => g.day > "2026-10-31" && g.day <= "2027-04-12" && g.synthetic));
});

test("a full schedule needs no stand-ins, and the last two games of a season short of them are filled", () => {
  const before = fillSeason(abbrs, [], 45, "2026-10-31", "2027-04-12");
  assert.equal(fillSeason(abbrs, before, 45, "2026-10-31", "2027-04-12").length, 0);
  assert.equal(fillSeason(abbrs, before.slice(30), 45, "2026-10-31", "2027-04-12").length, 30);
});

test("the schedule adds only the games the games file lacks, with each one's back-to-back", () => {
  const data: SeasonData = { season: "2026-27", teams: { BOS: team, NY: team, MIA: team }, games: [game("1", "2026-11-14T00:00Z", "BOS", "NY")] };
  const schedule = parseSchedule({ season: "2026-27", games: [
    { id: "1", t: "2026-11-14T00:00Z", home: "BOS", away: "NY", neutral: false, note: null },
    { id: "2", t: "2026-11-15T00:00Z", home: "MIA", away: "NY", neutral: false, note: null },
  ] }, "2026-27");
  const fixtures = scheduledFixtures(data, schedule, 45);
  assert.deepEqual(fixtures.map((f) => f.id), ["2"]);
  // NY played the night before, so MIA's edge is its home court and a little more.
  assert.ok(fixtures[0].edge > 45);
  assert.equal(parseSchedule(undefined, "2026-27"), undefined);
  assert.throws(() => parseSchedule({ season: "2025-26", games: [] }, "2026-27"));
});
