import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, EARLY, ELO_PER_SIGMA, expected, fitSeason, PARAMS, phi, played, playerPart, secondNights, b2bTerm, type Game, type SeasonData } from "./elo.ts";
import { fixture } from "./fixtures.ts";
import { modelInputs } from "./inputs.ts";
import type { BoxLine, Lineup } from "./players.ts";

const season = "2026-27";
const team = (name: string) => ({ name, short: name, color: "000000", alternateColor: "ffffff" });
const game = (id: string, day: number, away: string, home: string, as: number | null = null, hs: number | null = null): Game => ({
  id, t: `2026-10-${day}T23:00Z`, home, away, hs, as, final: hs !== null, neutral: false, note: null,
});
const line = (athlete: number, minutes: number, points: number): BoxLine => [athlete, minutes, points, 4, 8, 2, 2, 1, 3, 2, 1, 0, 1, 2];
const roster = (base: number, points: number) => [line(base, 36, points), line(base + 1, 30, points - 4), line(base + 2, 24, 6)];

// Three game days played, then A hosts B on the 24th, B's second night, and C hosts D on the 26th, both rested.
const data: SeasonData = {
  season,
  teams: Object.fromEntries(["A", "B", "C", "D"].map((a) => [a, team(a)])),
  games: [
    game("1", 21, "B", "A", 100, 110), game("2", 21, "D", "C", 98, 101),
    game("3", 22, "C", "A", 104, 99), game("4", 23, "D", "B", 95, 107),
    game("5", 24, "B", "A"), game("6", 26, "D", "C"),
  ],
};
const box = {
  season,
  games: {
    1: { A: roster(10, 24), B: roster(20, 20) }, 2: { C: roster(30, 18), D: roster(40, 16) },
    3: { A: roster(10, 22), C: roster(30, 20) }, 4: { B: roster(20, 22), D: roster(40, 14) },
  },
};
const preseason = { season, games: 82, totals: { A: 55, B: 46, C: 38, D: 25 }, source: "test" };
const inputs = modelInputs([{ data, box, preseason }]).get(season)!;
const model = compute(data, inputs);

test("opening night shows each team's seed, read from its preseason win total", () => {
  const opening = model.series[0].r;
  const byTotal = [...model.abbrs].sort((x, y) => preseason.totals[y] - preseason.totals[x] || x.localeCompare(y));
  const byOpening = [...model.abbrs].sort((x, y) => opening[y] - opening[x] || x.localeCompare(y));
  assert.deepEqual(byOpening, byTotal);
  const perWin = (PARAMS.seed.scale / preseason.games) * (ELO_PER_SIGMA / PARAMS.sigma);
  assert.ok(Math.abs(opening.A - opening.D - perWin * (preseason.totals.A - preseason.totals.D)) < 1e-9, `A ${opening.A}, D ${opening.D}`);
  const days = model.series.map((d) => d.r.D);
  assert.deepEqual(model.stats.D, { hi: Math.max(...days), lo: Math.min(...days) }, "hi and lo run from the seed, not from 1000");
});

test("a game to come gets the model's chance: team parts, each side's next lineup, home court and the back-to-back", () => {
  const days = fitSeason(data, PARAMS, { centres: inputs.centres, players: { ...inputs.players!, lineups: inputs.players!.lineups.previous } });
  const next: Record<string, Lineup> = Object.fromEntries(model.abbrs.map((a) => [a, []]));
  for (const { day } of days) Object.assign(next, inputs.players!.lineups.next.get(day));
  const fit = days.at(-1)!.after;
  const second = secondNights(data);
  assert.deepEqual(model.upcoming.map((g) => [g.id, model.b2b[g.id] !== 0]), [["5", true], ["6", false]]);
  for (const game of model.upcoming) {
    const e = expected(fit, { game: { ...game, hs: 0, as: 0 }, b2b: b2bTerm(PARAMS, second.get(game.id)!), lineup: { home: next[game.home], away: next[game.away] } });
    const widen = played(model.log, game) < EARLY.games ? EARLY.widen : 1;
    const p = fixture(game, model).lines[1].chance;
    assert.ok(Math.abs(p - phi(e / (PARAMS.sigma * widen))) < 1e-9, `${game.id}: ${p}`);
  }
});

// Last season player 99 starred for E; this season A brings him in for its second game, a 35-point loss at C.
// D has yet to play.
const lastSeason: SeasonData = {
  season: "2025-26",
  teams: { A: team("A"), E: team("E") },
  games: [21, 22, 23, 24, 25].map((day) => ({ ...game(`old${day}`, day, "A", "E", 100, 112), t: `2025-10-${day}T23:00Z` })),
};
const lastBox = { season: "2025-26", games: Object.fromEntries(lastSeason.games.map((g) => [g.id, { A: roster(10, 18), E: [line(99, 36, 45), ...roster(50, 16)] }])) };
const switched: SeasonData = {
  season,
  teams: data.teams,
  games: [game("1", 21, "B", "A", 100, 110), game("2", 22, "A", "C", 90, 125), game("3", 22, "B", "D")],
};
const switchedBox = { season, games: { 1: { A: roster(10, 24), B: roster(20, 20) }, 2: { A: [...roster(10, 12).slice(0, 2), line(99, 36, 30)], C: roster(30, 30) } } };
const seasonsWith = (box: unknown) => modelInputs([{ data: lastSeason, box: lastBox, preseason: { ...preseason, season: "2025-26", totals: { A: 41, E: 41 } } }, { data: switched, box, preseason }]);
const withStar = compute(switched, seasonsWith(switchedBox).get(season));

test("a team's new player shows on the chart on his first day, never in the game's change", () => {
  const second = withStar.log.A[1];
  assert.equal(second.result.game.id, "2");
  assert.ok(second.result.post.a < second.result.pre.a, `A lost by 35 and went from ${second.result.pre.a} to ${second.result.post.a}`);
  const day = withStar.series.find((d) => d.day === second.result.day)!;
  assert.ok(day.r.A > second.result.post.a + 20, `A's chart that day, ${day.r.A}, counts player 99; the game's ${second.result.post.a} does not`);
});

test("a team's opening point counts the players of its first game once it is played, and its seed alone until then", () => {
  const inputs = seasonsWith(switchedBox).get(season)!;
  const start = fitSeason(switched, PARAMS, { centres: inputs.centres, players: { ...inputs.players!, lineups: inputs.players!.lineups.previous } })[0].before;
  const firstGame = playerPart(start, inputs.players!.lineups.rotation.get("2026-10-21")!.A!);
  assert.ok(Math.abs(firstGame) > 0.05, `A's first game's players are worth ${firstGame}`);
  const opening = withStar.series[0].r;
  const seedGap = PARAMS.seed.scale * ((preseason.totals.A - preseason.totals.D) / preseason.games);
  const want = (seedGap + firstGame) * (ELO_PER_SIGMA / PARAMS.sigma);
  assert.ok(Math.abs(opening.A - opening.D - want) < 1e-9, `A ${opening.A}, D ${opening.D}, gap wanted ${want}`);
});

test("every day's shown ratings average 1000", () => {
  for (const { day, r } of withStar.series) {
    const mean = Object.values(r).reduce((s, x) => s + x, 0) / Object.keys(r).length;
    assert.ok(Math.abs(mean - 1000) < 1e-9, `${day}: ${mean}`);
  }
});
