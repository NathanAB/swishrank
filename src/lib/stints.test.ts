import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import type { EspnSummary } from "./espn.ts";
import type { Game, SeasonData } from "./elo.ts";
import { parseBox } from "./players.ts";
import { boxThrees, formatStints, fromSummary, minutesGap, needsSummary, parseStints, stints, threes, type SeasonStints } from "./stints.ts";

// Home athletes 11-16 and away 21-26, the first five of each starting unless `starters` says otherwise.
type Line = [id: number, min: string];
const HOME: Line[] = [[11, "48"], [12, "48"], [13, "48"], [14, "48"], [15, "6"], [16, "42"]];
const AWAY: Line[] = [[21, "48"], [22, "48"], [23, "48"], [24, "48"], [25, "48"], [26, "0"]];
// A play's shot, when it is one: the shooting team's id ("1" home, "2" away), the points attempted, whether it went
// in, and, for a feed without points attempted, its score value and text.
type Shot = [team: "1" | "2", pointsAttempted: number, made: boolean, scoreValue?: number, text?: string];
type P = [period: number, clock: string, type: string, athletes: number[], home: number, away: number, shot?: Shot];
const summary = (plays: P[], { home = HOME, away = AWAY, starters = true } = {}): EspnSummary => ({
  header: { competitions: [{ competitors: [{ homeAway: "home", score: "2", team: { id: "1" } }, { homeAway: "away", score: "3", team: { id: "2" } }] }] },
  boxscore: {
    players: [["1", "HOM", home], ["2", "AWY", away]].map(([id, abbreviation, lines]) => ({
      team: { id: id as string, abbreviation: abbreviation as string },
      statistics: [{
        labels: ["MIN", "PTS", "FG", "FT", "OREB", "DREB", "AST", "STL", "BLK", "TO", "PF"],
        athletes: (lines as Line[]).map(([a, min], i) => ({ athlete: { id: String(a) }, starter: starters && i < 5, stats: [min, "0", "0-0", "0-0", "0", "0", "0", "0", "0", "0", "0"] })),
      }],
    })),
  },
  plays: plays.map(([period, clock, type, athletes, homeScore, awayScore, shot]) => ({
    period: { number: period },
    clock: { displayValue: clock },
    type: { text: type },
    participants: athletes.map((id) => ({ athlete: { id: String(id) } })),
    homeScore,
    awayScore,
    ...(shot && { team: { id: shot[0] }, shootingPlay: true, pointsAttempted: shot[1], scoringPlay: shot[2], scoreValue: shot[3], text: shot[4] }),
  })),
});
// Periods 2 to 4 with no one named, and three away points at 1:30 of the 4th that decide it 2-3.
const REST: P[] = [[2, "0.0", "End Period", [], 2, 0], [3, "0.0", "End Period", [], 2, 0], [4, "1:30", "Jump Shot", [22], 2, 3], [4, "0.0", "End Game", [], 2, 3]];
const FIVE_HOME = [11, 12, 13, 14, 15], AWAY_FIVE = [21, 22, 23, 24, 25];

test("a game is rebuilt into stints that change with each substitution and run across period breaks", () => {
  const game = summary([
    [1, "12:00", "Jumpball", [11, 21], 0, 0],
    [1, "6:00", "Jump Shot", [11], 2, 0],
    [1, "6:00", "Substitution", [16, 15], 2, 0],
    [1, "0.0", "End Period", [], 2, 0],
    ...REST,
  ]);
  assert.deepEqual(stints(game), [
    [FIVE_HOME, AWAY_FIVE, 360, 2, 0, 0, 0, 0, 0],
    [[11, 12, 13, 14, 16], AWAY_FIVE, 2520, 0, 3, 0, 0, 0, 0],
  ]);
});

