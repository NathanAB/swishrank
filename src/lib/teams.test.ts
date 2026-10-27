import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { compute, type Game, type SeasonData } from "./elo.ts";
import { conferenceOf, highLow, nextGames, regularSeasonEnd, runEnds, stage, standings } from "./teams.ts";

const dir = new URL("../data/games/", import.meta.url);
const seasons: SeasonData[] = readdirSync(dir).map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));

test("the conference map agrees with the data's Cup groups and playoff rounds", () => {
  // Cup group games are played inside a conference, and every team plays four, so they pin all 30 teams;
  // play-in and playoff notes name the conference outright.
  const wrong: string[] = [];
  for (const { season, games } of seasons) {
    for (const g of games) {
      const named = g.note?.match(/^(?:NBA Play-In - )?(East|West)\b/)?.[1];
      const want = named ?? (stage(g.note).label === "Cup" ? conferenceOf(g.home) : undefined);
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


test("the high and low say when one of them is just the 1000 every team starts at", () => {
  assert.deepEqual(highLow({ W: 70, L: 32, hi: 1307.2, lo: 994.4 }), { value: "1307 / 994" });
  assert.deepEqual(highLow({ W: 3, L: 0, hi: 1040.6, lo: 1000 }), { value: "1041 / 1000", unit: "never below 1000" });
  assert.deepEqual(highLow({ W: 0, L: 3, hi: 1000, lo: 962 }), { value: "1000 / 962", unit: "never above 1000" });
  assert.deepEqual(highLow({ W: 0, L: 0, hi: 1000, lo: 1000 }), { value: "—" });
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
