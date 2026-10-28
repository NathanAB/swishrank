import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compute, EARLY, ELO_PER_SIGMA, expected, fitSeason, PARAMS, phi, played, secondNights, b2bTerm, type SeasonData } from "./elo.ts";
import { fixture } from "./fixtures.ts";
import { modelInputs } from "./inputs.ts";
import type { Lineup } from "./players.ts";

const read = (path: string): unknown => JSON.parse(readFileSync(new URL(`../data/${path}`, import.meta.url), "utf8"));
const season = "2026-27";
const data = read(`games/${season}.json`) as SeasonData;
const preseason = read(`preseason/${season}.json`) as { games: number; totals: Record<string, number> };
const inputs = modelInputs([{ data, box: read(`box/${season}.json`), preseason }]).get(season)!;
const model = compute(data, inputs);

test("opening night shows each team's seed, read from its preseason win total", () => {
  const opening = model.series[0].r;
  const byTotal = [...model.abbrs].sort((x, y) => preseason.totals[y] - preseason.totals[x] || x.localeCompare(y));
  const byOpening = [...model.abbrs].sort((x, y) => opening[y] - opening[x] || x.localeCompare(y));
  assert.deepEqual(byOpening, byTotal);
  const [top, bottom] = [byTotal[0], byTotal.at(-1)!];
  const perWin = (PARAMS.seed.scale / preseason.games) * (ELO_PER_SIGMA / PARAMS.sigma);
  assert.ok(Math.abs(opening[top] - opening[bottom] - perWin * (preseason.totals[top] - preseason.totals[bottom])) < 1e-9, `${top} ${opening[top]}, ${bottom} ${opening[bottom]}`);
  const days = model.series.map((d) => d.r[bottom]);
  assert.deepEqual(model.stats[bottom], { hi: Math.max(...days), lo: Math.min(...days) }, "hi and lo run from the seed, not from 1000");
});

test("a game to come gets the model's chance: team parts, each side's next lineup, home court and the back-to-back", () => {
  const days = fitSeason(data, PARAMS, { centres: inputs.centres, players: { ...inputs.players!, lineups: inputs.players!.lineups.previous } });
  const next: Record<string, Lineup> = Object.fromEntries(model.abbrs.map((a) => [a, []]));
  for (const { day } of days) Object.assign(next, inputs.players!.lineups.next.get(day));
  const fit = days.at(-1)!.after;
  const second = secondNights(data);
  const ahead = model.upcoming.slice(0, 30);
  assert.ok(ahead.some((g) => model.b2b[g.id] !== 0), "some game ahead is a back-to-back");
  for (const game of ahead) {
    const e = expected(fit, { game: { ...game, hs: 0, as: 0 }, b2b: b2bTerm(PARAMS, second.get(game.id)!), lineup: { home: next[game.home], away: next[game.away] } });
    const widen = played(model.log, game) < EARLY.games ? EARLY.widen : 1;
    const p = fixture(game, model).lines[1].chance;
    assert.ok(Math.abs(p - phi(e / (PARAMS.sigma * widen))) < 1e-9, `${game.id}: ${p}`);
  }
});
