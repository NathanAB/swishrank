import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { compute, ELO_PER_SIGMA, fitModel, PARAMS, START, winProb, WINS_PER_POINT, type Abbr, type SeasonData } from "./elo.ts";
import { modelInputs } from "./inputs.ts";

// Every season the site shows, read and rated as src/lib/season.ts does, injury reports included, so that players out
// for weeks hold gap slots.
const read = (path: string): unknown => {
  const url = new URL(`../data/${path}`, import.meta.url);
  return existsSync(url) ? JSON.parse(readFileSync(url, "utf8")) : undefined;
};
const list = read("seasons.json") as { id: string }[];
const files = list.map(({ id }) => ({ data: read(`games/${id}.json`) as SeasonData, box: read(`box/${id}.json`), preseason: read(`preseason/${id}.json`), injuries: read(`injuries/${id}.json`) }));
const inputs = modelInputs(files);
const scale = ELO_PER_SIGMA / PARAMS.sigma;
const seasons = files.map(({ data }) => {
  const days = fitModel(data, inputs.get(data.season)!);
  const model = compute(data, inputs.get(data.season));
  // A team's rating holds from its last game when the file has no game left for it, and is the latest fit's otherwise.
  const ratingDay = (a: Abbr) => (model.upcoming.some((g) => g.home === a || g.away === a) ? days.at(-1)!.day : model.log[a].at(-1)!.result.day);
  const fitOn = (day: string) => days.find((d) => d.day === day)!.after;
  return { id: data.season, model, ratingDay, fitOn };
});

test("every team's shown rating is 1000, its team part and what each player its rating counts adds", () => {
  let gaps = 0;
  for (const { id, model, ratingDay, fitOn } of seasons) {
    for (const a of model.abbrs) {
      const parts = model.players[a];
      gaps += parts.filter((p) => p.out).length;
      const sum = START + fitOn(ratingDay(a)).r[a] * scale + parts.reduce((s, p) => s + p.adds, 0);
      assert.ok(Math.abs(sum - model.r[a]) < 1e-9, `${id} ${a}: ${sum}, shown ${model.r[a]}`);
    }
  }
  assert.ok(gaps > 0, "some team counts a player out for weeks");
});

test("a player's wins are what his part of the rating is worth over an 82-game season against average teams", () => {
  for (const gap of [-20, -5, 5, 20]) {
    assert.ok(Math.abs(gap * WINS_PER_POINT - 82 * (winProb(gap) - 0.5)) < 0.01, `${gap} points: ${gap * WINS_PER_POINT} wins`);
  }
});
