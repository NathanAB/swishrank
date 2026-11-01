// Fetch a season's NBA games from ESPN's public scoreboard into src/data/games/<season>.json, the box score of
// every final game src/data/box/<season>.json lacks from ESPN's game summary, and the day's injury report into
// src/data/injuries/<season>.json. For a season in progress, the rest of its regular-season schedule past the games
// file's two weeks goes into src/data/schedule/<season>.json for the odds. Then src/data/players.json gets the name of every player in the box scores
// and injury reports: from each summary the box step reads, and from ESPN's athlete page for any still missing; and
// src/data/draft.json the draft of every player in the box scores it lacks, from the same page (docs/model-v4.md).
//
//   node scripts/fetch-season.mjs            seasons still in progress (no "end" in seasons.json)
//   node scripts/fetch-season.mjs 2025-26    one season by id
//   node scripts/fetch-season.mjs --names    only the names players.json lacks
//
// ESPN's scoreboard takes one date per request (date ranges return 400), so this walks the season day by day.

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { dayKey } from "../src/lib/elo.ts";
import { boxLines, fetchEvents, fetchJson, lostFinals, parse, playerNames } from "../src/lib/espn.ts";
import { parseDraft } from "../src/lib/draft.ts";
import { parseArchive, parseFeed, withReport } from "../src/lib/injuries.ts";
import { stage } from "../src/lib/teams.ts";

const SEASONS = JSON.parse(await readFile(new URL("../src/data/seasons.json", import.meta.url), "utf8"));
const OUT_DIR = new URL("../src/data/games/", import.meta.url);
const BOX_DIR = new URL("../src/data/box/", import.meta.url);
const INJURY_DIR = new URL("../src/data/injuries/", import.meta.url);
const SCHEDULE_DIR = new URL("../src/data/schedule/", import.meta.url);
const NAMES_FILE = new URL("../src/data/players.json", import.meta.url);
const DRAFT_FILE = new URL("../src/data/draft.json", import.meta.url);
const INJURIES = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries";
const ATHLETE = (id) => `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}`;
const SUMMARY = (id) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${id}`;
const URL_FOR = (ymd) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${ymd}`;
// Two weeks of games ahead, so a team's page can always show its next five.
const FIXTURE_DAYS = 14;

const DAY = 86_400_000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// Only id to name: the repository is public, so nothing else about a player is kept.
const names = JSON.parse(await readFile(NAMES_FILE, "utf8").catch(() => "{}"));

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
        const summary = await fetchJson(SUMMARY(g.id));
        Object.assign(names, playerNames(summary));
        const lines = boxLines(summary);
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

// The regular season's games scheduled past the games file, for the odds (src/lib/schedule.ts), through April 30 of
// the season's second year, which is past any regular season's end. A failed or empty fetch keeps the file as it was
// and only warns: the odds fill what a team lacks with stand-in games, where a failed run would hold back scores.
async function fetchSchedule(season) {
  try {
    const days = [];
    const last = Date.parse(`${Number(season.id.slice(0, 4)) + 1}-04-30`);
    for (let d = Date.now() + (FIXTURE_DAYS + 1) * DAY; d <= last; d += DAY) days.push(isoDay(d));
    const perDay = [];
    for (let i = 0; i < days.length; i += 8) perDay.push(...(await Promise.all(days.slice(i, i + 8).map(fetchDay))));
    const byId = new Map(perDay.flatMap((events) => parse(season.id, events, {})).filter((g) => !g.final && stage(g.note).phase === "regular").map((g) => [g.id, g]));
    const games = [...byId.values()].sort((a, b) => a.t.localeCompare(b.t) || a.id.localeCompare(b.id)).map(({ id, t, home, away, neutral, note }) => ({ id, t, home, away, neutral, note }));
    if (days.length && !games.length) return console.warn(`${season.id}: ESPN has no games scheduled past the next ${FIXTURE_DAYS} days, so the schedule stays as it was`);
    await mkdir(SCHEDULE_DIR, { recursive: true });
    await writeFile(new URL(`${season.id}.json`, SCHEDULE_DIR), JSON.stringify({ season: season.id, games }) + "\n");
    console.log(`${season.id}: ${games.length} regular-season games scheduled past the next ${FIXTURE_DAYS} days`);
  } catch (err) {
    console.warn(`${season.id}: no schedule this time: ${err.message}`);
  }
}

