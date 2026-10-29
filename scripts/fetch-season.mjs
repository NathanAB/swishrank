// Fetch a season's NBA games from ESPN's public scoreboard into src/data/games/<season>.json, the box score of
// every final game src/data/box/<season>.json lacks from ESPN's game summary, and the day's injury report into
// src/data/injuries/<season>.json.
//
//   node scripts/fetch-season.mjs            seasons still in progress (no "end" in seasons.json)
//   node scripts/fetch-season.mjs 2025-26    one season by id
//
// ESPN's scoreboard takes one date per request (date ranges return 400), so this walks the season day by day.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dayKey } from "../src/lib/elo.ts";
import { boxLines, fetchEvents, fetchJson, lostFinals, parse } from "../src/lib/espn.ts";
import { parseArchive, parseFeed, withReport } from "../src/lib/injuries.ts";

const SEASONS = JSON.parse(await readFile(new URL("../src/data/seasons.json", import.meta.url), "utf8"));
const OUT_DIR = new URL("../src/data/games/", import.meta.url);
const BOX_DIR = new URL("../src/data/box/", import.meta.url);
const INJURY_DIR = new URL("../src/data/injuries/", import.meta.url);
const INJURIES = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries";
const SUMMARY = (id) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${id}`;
const URL_FOR = (ymd) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${ymd}`;
// Two weeks of games ahead, so a team's page can always show its next five.
const FIXTURE_DAYS = 14;

const DAY = 86_400_000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

const fetchDay = (day) => fetchEvents(URL_FOR(day.replaceAll("-", "")));

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
  const before = await readFile(file, "utf8").then((text) => JSON.parse(text).games, () => []);
  const lost = lostFinals(before, games);
  if (lost.length) throw new Error(`${season.id}: ESPN no longer has ${lost.length} final games (${lost.slice(0, 5).join(", ")}), so the file stays as it was`);
  await writeFile(file, JSON.stringify({ season: season.id, teams: sortedTeams, games }) + "\n");
  const done = games.filter((g) => g.final).length;
  console.log(`${season.id}: ${done} final, ${games.length - done} upcoming, ${Object.keys(teams).length} teams`);
  await fetchBox(season.id, games.filter((g) => g.final));
}

// A box score ESPN cannot give yet leaves its game out of the file, to be tried again on the next run: the model
// predicts from each team's latest game with lines, so a gap costs a little, where a failed run would hold back scores.
async function fetchBox(id, finals) {
  const file = new URL(`${id}.json`, BOX_DIR);
  const box = await readFile(file, "utf8").then((text) => JSON.parse(text), () => ({ season: id, games: {} }));
  const missing = finals.filter((g) => !box.games[g.id]);
  let added = 0;
  for (let i = 0; i < missing.length; i += 8) {
    await Promise.all(missing.slice(i, i + 8).map(async (g) => {
      try {
        const lines = boxLines(await fetchJson(SUMMARY(g.id)));
        if (Object.keys(lines).length) { box.games[g.id] = lines; added++; }
      } catch (err) {
        console.warn(`${id}: no box score for game ${g.id} this time: ${err.message}`);
      }
    }));
  }
  await mkdir(BOX_DIR, { recursive: true });
  await writeFile(file, JSON.stringify({ season: id, games: box.games }) + "\n");
  console.log(`${id}: box scores for ${added} more games, ${finals.length - Object.keys(box.games).length} final games without one`);
}

// The report only weighs who is expected to play in each team's shown rating, so a failed, empty or
// unreadable one is a warning and never fails the run.
async function fetchInjuries(id) {
  try {
    const { season, injuries, dropped } = parseFeed(await fetchJson(INJURIES));
    if (season !== id) return console.warn(`${id}: the injury report is for ${season ?? "no season"}, so none is saved`);
    if (!injuries.length) return console.warn(`${id}: the injury report is empty, so none is saved`);
    const file = new URL(`${id}.json`, INJURY_DIR);
    const archive = await readFile(file, "utf8").then((text) => parseArchive(JSON.parse(text), id), (err) => {
      if (err.code === "ENOENT") return { season: id, days: {} };
      throw err;
    });
    const day = dayKey(new Date().toISOString());
    if (day in archive.days) return console.log(`${id}: the injury report for ${day} is already saved`);
    await mkdir(INJURY_DIR, { recursive: true });
    await writeFile(file, JSON.stringify(withReport(archive, day, injuries)) + "\n");
    console.log(`${id}: injury report for ${day}, ${injuries.length} players, ${dropped} malformed entries dropped`);
  } catch (err) {
    console.warn(`${id}: no injury report this time: ${err.message}`);
  }
}

const ids = process.argv.slice(2);
const targets = ids.length ? SEASONS.filter((s) => ids.includes(s.id)) : SEASONS.filter((s) => !s.end);
if (ids.length && targets.length !== ids.length) throw new Error(`Unknown season in ${ids.join(", ")}`);
for (const season of targets) {
  if (!season.end) await fetchInjuries(season.id);
  await fetchSeason(season);
}
