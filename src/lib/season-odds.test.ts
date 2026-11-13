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

test("the odds bring a player out for weeks back on his return date, though it is within 21 days", async () => {
  const { seasonInputs } = (await server.ssrLoadModule("/src/lib/season.ts")) as typeof import("./season.ts");
  const { fitModel, shownLineups } = (await server.ssrLoadModule("/src/lib/elo.ts")) as typeof import("./elo.ts");
  const { longAbsences } = (await server.ssrLoadModule("/src/lib/inputs.ts")) as typeof import("./inputs.ts");
  const { parseArchive } = (await server.ssrLoadModule("/src/lib/injuries.ts")) as typeof import("./injuries.ts");
  const { parseBox } = (await server.ssrLoadModule("/src/lib/players.ts")) as typeof import("./players.ts");
  const { returnsOutlook } = (await server.ssrLoadModule("/src/lib/returns.ts")) as typeof import("./returns.ts");
  const { readFileSync } = await import("node:fs");
  const read = (path: string) => JSON.parse(readFileSync(new URL(`../data/${path}`, import.meta.url), "utf8"));
  const m = allSeasons().find((s) => s.id === "2026-27")!.model;
  const inputs = seasonInputs("2026-27")!;
  const box = parseBox(read("box/2026-27.json"), "2026-27");
  const away = longAbsences(m.data, box, parseArchive(read("injuries/2026-27.json"), "2026-27"));
  // Ja Morant, out from Oct 30 with a return date of Dec 1: on Nov 11 that date is 20 days away.
  const outlook = returnsOutlook({ model: m, fits: fitModel(m.data, inputs), usual: shownLineups(m.data, inputs.players!.rotation), away, minutes: () => 30, end: "2027-04-11" }, "2026-11-11");
  assert.ok(outlook.POR.some((s) => s.day === "2026-12-01"), `Portland's steps: ${outlook.POR.map((s) => s.day).join(", ")}`);
});
