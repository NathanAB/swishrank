import { test } from "node:test";
import assert from "node:assert/strict";
import { counted, PARAMS, type FitRule, type Game, type SeasonData } from "./elo.ts";
import { HOME_TRAIL, trailingHomeEdges } from "./home.ts";

const team = (name: string) => ({ name, short: name, color: "000000", alternateColor: "ffffff" });
const teams = (...abbrs: string[]) => Object.fromEntries(abbrs.map((a) => [a, team(a)]));
const game = (id: string, t: string, home: string, away: string, hs: number | null, as: number | null, neutral = false): Game => ({
  id, t, home, away, hs, as, final: hs !== null, neutral, note: null,
});
const near = (actual: number, expected: number, what: string) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);
const RULE: FitRule = { n0: 96, margin: PARAMS.margin, home: PARAMS.home, b2b: 0.4 };
const NO_B2B: FitRule = { n0: 96, margin: PARAMS.margin, home: PARAMS.home };

/** A season of one home game on its first day, with home margin `margin`, games days apart so none is on a second night. */
const season = (id: string, margin: number): SeasonData => ({
  season: id, teams: teams("A", "B"),
  games: [game(`${id}-1`, `20${id.slice(2, 4)}-11-01T23:00Z`, "A", "B", 100 + margin, 100)],
});

test("a season with none before it gets the fallback, from no games", () => {
  const edges = trailingHomeEdges([season("2015-16", 10)], RULE);
  assert.deepEqual(edges.get("2015-16"), { value: HOME_TRAIL.fallback, games: 0, from: [] });
});

test("the edge is the mean counted home margin, less the back-to-back term", () => {
  // Game 2 is B's second night (B played on day one), so the fit takes 0.4 off its counted margin; A rested.
  const before: SeasonData = {
    season: "2015-16", teams: teams("A", "B", "C"),
    games: [
      game("1", "2015-11-01T23:00Z", "C", "B", 105, 100),
      game("2", "2015-11-02T23:00Z", "A", "B", 110, 100),
    ],
  };
  const want = (counted(5, PARAMS.margin) + counted(10, PARAMS.margin) - 0.4) / 2;
  near(trailingHomeEdges([before, season("2016-17", 1)], RULE).get("2016-17")!.value, want, "with the back-to-back");
  const noB2b = (counted(5, PARAMS.margin) + counted(10, PARAMS.margin)) / 2;
  near(trailingHomeEdges([before, season("2016-17", 1)], NO_B2B).get("2016-17")!.value, noB2b, "a rule without one subtracts 0");
});

test("neutral and unfinished games do not count", () => {
  const before: SeasonData = {
    season: "2015-16", teams: teams("A", "B"),
    games: [
      game("1", "2015-11-01T23:00Z", "A", "B", 110, 100),
      game("2", "2015-11-05T23:00Z", "A", "B", 140, 100, true),
      game("3", "2015-11-09T23:00Z", "B", "A", null, null),
    ],
  };
  const edge = trailingHomeEdges([before, season("2016-17", 1)], RULE).get("2016-17")!;
  assert.equal(edge.games, 1);
  near(edge.value, counted(10, PARAMS.margin), "only the final home game");
});

test("only the seasons just before a season count, never the season itself or later ones", () => {
  const all = [season("2015-16", 40), season("2016-17", 2), season("2017-18", 4), season("2018-19", 6), season("2019-20", 30), season("2020-21", 50)];
  const edge = trailingHomeEdges(all, RULE).get("2019-20")!;
  assert.deepEqual(edge.from, ["2016-17", "2017-18", "2018-19"]);
  assert.equal(edge.games, 3);
  near(edge.value, (counted(2, PARAMS.margin) + counted(4, PARAMS.margin) + counted(6, PARAMS.margin)) / 3, "2016-17 to 2018-19");
  const shorter = trailingHomeEdges(all, RULE, { seasons: 1, fallback: 0 }).get("2019-20")!;
  assert.deepEqual(shorter.from, ["2018-19"]);
  near(shorter.value, counted(6, PARAMS.margin), "one season back");
});

test("seasons pooled by game, not averaged by season", () => {
  const big: SeasonData = {
    season: "2015-16", teams: teams("A", "B"),
    games: [game("1", "2015-11-01T23:00Z", "A", "B", 110, 100), game("2", "2015-11-05T23:00Z", "A", "B", 110, 100), game("3", "2015-11-09T23:00Z", "A", "B", 110, 100)],
  };
  const edge = trailingHomeEdges([big, season("2016-17", 2), season("2017-18", 1)], RULE).get("2017-18")!;
  near(edge.value, (3 * counted(10, PARAMS.margin) + counted(2, PARAMS.margin)) / 4, "four games, three of them from 2015-16");
});

test("seasons passed out of order are taken in season order", () => {
  const all = [season("2017-18", 4), season("2015-16", 2), season("2016-17", 6)];
  const edges = trailingHomeEdges(all, RULE);
  assert.deepEqual([...edges.keys()], ["2015-16", "2016-17", "2017-18"]);
  assert.deepEqual(edges.get("2016-17")!.from, ["2015-16"]);
  assert.deepEqual(edges.get("2017-18")!.from, ["2015-16", "2016-17"]);
  near(edges.get("2016-17")!.value, counted(2, PARAMS.margin), "2016-17 reads 2015-16 alone");
});