test("a player named in a play while off the floor takes the place of the teammate named least recently", () => {
  const game = summary([
    [1, "12:00", "Jumpball", [11, 21], 0, 0],
    [1, "10:00", "Jump Shot", [12], 0, 0],
    [1, "9:00", "Defensive Rebound", [13], 0, 0],
    [1, "8:00", "Jump Shot", [14], 0, 0],
    [1, "7:00", "Jump Shot", [15], 0, 0],
    [1, "6:00", "Jump Shot", [11], 0, 0],
    [1, "5:00", "Jump Shot", [16], 0, 0],
    [1, "0.0", "End Period", [], 0, 0],
    [2, "0.0", "End Period", [], 2, 0],
    ...REST.slice(1),
  ]);
  // 11 is named again at 6:00, so 12, named at 10:00, has gone longest without a mention when 16 shoots.
  assert.deepEqual(stints(game), [
    [FIVE_HOME, AWAY_FIVE, 420, 0, 0, 0, 0, 0, 0],
    [[11, 13, 14, 15, 16], AWAY_FIVE, 2460, 2, 3, 0, 0, 0, 0],
  ]);
});

test("a play at the same clock as a player's substitution does not swap him in a second time", () => {
  const game = summary([
    [1, "12:00", "Jumpball", [11, 21], 0, 0],
    [1, "5:00", "Jump Shot", [16], 0, 0],
    [1, "5:00", "Substitution", [16, 15], 0, 0],
    [1, "0.0", "End Period", [], 0, 0],
    [2, "0.0", "End Period", [], 2, 0],
    ...REST.slice(1),
  ]);
  assert.deepEqual(stints(game), [
    [FIVE_HOME, AWAY_FIVE, 420, 0, 0, 0, 0, 0, 0],
    [[11, 12, 13, 14, 16], AWAY_FIVE, 2460, 2, 3, 0, 0, 0, 0],
  ]);
});

test("a technical can name a player on the bench without putting him on the floor", () => {
  const game = summary([[1, "12:00", "Jumpball", [11, 21], 0, 0], [1, "5:00", "Technical Foul", [16], 0, 0], [1, "0.0", "End Period", [], 0, 0], [2, "0.0", "End Period", [], 2, 0], ...REST.slice(1)]);
  assert.deepEqual(stints(game), [[FIVE_HOME, AWAY_FIVE, 2880, 2, 3, 0, 0, 0, 0]]);
});

test("a period start short of five takes the five who ended the last period, then the box score's most-minutes players", () => {
  // Without starters in the box score, the 1st opens with 11 and 16, named, then 12, 13 and 14 by minutes, 15 having
  // fewer. 15 comes on for 16 at 6:00. The 2nd names only 12 and 13, so 11, 14 and 15 come from the five that ended
  // the 1st: by minutes alone 16, with 25 to 15's 20, would be back.
  const home: Line[] = [[11, "40"], [12, "38"], [13, "36"], [14, "30"], [15, "20"], [16, "25"]];
  const game = summary([
    [1, "12:00", "Jumpball", [11, 21], 0, 0],
    [1, "6:00", "Substitution", [15, 16], 0, 0],
    [1, "0.0", "End Period", [], 0, 0],
    [2, "11:00", "Jump Shot", [12], 0, 0],
    [2, "10:00", "Jump Shot", [13], 0, 0],
    [2, "0.0", "End Period", [], 2, 0],
    ...REST.slice(1),
  ], { home, starters: false });
  const away = [21, 22, 23, 24, 25];
  assert.deepEqual(stints(game), [
    [[11, 12, 13, 14, 16], away, 360, 0, 0, 0, 0, 0, 0],
    [[11, 12, 13, 14, 15], away, 2520, 2, 3, 0, 0, 0, 0],
  ]);
});

test("a period start that names more than five keeps the five with the most minutes", () => {
  const home: Line[] = [[11, "40"], [12, "38"], [13, "36"], [14, "30"], [15, "20"], [16, "25"]];
  const game = summary([[1, "12:00", "Jumpball", [11, 21], 0, 0], [1, "11:00", "Jump Shot", [12, 13, 14, 16, 15], 0, 0], [1, "0.0", "End Period", [], 0, 0], [2, "0.0", "End Period", [], 2, 0], ...REST.slice(1)], { home, starters: false });
  assert.deepEqual(stints(game)[0].slice(0, 3), [[11, 12, 13, 14, 16], AWAY_FIVE, 60]);
});

