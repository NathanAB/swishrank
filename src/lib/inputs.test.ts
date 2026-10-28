import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, EARLY, ELO_PER_SIGMA, expected, fitSeason, PARAMS, phi, played, secondNights, b2bTerm, type Game, type SeasonData } from "./elo.ts";
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
