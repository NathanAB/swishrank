import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dayKey, TZ, type SeasonData } from "./elo.ts";
import { canonicalNote, fetchEvents, lostFinals, parse, type EspnEvent } from "./espn.ts";
import { stage } from "./teams.ts";

const side = (homeAway: "home" | "away", id: string, abbreviation: string) => ({
  homeAway,
  score: "100",
  team: { id, abbreviation, displayName: abbreviation, shortDisplayName: abbreviation, color: "000000", alternateColor: "ffffff" },
});
const event = (id: string, date: string, note?: string): EspnEvent => ({
  id,
  date,
  season: { type: 2 },
  status: { type: { name: "STATUS_FINAL", completed: true } },
  competitions: [{ neutralSite: false, notes: note ? [{ headline: note }] : [], competitors: [side("home", "13", "LAL"), side("away", "24", "SA")] }],
});

test("2019-20 games from the restart on July 30, 2020 are neutral, as the Orlando bubble was", () => {
  const games = parse("2019-20", [event("before", "2020-03-11T02:00Z"), event("restart", "2020-07-30T22:30Z"), event("finals", "2020-10-12T00:00Z")], {});
  assert.deepEqual(games.map((g) => [g.id, g.neutral]), [["before", false], ["restart", true], ["finals", true]]);
  assert.equal(parse("2020-21", [event("next", "2020-12-23T00:00Z")], {})[0].neutral, false);

  const stored: SeasonData = JSON.parse(readFileSync(new URL("../data/games/2019-20.json", import.meta.url), "utf8"));
  assert.deepEqual(stored.games.filter((g) => dayKey(g.t) >= "2020-07-30" && !g.neutral).map((g) => g.id), []);
});

test("a re-fetch reads ESPN's misdated 2019-20 games on the day they were played", () => {
  const day = (id: string, espnDate: string) => dayKey(parse("2019-20", [event(id, espnDate)], {})[0].t);
  assert.equal(day("401161490", "2020-02-24T12:00Z"), "2020-02-23");
  assert.equal(day("401161528", "2020-02-29T13:30Z"), "2020-02-28");
  assert.equal(day("401161530", "2020-03-01T11:00Z"), "2020-02-29");
  assert.equal(day("401161536", "2020-03-01T12:30Z"), "2020-02-29");
  assert.equal(day("other", "2020-03-01T12:30Z"), "2020-03-01");
});

test("a re-fetch reads the 2023-24 Cup semifinals, played in Las Vegas, as neutral", () => {
  const games = parse("2023-24", [event("401607494", "2023-12-07T22:00Z"), event("401607493", "2023-12-08T02:00Z")], {});
  assert.deepEqual(games.map((g) => g.neutral), [true, true]);
});

const gamesDir = new URL("../data/games/", import.meta.url);
const storedGames = readdirSync(gamesDir).flatMap((f) => (JSON.parse(readFileSync(new URL(f, gamesDir), "utf8")) as SeasonData).games);

test("no stored game tips off between 2 and 10 in the morning US Eastern, when no NBA game does", () => {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" });
  const early = (t: string) => Number(hour.format(new Date(t))) >= 2 && Number(hour.format(new Date(t))) < 10;
  assert.deepEqual(storedGames.filter((g) => early(g.t)).map((g) => g.id), []);
});

test("every stored Cup semifinal and final is neutral, as each was played in Las Vegas", () => {
  const lasVegas = storedGames.filter((g) => /^NBA (Cup|In-Season Tournament)( - Semifinals| Championship)$/.test(g.note ?? ""));
  assert.equal(lasVegas.length, 9);
  assert.deepEqual(lasVegas.filter((g) => !g.neutral).map((g) => g.id), []);
});

test("older seasons' playoff notes read as the same rounds as today's", () => {
  const same = (old: string, now: string) => assert.deepEqual(stage(canonicalNote(old)), stage(now), old);
  same("EASTERN CONFERENCE 1ST ROUND - GAME 1", "East 1st Round - Game 1");
  same("WEST 1st ROUND - GAME 5", "West 1st Round - Game 5");
  same("WESTERN CONFERENCE SEMIFINALS - GAME 2", "West Semifinals - Game 2");
  same("West Semifinals – Game 2", "West Semifinals - Game 2");
  same("EAST FINALS - GAME 7", "East Finals - Game 7");
  same("NBA FINALS - GAME 6", "NBA Finals - Game 6");
  assert.equal(stage(canonicalNote("WEST PLAY-IN - GAME 1")).phase, "play-in");
  assert.equal(canonicalNote("NBA LONDON GAME"), "NBA London Game");
  assert.equal(parse("2015-16", [event("1", "2016-04-17T17:00Z", "EASTERN CONFERENCE 1ST ROUND - GAME 1")], {})[0].note, "East 1st Round - Game 1");
});

test("a final game without two whole scores stops the fetch instead of counting as 0 or dropping out", () => {
  const scored = (score: string | undefined) => {
    const e = event("1", "2026-10-25T23:00Z");
    e.competitions[0].competitors[0].score = score;
    return e;
  };
  assert.equal(parse("2026-27", [scored("98")], {})[0].hs, 98);
  assert.throws(() => parse("2026-27", [scored("")], {}), /whole score/);
  assert.throws(() => parse("2026-27", [scored(undefined)], {}), /whole score/);
});

test("a fetch that no longer has a game as final is caught before it overwrites the season", () => {
  const g = (id: string, final: boolean) => ({ id, t: "2026-10-25T23:00Z", home: "A", away: "B", hs: final ? 1 : null, as: final ? 0 : null, final, neutral: false, note: null });
  assert.deepEqual(lostFinals([g("1", true), g("2", true), g("3", false)], [g("1", true), g("3", true), g("4", false)]), ["2"]);
});

test("a scoreboard request tries again when ESPN sends an empty body, and gives up only after every wait", async () => {
  const replies = (bodies: string[]) => {
    let n = 0;
    return (async () => new Response(bodies[Math.min(n++, bodies.length - 1)])) as unknown as typeof fetch;
  };
  const events = [{ id: "1" }];
  assert.deepEqual(await fetchEvents("u", [0, 0, 0], replies(["", "", "", JSON.stringify({ events })])), events);
  await assert.rejects(fetchEvents("u", [0, 0], replies(["", "", "", JSON.stringify({ events })])), /ESPN u: Unexpected end of JSON input/);
});
