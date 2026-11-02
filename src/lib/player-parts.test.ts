import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { addDays, compute, ELO_PER_SIGMA, fitModel, PARAMS, START, type Abbr, type SeasonData } from "./elo.ts";
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
  return { id: data.season, model, days, ratingDay, fitOn };
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

test("a player's week is his value per 48 against the fit of 7 days before his team's rating day", () => {
  for (const { id, model, days, ratingDay } of seasons) {
    for (const a of model.abbrs) {
      const then = days.findLast((d) => d.day <= addDays(ratingDay(a), -7))?.after ?? days[0].before;
      for (const p of model.players[a].filter((p) => !p.out)) {
        const week = p.per48 - (then.v.get(p.athlete) ?? 0) * scale;
        assert.ok(Math.abs(week - p.week) < 1e-9, `${id} ${a} ${p.athlete}: ${p.week}, wanted ${week}`);
      }
    }
  }
});
