import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { addDays, compute, ELO_PER_SIGMA, fitModel, PARAMS, playerPart, playerParts, shownLineups, START, type Abbr, type SeasonData } from "./elo.ts";
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
  const shown = shownLineups(data, inputs.get(data.season)!.players?.rotation);
  return { id: data.season, model, days, shown, ratingDay, fitOn };
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

test("a player's week-ago part is what he added 7 days before his team's rating day, with that day's lineup", () => {
  let moved = 0;
  for (const { id, model, days, shown, ratingDay } of seasons) {
    for (const a of model.abbrs) {
      const then = days.findLast((d) => d.day <= addDays(ratingDay(a), -7));
      const lineup = then ? shown.after.get(then.day)![a] : shown.opening[a];
      const added = new Map(playerParts(then?.after ?? days[0].before, lineup, scale).map((p) => [p.athlete, p.adds]));
      for (const p of model.players[a]) {
        assert.ok(Math.abs((added.get(p.athlete) ?? 0) - p.weekAgo) < 1e-9, `${id} ${a} ${p.athlete}: ${p.weekAgo}, wanted ${added.get(p.athlete) ?? 0}`);
        if (!added.has(p.athlete)) moved++;
      }
    }
  }
  assert.ok(moved > 0, "some player joined his team's lineup within the week");
});

test("a team's rating without a player is the model's own: its team part and its lineup with his slot a gap slot", () => {
  let out = 0;
  for (const { id, model, days, ratingDay, fitOn, shown } of seasons) {
    for (const a of model.abbrs) {
      const day = days.findLast((d) => d.day <= ratingDay(a))!.day;
      const fit = fitOn(day);
      const lineup = shown.after.get(day)![a];
      for (const p of model.players[a]) {
        const without = START + (fit.r[a] + playerPart(fit, lineup.map((s) => (Math.abs(s.athlete) === p.athlete ? { ...s, athlete: -p.athlete } : s)))) * scale;
        assert.ok(Math.abs(model.r[a] - p.worth - without) < 1e-9, `${id} ${a} ${p.athlete}: ${model.r[a] - p.worth}, the model says ${without}`);
        if (p.out) {
          out++;
          assert.equal(p.worth, 0, `${id} ${a} ${p.athlete} is out`);
        }
      }
    }
  }
  assert.ok(out > 0, "some player is out for weeks");
});
