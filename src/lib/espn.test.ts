import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dayKey, type SeasonData } from "./elo.ts";
import { boxLines, canonicalNote, fetchEvents, fetchJson, lostFinals, parse, playerNames, type EspnEvent } from "./espn.ts";
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

test("a scoreboard request tries again when ESPN sends an empty body, and gives up only after every wait", async () => {
  const replies = (bodies: string[]) => {
    let n = 0;
    return (async () => new Response(bodies[Math.min(n++, bodies.length - 1)])) as unknown as typeof fetch;
  };
  const events = [{ id: "1" }];
  assert.deepEqual(await fetchEvents("u", [0, 0, 0], replies(["", "", "", JSON.stringify({ events })])), events);
  await assert.rejects(fetchEvents("u", [0, 0], replies(["", "", "", JSON.stringify({ events })])), /ESPN u: Unexpected end of JSON input/);
});

test("a request ESPN answers with 404 fails at once, since trying again cannot find the page", async () => {
  let tries = 0;
  const get = (async () => (tries++, new Response("", { status: tries === 1 ? 404 : 200 }))) as unknown as typeof fetch;
  await assert.rejects(fetchJson("u", [0, 0, 0], get), /ESPN u: HTTP 404/);
  assert.equal(tries, 1);
  let served = 0;
  const flaky = (async () => new Response(JSON.stringify({ ok: true }), { status: served++ ? 200 : 503 })) as unknown as typeof fetch;
  assert.deepEqual(await fetchJson("u", [0], flaky), { ok: true }, "a 503 is tried again");
});

test("a summary's box line keeps made and attempted shots apart and skips players who did not play", () => {
  const labels = ["MIN", "PTS", "FG", "3PT", "FT", "REB", "AST", "TO", "STL", "BLK", "OREB", "DREB", "PF", "+/-"];
  const lines = boxLines({
    boxscore: {
      players: [
        { team: { abbreviation: "BOS" }, statistics: [{ labels, athletes: [
          { athlete: { id: "4251" }, stats: ["31", "38", "12-21", "7-12", "7-8", "5", "3", "4", "5", "0", "0", "5", "2", "+3"] },
          { athlete: { id: "9" }, didNotPlay: true, stats: [] },
        ] }] },
        { team: { abbreviation: "DET" }, statistics: [{ labels: [], athletes: [{ athlete: { id: "7" }, stats: [] }] }] },
      ],
    },
  });
  assert.deepEqual(lines, { BOS: [[4251, 31, 38, 12, 21, 7, 8, 0, 5, 3, 5, 0, 4, 2]] });
});

test("a summary names every player in its box score by athlete id, and skips an entry without an id or a text name", () => {
  const names = playerNames({
    boxscore: {
      players: [
        { team: { abbreviation: "BOS" }, statistics: [{ athletes: [
          { athlete: { id: "4065648", displayName: "Jayson Tatum" }, stats: ["31"] },
          { athlete: { id: "9", displayName: "Bench Player" }, didNotPlay: true, stats: [] },
          { athlete: { displayName: "No Id" }, stats: ["4"] },
          { athlete: { id: "8", displayName: 42 as unknown as string }, stats: ["2"] },
        ] }] },
        { team: { abbreviation: "DET" }, statistics: [{ athletes: [{ athlete: { id: "7" }, stats: [] }] }] },
      ],
    },
  });
  assert.deepEqual(names, { "4065648": "Jayson Tatum", "9": "Bench Player" });
});
