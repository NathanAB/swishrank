import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, counted, fitSeason, fitSeasonSteps, PARAMS, phi, playerPart, ranksOf, slotWorth, winProb, type Fit, type Game, type SeasonData, type SeasonInputs } from "./elo.ts";
import type { BoxLine, BoxRatings, Lineup, SeasonBox } from "./players.ts";

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

test("a team that does not play keeps its rating, and a past opponent's later results never reach it", () => {
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
  assert.equal(on(up, "2026-10-23"), on(down, "2026-10-23"), "on A's next game day, whatever B did since");
  // Without fixed opponents, as version 3's plan defines the fit, B's later win makes A's win over B count for more.
  const joint = (d: SeasonData) => fitSeason(d, { ...PARAMS, opponents: undefined })[2].after.r.A;
  assert.ok(joint(up) > joint(down), "the joint fit lets B's later result reach A");
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

/**
 * A toy season of four teams in which one player's on-court part rises by 40 on the 21st, and player 2 carries one of
 * 7 all along, which is no update: A's shown on-court update each game day, what the rise alone does to A's shown
 * rating on the 23rd, from two whole fits that differ only in it, and the steps before the update with and without it.
 */
function onCourtSplit(games: Game[], box: SeasonBox, risen: number) {
  const data: SeasonData = { season: "x", teams: teams("A", "B", "C", "D"), games };
  const athletes = [1, 2, 3, 5, 6];
  const boxed = (values: number[]) => Float64Array.from(values);
  const boxRatings: BoxRatings = {
    athletes, start: boxed([8, -3, 1, 0, 2]),
    after: new Map([["2026-10-20", boxed([10, -5, 3, 0, 2])], ["2026-10-21", boxed([10, -5, 3, 1, 1])], ["2026-10-23", boxed([11, -4, 3, 2, 1])]]),
  };
  const plus = (rise: number): BoxRatings => {
    const onCourt = (day: string) => athletes.map((a) => (a === 2 ? 7 : 0) + (a === risen && day >= "2026-10-21" ? rise : 0));
    return { athletes, start: boxRatings.start.map((x, j) => x + onCourt("")[j]), after: new Map([...boxRatings.after].map(([day, b]) => [day, b.map((x, j) => x + onCourt(day)[j])])) };
  };
  const inputs = (rise: number): SeasonInputs => ({ players: { box, ratings: plus(rise), boxRatings, lineups: new Map() } });
  const lineup: Lineup = [{ athlete: 1, share: 0.75 }, { athlete: 2, share: 0.625 }];
  const shown = (fit: Fit) => fit.r.A + playerPart(fit, lineup);
  const steps = fitSeasonSteps(data, PARAMS, inputs(40), "A");
  return {
    update: steps.map((s) => shown(s.after) - shown(s.unrefit)),
    want: shown(fitSeason(data, PARAMS, inputs(40)).at(-1)!.after) - shown(fitSeason(data, PARAMS, inputs(0)).at(-1)!.after),
    steps: (["priors", "others", "unrefit"] as const).map((k) => [k, shown(steps.at(-1)![k]), shown(fitSeasonSteps(data, PARAMS, inputs(0), "A").at(-1)![k])] as const),
  };
}
const line = (athlete: number, minutes: number): BoxLine => [athlete, minutes, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

test("the on-court update a refit makes while a team rests lands on its next game day, apart from every other step", () => {
  // A plays on the 20th and 23rd; its player 1 rises on the 21st, while only C and D play.
  const { update, want, steps } = onCourtSplit(
    [game("1", "2026-10-20T23:00Z", "A", "B", 110, 100), game("2", "2026-10-21T23:00Z", "C", "D", 105, 100), game("3", "2026-10-23T23:00Z", "A", "C", 100, 104)],
    { season: "x", games: { 1: { A: [line(1, 36), line(2, 30)], B: [line(3, 36)] }, 2: { C: [line(5, 36)], D: [line(6, 36)] }, 3: { A: [line(1, 34), line(2, 32)], C: [line(5, 30)] } } },
    1,
  );
  assert.ok(Math.abs(want) > 0.1, `the rise moves A by ${want}`);
  assert.deepEqual(update.slice(0, 2), [0, 0], "nothing on the day before the refit, nor on the refit day A rests");
  near(update[2], want, "A's on-court update on its next game day");
  for (const [k, risen, flat] of steps) near(risen, flat, `${k} on the 23rd reads as the season without the rise`);
});

test("the on-court update of a player who sits out his team's game on a refit day lands on his next game", () => {
  // A plays on the 20th, 21st and 23rd; its player 2 sits on the 21st, the day he rises.
  const { update, want, steps } = onCourtSplit(
    [game("1", "2026-10-20T23:00Z", "A", "B", 110, 100), game("2", "2026-10-21T23:00Z", "A", "D", 105, 100), game("3", "2026-10-23T23:00Z", "A", "C", 100, 104)],
    { season: "x", games: { 1: { A: [line(1, 36), line(2, 30)], B: [line(3, 36)] }, 2: { A: [line(1, 38)], D: [line(6, 36)] }, 3: { A: [line(1, 34), line(2, 32)], C: [line(5, 30)] } } },
    2,
  );
  assert.ok(Math.abs(want) > 0.1, `the rise moves A by ${want}`);
  near(update[1], 0, "nothing on the refit day he sits");
  near(update[2], want, "A's on-court update on his next game");
  for (const [k, risen, flat] of steps) near(risen, flat, `${k} on the 23rd reads as the season without the rise`);
});

test("a 43-point win counts at most four times a 1-point win, and a loss counts as the same win negated", () => {
  const ratio = counted(43, PARAMS.margin) / counted(1, PARAMS.margin);
  assert.ok(ratio > 1 && ratio <= 4, `43 vs 1 counts ${ratio}x`);
  assert.equal(counted(-43, PARAMS.margin), -counted(43, PARAMS.margin));
});

test("equal displayed ratings share a rank and the next rank skips", () => {
  assert.deepEqual(ranksOf({ A: 1023.4, B: 1022.6, C: 1010, D: 1030 }), { D: 1, A: 2, B: 2, C: 4 });
});

test("a slot is worth the drop when it turns into his gap slot, and a slot already out is worth nothing", () => {
  const fit: Fit = { r: {}, home: 0, v: new Map([[1, 1], [2, -0.5]]) };
  // Both in: 0.5 * 1 + 0.5 * -0.5 = 0.25. Player 1 out: his gap, BACKUP_GAP below the rest at most, is -0.3, so
  // 0.5 * -0.5 + 0.5 * -0.3 = -0.4. Player 2 out: his gap is -0.5 - 1 = -1.5, so 0.5 * 1 + 0.5 * -1.5 = -0.25.
  const worth = slotWorth(fit, [{ athlete: 1, share: 0.5 }, { athlete: 2, share: 0.5 }], 10);
  near(worth[0], 6.5, "player 1");
  near(worth[1], 5, "player 2");
  // Player 2 already out: 0.5 * 1 + 0.5 * -1.5 = -0.25; player 1 out as well: 0.5 * -0.3 + 0.5 * -0.5 = -0.4.
  const out = slotWorth(fit, [{ athlete: 1, share: 0.5 }, { athlete: -2, share: 0.5 }], 10);
  near(out[0], 1.5, "player 1 beside an absent player 2");
  assert.equal(out[1], 0);
});