test("a game without play-by-play, or with a malformed or cut-short one, throws with the reason", () => {
  const good: P[] = [[1, "12:00", "Jumpball", [11, 21], 0, 0], [1, "0.0", "End Period", [], 0, 0], [2, "0.0", "End Period", [], 2, 0], ...REST.slice(1)];
  assert.throws(() => stints(summary([])), /^Error: no play-by-play$/);
  assert.throws(() => stints({ ...summary(good), plays: undefined }), /^Error: no play-by-play$/);
  assert.throws(() => stints(summary(good.map((p, i) => (i === 1 ? [p[0], "soon", p[2], p[3], p[4], p[5]] : p)))), /readable clock/);
  assert.throws(() => stints(summary(good.map((p, i) => (i === 1 ? [0, p[1], p[2], p[3], p[4], p[5]] : p)))), /period number/);
  assert.throws(() => stints(summary(good.filter((p) => p[0] !== 3))), /periods are not 1 to n/);
  assert.throws(() => stints(summary(good.filter((p) => p[0] !== 4))), /periods are not 1 to n/);
  assert.throws(() => stints(summary(good.slice(0, -1))), /stops before the end/);
  assert.throws(() => stints(summary([...good.slice(0, -1), [4, "0.0", "End Game", [], 3, 3]])), /last score is tied/);
  assert.throws(() => stints(summary(good, { away: AWAY.slice(0, 4) })), /fewer than five players/);
  assert.throws(() => stints({ ...summary(good), header: {} }), /no home or away team id/);
  // An id the record's file could not hold: parseStints would reject the file on the next run.
  const named = (id: string) => ({ ...summary(good), plays: summary(good).plays?.map((p, i) => (i === 0 ? { ...p, participants: [{ athlete: { id } }] } : p)) });
  assert.throws(() => stints(named("0")), /athlete without an id/);
  assert.throws(() => stints(named("99999999999999999")), /athlete without an id/);
});

