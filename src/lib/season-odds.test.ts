import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

// The odds read the data through import.meta.glob, so they load through Vite, as the dev server loads them.
const server = await createServer({ root: new URL("../..", import.meta.url).pathname, configFile: false, logLevel: "error", server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { allSeasons, currentSeason } = (await server.ssrLoadModule("/src/lib/season.ts")) as typeof import("./season.ts");
const { currentOdds, oddsHistory } = (await server.ssrLoadModule("/src/lib/season-odds.ts")) as typeof import("./season-odds.ts");

test("the season in progress has odds for every team, after its latest day, its title race ending on them", () => {
  const season = currentSeason();
  const odds = currentOdds();
  assert.ok(odds);
  assert.deepEqual(Object.keys(odds.teams).sort(), [...season.model.abbrs].sort());
  const total = Object.values(odds.teams).reduce((s, o) => s + o.playoffs, 0);
  assert.ok(Math.abs(total - 1600) < 2, `playoff places ${total}`);
  const last = odds.history[odds.history.length - 1];
  assert.equal(last.day, odds.day);
  for (const [a, o] of Object.entries(odds.teams)) assert.equal(last.title[a], o.title);
  assert.ok(odds.history.every((d, i) => i === 0 || d.day > odds.history[i - 1].day));
});

test("every finished season has its title race on file, through its regular season", () => {
  for (const season of allSeasons().filter((s) => !s.current)) {
    const race = oddsHistory(season);
    assert.ok(race && race.length > 100, `${season.id} has no title race in src/data/odds/ (npm run odds -- ${season.id})`);
    assert.deepEqual(Object.keys(race[0].title).sort(), [...season.model.abbrs].sort(), season.id);
  }
});
