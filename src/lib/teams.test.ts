import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { compute, type Game, type SeasonData } from "./elo.ts";
import { conferenceOf, nextGames, regularSeasonEnd, runEnds, stage, standings, standingsRecord, weekAgo } from "./teams.ts";

const dir = new URL("../data/games/", import.meta.url);
const seasons: SeasonData[] = readdirSync(dir).map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));

test("the conference map agrees with the data's Cup groups and playoff rounds", () => {
  // Cup group games are played inside a conference, and every team plays four, so they pin all 30 teams;
  // play-in and playoff notes name the conference outright.
  const wrong: string[] = [];
  for (const { season, games } of seasons) {
    for (const g of games) {
      const named = g.note?.match(/^(?:NBA Play-In - )?(East|West)\b/)?.[1];
      const want = named ?? (stage(g.note).label === "NBA Cup" ? conferenceOf(g.home) : undefined);
      if (want === undefined) continue;
      for (const abbr of [g.home, g.away]) if (conferenceOf(abbr) !== want) wrong.push(`${season} ${g.id}: ${abbr} is not ${want}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test("every team in every season has a conference", () => {
  const unmapped = seasons.flatMap(({ season, teams }) => Object.keys(teams).filter((a) => conferenceOf(a) === null).map((a) => `${season} ${a}`));
  assert.deepEqual(unmapped, []);
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

test("Cup semifinals are regular-season games in the standings, the Cup final is outside them, and conference semifinals are playoffs", () => {
  assert.deepEqual(stage("NBA Cup - Semifinals"), { phase: "regular", label: "NBA Cup semifinal", standings: true });
  assert.deepEqual(stage("NBA Cup Championship"), { phase: "regular", label: "NBA Cup final", standings: false });
  assert.deepEqual(stage("East Semifinals - Game 3"), { phase: "playoffs", label: "East semis game 3", standings: false });
});

test("a team's next games are its next five from today on, however far ahead", () => {
  const game = (id: string, t: string): Game => ({ id, t, home: "A", away: "B", hs: null, as: null, final: false, neutral: false, note: null });
  const model = compute({
    season: "2026-27",
    teams: { A: { name: "A A", short: "A", color: "000000", alternateColor: "ffffff" }, B: { name: "B B", short: "B", color: "000000", alternateColor: "ffffff" } },
    // Yesterday's game and the sixth are left out.
    games: [
      game("yesterday", "2026-10-24T23:00Z"), game("second", "2026-10-27T23:00Z"), game("first", "2026-10-25T23:00Z"),
      game("third", "2026-10-30T23:00Z"), game("fourth", "2026-11-03T23:00Z"), game("fifth", "2026-11-09T23:00Z"), game("sixth", "2026-11-12T23:00Z"),
    ],
  });
  assert.deepEqual(nextGames(model, "A", "2026-10-25").map((g) => g.id), ["first", "second", "third", "fourth", "fifth"]);
});

test("a team's record in the standings leaves out its playoff games", () => {
  const teams = { A: { name: "A A", short: "A", color: "000000", alternateColor: "ffffff" }, B: { name: "B B", short: "B", color: "000000", alternateColor: "ffffff" } };
  const final = (id: string, t: string, note: string | null): Game => ({ id, t, home: "A", away: "B", hs: 110, as: 100, final: true, neutral: false, note });
  const model = compute({ season: "2025-26", teams, games: [final("r", "2026-04-10T23:00Z", null), final("p", "2026-04-20T23:00Z", "West 1st Round - Game 1")] });
  assert.deepEqual(standingsRecord(model, "A"), [1, 0]);
});

test("a week ago is the ratings seven days before the latest, and none until the season has played a week or once it is a week past", () => {
  const final = (id: string, t: string): Game => ({ id, t, home: "A", away: "B", hs: 110, as: 100, final: true, neutral: false, note: null });
  const teams = { A: { name: "A A", short: "A", color: "000000", alternateColor: "ffffff" }, B: { name: "B B", short: "B", color: "000000", alternateColor: "ffffff" } };
  const days = (n: number) => Array.from({ length: n }, (_, i) => final(`g${i}`, `2026-10-${String(20 + i).padStart(2, "0")}T23:00Z`));
  assert.equal(weekAgo(compute({ season: "2026-27", teams, games: days(7) }), "2026-10-27"), null);
  // The ninth game day is Oct 28.
  assert.equal(weekAgo(compute({ season: "2026-27", teams, games: days(9) }), "2026-11-04")?.day, "2026-10-21");
  assert.equal(weekAgo(compute({ season: "2026-27", teams, games: days(9) }), "2026-11-05"), null);
});

test("in every finished season the champion's run alone goes on to the end, and each other team's ends at its last game", () => {
  const wrong: string[] = [];
  for (const data of seasons.filter((d) => d.season !== "2026-27")) {
    const m = compute(data);
    const ends = runEnds(m);
    const going = m.abbrs.filter((a) => ends[a] === null);
    if (going.length !== 1) wrong.push(`${data.season}: ${going.length} runs still going (${going.join(", ")})`);
    for (const a of m.abbrs) {
      const last = m.results.filter((r) => r.game.home === a || r.game.away === a).at(-1)?.day ?? null;
      if (ends[a] !== null && ends[a] !== last) wrong.push(`${data.season} ${a}: ended ${ends[a]}, last game ${last}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test("a team left out of the playoffs is out only once all sixteen playoff teams are known", () => {
  const abbrs = Array.from({ length: 18 }, (_, i) => String.fromCharCode(65 + i));
  const regular = abbrs.map((a, i): Game => ({ id: `r${i}`, t: "2027-04-11T23:00Z", home: a, away: abbrs[(i + 1) % 18], hs: 110, as: 100, final: true, neutral: false, note: null }));
  const firstRound = (pairs: number) => Array.from({ length: pairs }, (_, i): Game => ({
    id: `p${i}`, t: "2027-04-18T23:00Z", home: abbrs[2 * i], away: abbrs[2 * i + 1], hs: null, as: null, final: false, neutral: false, note: "East 1st Round - Game 1",
  }));
  const teams = Object.fromEntries(abbrs.map((a) => [a, { name: a, short: a, color: "000000", alternateColor: "ffffff" }]));
  const out = (pairs: number) => Object.entries(runEnds(compute({ season: "x", teams, games: [...regular, ...firstRound(pairs)] }))).filter(([, d]) => d !== null).map(([a]) => a);
  assert.deepEqual(out(7), [], "fourteen known, so the last two may be any of the rest");
  assert.deepEqual(out(8), ["Q", "R"]);
});

test("the regular season's end is marked once the postseason has a game, and not before", () => {
  const byId = Object.fromEntries(seasons.map((d) => [d.season, compute(d)]));
  assert.equal(regularSeasonEnd(byId["2025-26"]), "2026-04-12");
  assert.equal(regularSeasonEnd(byId["2026-27"]), null);
});
