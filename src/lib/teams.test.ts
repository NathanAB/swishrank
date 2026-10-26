import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { compute, type Game, type SeasonData } from "./elo.ts";
import { conferenceOf, nextGames, stage, standings } from "./teams.ts";

const dir = new URL("../data/games/", import.meta.url);
const seasons: SeasonData[] = readdirSync(dir).map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));

test("the conference map agrees with the data's Cup groups and playoff rounds", () => {
  // Cup group games are played inside a conference, and every team plays four, so they pin all 30 teams;
  // play-in and playoff notes name the conference outright.
  const wrong: string[] = [];
  for (const { season, games } of seasons) {
    for (const g of games) {
      const named = g.note?.match(/^(?:NBA Play-In - )?(East|West)\b/)?.[1];
      const want = named ?? (g.note === "NBA Cup - Group Play" ? conferenceOf(g.home) : undefined);
      if (want === undefined) continue;
      for (const abbr of [g.home, g.away]) if (conferenceOf(abbr) !== want) wrong.push(`${season} ${g.id}: ${abbr} is not ${want}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test("a conference's table holds only its teams, ranked from 1 among themselves", () => {
  const team = { color: "000000", alternateColor: "ffffff" };
  const final = (id: string, home: string, away: string): Game => ({ id, t: "2026-10-25T23:00Z", home, away, hs: 110, as: 100, final: true, neutral: false, note: null });
  // OKC (West) wins both its games, BOS (East) splits, NY (East) loses both: the league goes OKC, BOS, NY.
  const model = compute({
    season: "2026-27",
    teams: { OKC: { name: "OKC", short: "OKC", ...team }, BOS: { name: "BOS", short: "BOS", ...team }, NY: { name: "NY", short: "NY", ...team } },
    games: [final("1", "OKC", "BOS"), final("2", "OKC", "NY"), final("3", "BOS", "NY")],
  });
  assert.deepEqual(standings(model, "East"), { order: ["BOS", "NY"], rank: { BOS: 1, NY: 2 } });
});

test("Cup semifinals are regular-season games and conference semifinals are playoffs", () => {
  assert.deepEqual(stage("NBA Cup - Semifinals"), { phase: "regular", label: "Cup semifinal" });
  assert.deepEqual(stage("East Semifinals - Game 3"), { phase: "playoffs", label: "East semis game 3" });
});

test("a team's next games are the games page's week: today and the six days after it, in US Eastern days", () => {
  const game = (id: string, t: string): Game => ({ id, t, home: "A", away: "B", hs: null, as: null, final: false, neutral: false, note: null });
  const model = compute({
    season: "2026-27",
    teams: { A: { name: "A A", short: "A", color: "000000", alternateColor: "ffffff" }, B: { name: "B B", short: "B", color: "000000", alternateColor: "ffffff" } },
    // 11:30 PM Eastern on the 31st is already November 1 in UTC; the next evening is the eighth day.
    games: [game("yesterday", "2026-10-24T23:00Z"), game("last", "2026-11-01T03:30Z"), game("first", "2026-10-25T23:00Z"), game("eighth", "2026-11-01T23:00Z")],
  });
  assert.deepEqual(nextGames(model, "A", "2026-10-25").map((g) => g.id), ["first", "last"]);
});
