import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, counted, fitSeason, PARAMS, phi, ranksOf, winProb, type Game, type SeasonData } from "./elo.ts";

const team = (name: string) => ({ name, short: name, color: "000000", alternateColor: "ffffff" });
const teams = (...abbrs: string[]) => Object.fromEntries(abbrs.map((a) => [a, team(a)]));
const game = (id: string, t: string, home: string, away: string, hs: number | null, as: number | null, neutral = false): Game => ({
  id, t, home, away, hs, as, final: hs !== null, neutral, note: null,
});
const near = (actual: number, expected: number, what: string) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);

test("a two-team toy season fits the least-squares answer, day by day", () => {
  // A wins by 10 at home, then B wins by 4 at home. With n0 = 1 and a home prior of weight 1 at 0, by symmetry
  // A = -B = x. Day one minimises (10 - 2x - h)^2 + 2x^2 + h^2, so x = h = 2.5. Day two adds (4 + 2x - h)^2,
  // so x = 1.2 and h = 14/3.
  const data: SeasonData = {
    season: "x", teams: teams("A", "B"),
    games: [game("1", "2026-10-20T23:00Z", "A", "B", 110, 100), game("2", "2026-10-21T23:00Z", "B", "A", 104, 100)],
  };
  const [one, two] = fitSeason(data, { n0: 1, margin: { kind: "raw" }, home: { kind: "fitted", centre: 0, weight: 1 } });
  near(one.after.r.A, 2.5, "A after day one");
  near(one.after.r.B, -2.5, "B after day one");
  near(one.after.home, 2.5, "home edge after day one");
  assert.deepEqual(two.before, one.after, "day two is predicted from day one's fit");
  near(two.after.r.A, 1.2, "A after day two");
  near(two.after.r.B, -1.2, "B after day two");
  near(two.after.home, 14 / 3, "home edge after day two");
});

test("a team that does not play keeps its rating, and a past opponent's results reach it on its next game day", () => {
  // A beats B, then B beats or loses to C while A rests, then A beats D. D has a game to come, so nothing is held.
  const world = (bWins: boolean): SeasonData => ({
    season: "x", teams: teams("A", "B", "C", "D"),
    games: [
      game("1", "2026-10-20T23:00Z", "A", "B", 110, 100, true), game("2", "2026-10-21T23:00Z", "B", "C", bWins ? 110 : 100, bWins ? 100 : 110, true),
      game("3", "2026-10-23T23:00Z", "A", "D", 105, 100, true), game("4", "2026-10-25T23:00Z", "D", "C", null, null),
    ],
  });
  const on = (d: SeasonData, day: string) => compute(d).series.find((x) => x.day === day)!.r.A;
  const [up, down] = [world(true), world(false)];
  assert.equal(on(up, "2026-10-21"), on(up, "2026-10-20"), "A keeps its rating on the day it rests");
  assert.equal(on(up, "2026-10-21"), on(down, "2026-10-21"), "whatever B did that day");
  assert.ok(on(up, "2026-10-23") > on(down, "2026-10-23"), "on A's next game day, B's win makes A's win over B count for more");
  // Without the freeze, as version 3's plan defines the fit, the re-fit moves A on the day it rests.
  const refit = fitSeason(world(true), { ...PARAMS, idle: undefined });
  assert.ok(refit[1].after.r.A > refit[0].after.r.A, "the plain re-fit lifts A without playing");
});

test("a game's ratings before and after are the team's ratings at the end of the day before and of its day", () => {
  // B and D have a game to come, so neither season is over and nothing holds a rating.
  const m = compute({
    season: "x", teams: teams("A", "B", "C", "D"),
    games: [game("1", "2026-10-20T23:00Z", "A", "B", 120, 100), game("2", "2026-10-21T23:00Z", "C", "A", 101, 100), game("3", "2026-10-23T23:00Z", "D", "B", null, null)],
  });
  const second = m.results[1];
  const [, dayOne, dayTwo] = m.series;
  assert.deepEqual(second.pre, { h: dayOne.r.C, a: dayOne.r.A });
  assert.deepEqual(second.post, { h: dayTwo.r.C, a: dayTwo.r.A });
});

test("home court makes the home side the favourite between level teams, and a neutral site gives no edge", () => {
  const m = compute({
    season: "x", teams: teams("A", "B", "C", "D"),
    games: [game("1", "2026-10-20T23:00Z", "A", "B", 110, 100), game("2", "2026-10-20T23:30Z", "C", "D", 110, 100, true)],
  });
  const [home, neutral] = m.results;
  assert.ok(home.p > 0.5, `home side's chance ${home.p}`);
  assert.equal(neutral.p, 0.5);
});

test("the win chance shown for a rating gap is the model's own chance for that game", () => {
  const data: SeasonData = {
    season: "x", teams: teams("A", "B", "C"),
    games: [game("1", "2026-10-20T23:00Z", "A", "B", 130, 100), game("2", "2026-10-21T23:00Z", "B", "C", 98, 100), game("next", "2026-10-22T23:00Z", "A", "C", null, null)],
  };
  const m = compute(data);
  const fit = fitSeason(data, PARAMS).at(-1)!.after;
  const next = m.upcoming[0];
  // C plays on the 21st, so the 22nd is its second night.
  near(winProb(m.gaps[next.id]), phi((fit.r.A - fit.r.C + fit.home + PARAMS.b2b) / PARAMS.sigma), "A's chance against C");
});

test("a 43-point win counts at most four times a 1-point win, and a loss counts as the same win negated", () => {
  const ratio = counted(43, PARAMS.margin) / counted(1, PARAMS.margin);
  assert.ok(ratio > 1 && ratio <= 4, `43 vs 1 counts ${ratio}x`);
  assert.equal(counted(-43, PARAMS.margin), -counted(43, PARAMS.margin));
});

test("equal displayed ratings share a rank and the next rank skips", () => {
  assert.deepEqual(ranksOf({ A: 1023.4, B: 1022.6, C: 1010, D: 1030 }), { D: 1, A: 2, B: 2, C: 4 });
});