test("a feed within ten points of the final score keeps its own points, and one further off is malformed", () => {
  // The summary's final score is 2-3. The feed ends 2-13, ten off for the away side, then 2-14, eleven off.
  const ending = (away: number): P[] => [[1, "0.0", "End Period", [], 0, 0], [2, "0.0", "End Period", [], 2, 0], [3, "0.0", "End Period", [], 2, 0], [4, "0.0", "End Game", [], 2, away]];
  assert.deepEqual(stints(summary(ending(13))), [[FIVE_HOME, AWAY_FIVE, 2880, 2, 13, 0, 0, 0, 0]]);
  assert.throws(() => stints(summary(ending(14))), /^Error: the feed's last score, 2-14, is far from the final score, 2-3$/);
  const scoreless = summary(ending(3));
  scoreless.header = { competitions: [{ competitors: [{ homeAway: "home", team: { id: "1" } }, { homeAway: "away", score: "3", team: { id: "2" } }] }] };
  assert.throws(() => stints(scoreless), /^Error: no final score$/);
});

test("each side's threes, attempted and made, are counted in the stint they were shot in, and against the box score", () => {
  // Home makes a three and a two; away misses a three and makes a free throw. At 6:00, between 16 coming on and going
  // off again, away misses a three: a stint of no seconds that still holds the attempt. Away makes a three in the 4th.
  const game = summary([
    [1, "12:00", "Jumpball", [11, 21], 0, 0],
    [1, "10:00", "Running Jump Shot", [11], 3, 0, ["1", 3, true]],
    [1, "9:00", "Jump Shot", [21], 3, 0, ["2", 3, false]],
    [1, "8:00", "Jump Shot", [12], 5, 0, ["1", 2, true]],
    [1, "7:00", "Free Throw - 1 of 1", [21], 5, 1, ["2", 1, true]],
    [1, "6:00", "Substitution", [16, 15], 5, 1],
    [1, "6:00", "Jump Shot", [22], 5, 1, ["2", 3, false]],
    [1, "6:00", "Substitution", [15, 16], 5, 1],
    [1, "0.0", "End Period", [], 5, 1],
    [2, "0.0", "End Period", [], 5, 1],
    [3, "0.0", "End Period", [], 5, 1],
    [4, "1:30", "Jump Shot", [22], 5, 4, ["2", 3, true]],
    [4, "0.0", "End Game", [], 5, 4],
  ]);
  const record = stints(game);
  assert.deepEqual(record, [
    [FIVE_HOME, AWAY_FIVE, 360, 5, 1, 1, 1, 1, 0],
    [[11, 12, 13, 14, 16], AWAY_FIVE, 0, 0, 0, 0, 0, 1, 0],
    [FIVE_HOME, AWAY_FIVE, 2520, 0, 3, 0, 0, 1, 1],
  ]);
  assert.deepEqual(threes(record), [1, 1, 3, 1]);

  // The box score's 3PT lines, made-attempted: home 11 1-1; away 21 0-1 and 22 1-2.
  const withThrees = (lines: Record<number, string>): typeof game => ({
    ...game,
    boxscore: { players: (game.boxscore?.players ?? []).map((team) => ({ ...team, statistics: (team.statistics ?? []).map((g) => ({
      labels: [...(g.labels ?? []), "3PT"],
      athletes: (g.athletes ?? []).map((a) => ({ ...a, stats: [...(a.stats ?? []), lines[Number(a.athlete?.id)] ?? "0-0"] })),
    })) })) },
  });
  assert.deepEqual(boxThrees(withThrees({ 11: "1-1", 21: "0-1", 22: "1-2" })), [1, 1, 3, 1]);
  assert.equal(boxThrees(withThrees({ 21: "0-1", 22: "1-2" })), null);
  assert.equal(boxThrees(game), null);
});

test("a feed without points attempted reads a three from its score value or its text, and a missed heave is no attempt", () => {
  // Away: a make worth 3 and a made heave count, a make worth 2 does not. Home: misses the text calls a three point
  // shot, with no distance, or puts at 23 feet count; a miss from 22 feet, a made free throw and a missed heave do not.
  const game = summary([
    [1, "11:00", "Jump Shot", [21], 0, 3, ["2", 0, true, 3, "Twenty-One makes 25-foot jumper"]],
    [1, "10:00", "Jump Shot", [21], 0, 5, ["2", 0, true, 2, "Twenty-One makes 18-foot jumper"]],
    [1, "9:00", "Jump Shot", [11], 0, 5, ["1", 0, false, 0, "Eleven misses three point jumper"]],
    [1, "8:00", "Running Jump Shot", [11], 0, 5, ["1", 0, false, 0, "Eleven misses 23-foot running jump shot"]],
    [1, "7:00", "Jump Shot", [11], 0, 5, ["1", 0, false, 0, "Eleven misses 22-foot jumper"]],
    [1, "6:00", "Free Throw - 1 of 2", [11], 1, 5, ["1", 1, true, 1, "Eleven makes free throw 1 of 2"]],
    [1, "0.5", "Heave Jump Shot", [12], 1, 5, ["1", 3, false, 0, "Twelve misses heave jump shot"]],
    [1, "0.0", "End Period", [], 1, 5],
    [2, "0.2", "Heave Jump Shot", [22], 1, 8, ["2", 3, true, 3, "Twenty-Two makes heave jump shot"]],
    [2, "0.0", "End Period", [], 1, 8],
    [3, "0.0", "End Period", [], 1, 8],
    [4, "0.0", "End Game", [], 1, 8],
  ]);
  assert.deepEqual(stints(game), [[FIVE_HOME, AWAY_FIVE, 2880, 1, 8, 2, 0, 2, 2]]);
});

test("a player's rebuilt minutes are checked against his box-score MIN, and a box score without minutes gives no gap", () => {
  const plays: P[] = [[1, "12:00", "Jumpball", [11, 21], 0, 0], [1, "6:00", "Substitution", [16, 15], 2, 0], [1, "0.0", "End Period", [], 2, 0], ...REST];
  // 15 played 6 minutes and 16 42; the box score gives 16 40 and 26, who never played, 0.
  const game = summary(plays, { home: [...HOME.slice(0, 5), [16, "40"]] });
  assert.equal(minutesGap(stints(game), game), 2);
  assert.equal(minutesGap(stints(summary(plays)), summary(plays)), 0);
  const blank = summary(plays, { home: HOME.map(([a]): Line => [a, "--"]), away: AWAY.map(([a]): Line => [a, "--"]) });
  assert.equal(minutesGap(stints(blank), blank), null);
});

test("a summary with malformed play-by-play still gives its box score and names", () => {
  const saved = fromSummary(summary([[1, "12:00", "Jumpball", [11, 21], 0, 0]]));
  assert.deepEqual(saved.stints, { ok: false, reason: "periods are not 1 to n with n at least 4" });
  assert.equal(saved.box.ok && saved.box.value.HOM?.length, 6);
  assert.deepEqual(fromSummary({ boxscore: { players: [] } }).box, { ok: true, value: {} });
});

const final = (id: string, hs: number, as: number): Game => ({ id, t: "2026-11-01T00:00Z", home: "HOM", away: "AWY", hs, as, final: true, neutral: false, note: null });

test("the refresh asks again for a final game without a box score, without a record, or whose record misses the final score", () => {
  const box = { season: "2026-27", games: { "1": {}, "2": {}, "3": {} } };
  const record: SeasonStints = { season: "2026-27", games: {
    "1": [[FIVE_HOME, AWAY_FIVE, 2000, 100, 80, 30, 10, 28, 9], [FIVE_HOME, AWAY_FIVE, 880, 27, 25, 9, 3, 8, 4]],
    "2": [[FIVE_HOME, AWAY_FIVE, 2880, 127, 105, 40, 15, 35, 11]],
    "4": [[FIVE_HOME, AWAY_FIVE, 2880, 99, 98, 31, 9, 33, 12]],
  } };
  const games = [final("1", 127, 105), final("2", 130, 105), final("3", 99, 98), final("4", 99, 98)];
  assert.deepEqual(needsSummary(games, box, record).map((g) => g.id), ["2", "3", "4"]);
});

test("the record's file holds one game a line in the games file's order, and reads back", () => {
  const record: SeasonStints = { season: "2026-27", games: { "9": [[[3, 1], [2], 95.4, 2, 5, 1, 0, 2, 1]], "10": [[FIVE_HOME, AWAY_FIVE, 412, 14, 9, 4, 2, 3, 1]] } };
  const text = formatStints(record, ["10", "9"]);
  assert.equal(text, '{"season":"2026-27","games":{\n"10":[[[11,12,13,14,15],[21,22,23,24,25],412,14,9,4,2,3,1]],\n"9":[[[3,1],[2],95.4,2,5,1,0,2,1]]\n}}\n');
  assert.deepEqual(parseStints(JSON.parse(text), "2026-27"), record);
});

test("a record file with anything but numbers in a stint, or a stint of the wrong length, is rejected", () => {
  const file = (stint: unknown) => ({ season: "2026-27", games: { "1": [stint] } });
  assert.doesNotThrow(() => parseStints(file([[1], [2], 1.5, 0, 2, 1, 0, 2, 1]), "2026-27"));
  assert.throws(() => parseStints(file([["1"], [2], 1.5, 0, 2, 1, 0, 2, 1]), "2026-27"), /game 1 has a malformed stint/);
  assert.throws(() => parseStints(file([[1], [2], Infinity, 0, 2, 1, 0, 2, 1]), "2026-27"), /malformed stint/);
  assert.throws(() => parseStints(file([[1], [2], 1.5, 0, 2]), "2026-27"), /malformed stint/);
  assert.throws(() => parseStints(file([[1], [2], 1.5, "Jump Shot", 2, 1, 0, 2, 1]), "2026-27"), /malformed stint/);
  assert.throws(() => parseStints({ season: "2025-26", games: {} }, "2026-27"), /expected \{ season: "2026-27", games \}/);
});

// Per finished season: the least share of games, in percent, whose rebuilt minutes are all within two of the box score
// (the prototype's share on the same games less a point; ESPN's feed misses substitutions in 2017-18 to 2019-20), and
// the least share whose points add up to the final score (as measured less a point; ESPN's feed is a few points off
// the final in about 1% of games). The season in progress has no floors: its shares move with each morning's games,
// 4% of its first 174 were off the final score, and a floor there would fail the deploy over ESPN's feed.
const FLOORS: Record<string, { minutes: number; points: number }> = {
  "2015-16": { minutes: 98.4, points: 98.4 },
  "2016-17": { minutes: 98.2, points: 98.7 },
  "2017-18": { minutes: 83.7, points: 98.8 },
  "2018-19": { minutes: 79.9, points: 99 },
  "2019-20": { minutes: 83.2, points: 98.9 },
  "2020-21": { minutes: 98.6, points: 98.9 },
  "2021-22": { minutes: 98.8, points: 98.8 },
  "2022-23": { minutes: 98, points: 98.8 },
  "2023-24": { minutes: 98.4, points: 98.7 },
  "2024-25": { minutes: 98.5, points: 98.6 },
  "2025-26": { minutes: 98.6, points: 98.2 },
};
const finished = new Set((JSON.parse(readFileSync(new URL("../data/seasons.json", import.meta.url), "utf8")) as { id: string; end?: string }[]).filter((s) => s.end).map((s) => s.id));
const stintsDir = new URL("../../scripts/stints/", import.meta.url);
const dataFile = (dir: string, f: string): unknown => JSON.parse(readFileSync(new URL(`../data/${dir}/${f}`, import.meta.url), "utf8"));

test("every committed record runs a game's length, adds up to its final score but in a few games, agrees with its box score, and counts the league's threes", () => {
  for (const f of readdirSync(stintsDir).filter((f) => f.endsWith(".json"))) {
    const season = f.replace(".json", "");
    const record = parseStints(JSON.parse(readFileSync(new URL(f, stintsDir), "utf8")), season);
    const finals = new Map((dataFile("games", f) as SeasonData).games.filter((g) => g.final).map((g) => [g.id, g]));
    const box = parseBox(dataFile("box", f), season);
    const ids = Object.keys(record.games);
    let matched = 0, boxed = 0, within = 0, threesAttempted = 0, threesMade = 0;
    for (const id of ids) {
      const game = record.games[id], g = finals.get(id);
      assert.ok(g, `${season} ${id} is not a final game`);
      const seconds = game.reduce((t, s) => t + s[2], 0), overtimes = Math.round((seconds - 2880) / 300);
      assert.ok(overtimes >= 0 && Math.abs(seconds - 2880 - 300 * overtimes) < 0.05, `${season} ${id} runs ${seconds} s`);
      assert.ok(game.every((s) => s[6] <= s[5] && s[8] <= s[7]), `${season} ${id} has a stint with more threes made than attempted`);
      threesAttempted += game.reduce((t, s) => t + s[5] + s[7], 0);
      threesMade += game.reduce((t, s) => t + s[6] + s[8], 0);
      const home = game.reduce((t, s) => t + s[3], 0), away = game.reduce((t, s) => t + s[4], 0);
      if (home === g.hs && away === g.as) matched++;
      assert.ok(Math.abs(home - (g.hs ?? 0)) <= 10 && Math.abs(away - (g.as ?? 0)) <= 10, `${season} ${id} adds up to ${home}-${away}`);
      const lines = Object.values(box.games[id] ?? {}).flatMap((l) => l ?? []);
      if (!lines.length) continue;
      const played = new Map<number, number>();
      for (const [h, a, s] of game) for (const p of [...h, ...a]) played.set(p, (played.get(p) ?? 0) + s);
      boxed++;
      if (lines.every((l) => Math.abs((played.get(l[0]) ?? 0) / 60 - l[1]) <= 2)) within++;
    }
    if (!finished.has(season)) continue;
    const floor = FLOORS[season];
    assert.ok(floor, `${season} has no floors`);
    assert.ok((matched / ids.length) * 100 >= floor.points, `${season}: ${matched} of ${ids.length} add up to the final score`);
    assert.ok((within / boxed) * 100 >= floor.minutes, `${season}: ${within} of ${boxed} within two minutes`);
    // The league's seasons since 2015-16: 48 to 75 threes attempted a game by the two teams, 35.4% to 36.7% of them made.
    const perGame = threesAttempted / ids.length, made = (threesMade / threesAttempted) * 100;
    assert.ok(perGame >= 45 && perGame <= 80, `${season}: ${perGame.toFixed(1)} threes attempted a game`);
    assert.ok(made >= 34.5 && made <= 37.5, `${season}: ${made.toFixed(1)}% of threes made`);
  }
});