// A missing day costs the team pages' History section only that day's injury lines, so a failed, empty or
// unreadable report is a warning and never fails the run.
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
    const fetched = new Date().toISOString();
    const day = dayKey(fetched);
    if (day in archive.days) return console.log(`${id}: the injury report for ${day} is already saved`);
    await mkdir(INJURY_DIR, { recursive: true });
    await writeFile(file, JSON.stringify(withReport(archive, day, { fetched, injuries })) + "\n");
    console.log(`${id}: injury report for ${day}, ${injuries.length} players, ${dropped} malformed entries dropped`);
  } catch (err) {
    console.warn(`${id}: no injury report this time: ${err.message}`);
  }
}

const readAll = async (dir) =>
  Promise.all((await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".json")).map(async (f) => JSON.parse(await readFile(new URL(f, dir), "utf8"))));

// A name ESPN cannot give leaves the player out, never a stand-in, so the next run asks again; the site then
// shows no name for him, where a failed run would hold back scores.
async function fetchNames() {
  const boxes = await readAll(BOX_DIR), archives = await readAll(INJURY_DIR);
  const wanted = new Set([
    ...boxes.flatMap((box) => Object.values(box.games).flatMap((teams) => Object.values(teams).flat().map((line) => line[0]))),
    ...archives.flatMap((archive) => Object.values(archive.days).flatMap((report) => report.injuries.map((i) => i.athlete))),
  ]);
  const missing = [...wanted].filter((id) => !names[id]);
  let found = 0;
  for (let i = 0; i < missing.length; i += 8) {
    await Promise.all(missing.slice(i, i + 8).map(async (id) => {
      try {
        const name = (await fetchJson(ATHLETE(id))).athlete?.displayName;
        if (typeof name !== "string" || !name) throw new Error("no displayName");
        names[id] = name;
        found++;
      } catch (err) {
        console.warn(`no name for athlete ${id} this time: ${err.message}`);
      }
    }));
  }
  // Integer keys come out in ascending order whatever order they went in, so the file stays sorted.
  await writeFile(NAMES_FILE, JSON.stringify(names, null, 1) + "\n");
  console.log(`names: ${wanted.size} players, ${found} looked up, ${missing.length - found} still without a name`);
}

// A draft ESPN cannot give leaves the player out of the file, so the next run asks again. Version 4 reads it only
// for a rookie's starting level, and the site runs version 3.
async function fetchDrafts() {
  const draft = JSON.parse(await readFile(DRAFT_FILE, "utf8").catch(() => "{}"));
  const boxes = await readAll(BOX_DIR);
  const wanted = new Set(boxes.flatMap((box) => Object.values(box.games).flatMap((teams) => Object.values(teams).flat().map((line) => line[0]))));
  const missing = [...wanted].filter((id) => !(id in draft));
  let found = 0;
  for (let i = 0; i < missing.length; i += 8) {
    await Promise.all(missing.slice(i, i + 8).map(async (id) => {
      try {
        const athlete = (await fetchJson(ATHLETE(id))).athlete;
        if (!athlete?.id) throw new Error("no athlete");
        draft[id] = parseDraft(athlete.displayDraft);
        found++;
      } catch (err) {
        console.warn(`no draft for athlete ${id} this time: ${err.message}`);
      }
    }));
  }
  const keys = Object.keys(draft).sort((a, b) => Number(a) - Number(b));
  await writeFile(DRAFT_FILE, `{\n${keys.map((k) => `${JSON.stringify(k)}: ${JSON.stringify(draft[k])}`).join(",\n")}\n}\n`);
  console.log(`drafts: ${wanted.size} players, ${found} looked up, ${missing.length - found} still without one`);
}

const ids = process.argv.slice(2);
if (ids.includes("--names")) {
  await fetchNames();
} else {
  const targets = ids.length ? SEASONS.filter((s) => ids.includes(s.id)) : SEASONS.filter((s) => !s.end);
  if (ids.length && targets.length !== ids.length) throw new Error(`Unknown season in ${ids.join(", ")}`);
  for (const season of targets) {
    if (!season.end) await fetchInjuries(season.id);
    await fetchSeason(season);
    if (!season.end) await fetchSchedule(season);
  }
  await fetchNames();
  await fetchDrafts();
}
