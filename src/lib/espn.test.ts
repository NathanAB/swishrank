import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dayKey, type SeasonData } from "./elo.ts";
import { canonicalNote, lostFinals, parse, type EspnEvent } from "./espn.ts";
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
