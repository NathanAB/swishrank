// npm run odds -- [season ...]: a finished season's title race, each team's title and playoff chances on every day
// of its regular season (src/lib/odds.ts), written to src/data/odds/<season>.json for its home page. A finished
// season never changes, so this runs once when a season ends, and again for every season when the model or the
// simulation changes. Without seasons it writes every finished season that has no file yet.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { DraftFile } from "../src/lib/draft.ts";
import { compute, type SeasonData } from "../src/lib/elo.ts";
import { siteInputs } from "../src/lib/inputs.ts";
import { daySeed, HISTORY_RUNS, oddsDay, toHistoryFile } from "../src/lib/odds.ts";
import { DRIFT, setupAt, simulate } from "../src/lib/project.ts";
import { regularSeasonEnd } from "../src/lib/teams.ts";

const read = (path: string): unknown => {
  const url = new URL(`../src/data/${path}`, import.meta.url);
  return existsSync(url) ? JSON.parse(readFileSync(url, "utf8")) : undefined;
};
const list = read("seasons.json") as { id: string; end?: string }[];
const ids = list.map((s) => s.id).sort();
const finished = list.filter((s) => s.end).map((s) => s.id).sort();
const asked = process.argv.slice(2);
for (const id of asked) if (!finished.includes(id)) throw new Error(`${id} is not a finished season in src/data/seasons.json`);
const targets = asked.length ? asked : finished.filter((id) => !existsSync(new URL(`../src/data/odds/${id}.json`, import.meta.url)));

const files = ids.map((id) => ({ data: read(`games/${id}.json`) as SeasonData, box: read(`box/${id}.json`), preseason: read(`preseason/${id}.json`), injuries: read(`injuries/${id}.json`), nbaReports: read(`nba-reports/${id}.json`) }));
const inputs = siteInputs(files, read("draft.json") as DraftFile);
mkdirSync(new URL("../src/data/odds/", import.meta.url), { recursive: true });
for (const id of targets) {
  const t0 = Date.now();
  const model = compute(files.find((f) => f.data.season === id)!.data, inputs.get(id));
  const end = regularSeasonEnd(model) ?? model.series.at(-1)!.day;
  const days = model.series.map((s) => s.day).filter((d) => d <= end);
  const history = days.map((day) => oddsDay(day, simulate(setupAt(model, day, DRIFT), HISTORY_RUNS, daySeed(day))));
  writeFileSync(new URL(`../src/data/odds/${id}.json`, import.meta.url), JSON.stringify(toHistoryFile(id, HISTORY_RUNS, history)) + "\n");
  console.log(`${id}: ${days.length} days in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
