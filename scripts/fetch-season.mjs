// Fetch a season's NBA games from ESPN's public scoreboard into src/data/games/<season>.json.
//
//   node scripts/fetch-season.mjs            seasons still in progress (no "end" in seasons.json)
//   node scripts/fetch-season.mjs 2025-26    one season by id
//
// ESPN's scoreboard takes one date per request (date ranges return 400), so this walks the season day by day.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parse } from "../src/lib/espn.ts";

const SEASONS = JSON.parse(await readFile(new URL("../src/data/seasons.json", import.meta.url), "utf8"));
const OUT_DIR = new URL("../src/data/games/", import.meta.url);
const URL_FOR = (ymd) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${ymd}`;
const FIXTURE_DAYS = 7;

const DAY = 86_400_000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

async function fetchDay(day) {
  const res = await fetch(URL_FOR(day.replaceAll("-", "")));
  if (!res.ok) throw new Error(`ESPN ${day}: HTTP ${res.status}`);
  return (await res.json()).events ?? [];
}

async function fetchSeason(season) {
  const today = Date.now();
  const last = season.end ? Date.parse(season.end) : today + FIXTURE_DAYS * DAY;
  const days = [];
  for (let d = Date.parse(season.start); d <= last; d += DAY) days.push(isoDay(d));

  const perDay = [];
  for (let i = 0; i < days.length; i += 8) perDay.push(...(await Promise.all(days.slice(i, i + 8).map(fetchDay))));

  const teams = {};
  const byId = new Map(perDay.flatMap((events) => parse(season.id, events, teams)).map((g) => [g.id, g]));
  const games = [...byId.values()].sort((a, b) => a.t.localeCompare(b.t) || a.id.localeCompare(b.id));
  const sortedTeams = Object.fromEntries(Object.entries(teams).sort(([a], [b]) => a.localeCompare(b)));

  await mkdir(OUT_DIR, { recursive: true });
  const file = new URL(`${season.id}.json`, OUT_DIR);
  await writeFile(file, JSON.stringify({ season: season.id, teams: sortedTeams, games }) + "\n");
  const done = games.filter((g) => g.final).length;
  console.log(`${season.id}: ${done} final, ${games.length - done} upcoming, ${Object.keys(teams).length} teams`);
}

const ids = process.argv.slice(2);
const targets = ids.length ? SEASONS.filter((s) => ids.includes(s.id)) : SEASONS.filter((s) => !s.end);
if (ids.length && targets.length !== ids.length) throw new Error(`Unknown season in ${ids.join(", ")}`);
for (const season of targets) await fetchSeason(season);
