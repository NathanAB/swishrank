import { test } from "node:test";
import assert from "node:assert/strict";
import type { Abbr, Game, SeasonData } from "./elo.ts";
import type { NbaArchive, SideReport } from "./nba-report.ts";
import type { BoxLine, Lineup, SeasonBox } from "./players.ts";
import { rosterAvailability, rosterRates, type Prospect, type RosterRule } from "./roster-lineups.ts";
import type { Availability } from "./v4.ts";

const team = (name: string) => ({ name, short: name, color: "000000", alternateColor: "ffffff" });
const line = (athlete: number, minutes: number): BoxLine => [athlete, minutes, 10, 4, 8, 2, 2, 1, 3, 2, 1, 0, 1, 2];
const minutesOf = (l: Lineup) => Object.fromEntries(l.map((p) => [p.athlete, Math.round(p.share * 48 * 1000) / 1000]));
const near = (actual: number, want: number, what: string) => assert.ok(Math.abs(actual - want) < 1e-9, `${what}: ${actual}, wanted ${want}`);
const covered = () => ({ home: {}, away: {} });
const at = (minutes: number, ...athletes: number[]): [number, number][] => athletes.map((a) => [a, minutes]);

/** One game: played when it has `lines`, to come otherwise; `report` absent for a game the archive does not hold. */
type Play = { home?: Abbr; away?: Abbr; day?: number; lines?: Partial<Record<Abbr, [number, number][]>>; report?: { home: SideReport | null; away: SideReport | null } };
type Built = { data: SeasonData; box: SeasonBox; archive: NbaArchive };
/** A season of `plays`, game i on November i + 1 unless it names its day, ids g1, g2, ... */
const built = (season: string, plays: Play[]): Built => {
  const year = season.slice(0, 4);
  const games: Game[] = plays.map((p, i) => ({
    id: `g${i + 1}`, t: `${year}-11-${String(p.day ?? i + 1).padStart(2, "0")}T23:00Z`, home: p.home ?? "A", away: p.away ?? "B",
    hs: p.lines ? 100 : null, as: p.lines ? 90 : null, final: p.lines !== undefined, neutral: false, note: null,
  }));
  const abbrs = [...new Set(games.flatMap((g) => [g.home, g.away]))];
  return {
    data: { season, teams: Object.fromEntries(abbrs.map((a) => [a, team(a)])), games },
    box: { season, games: Object.fromEntries(plays.flatMap((p, i) => (p.lines ? [[`g${i + 1}`, Object.fromEntries(Object.entries(p.lines).map(([abbr, ls]) => [abbr, (ls ?? []).map(([a, m]) => line(a, m))]))]] : []))) },
    archive: { season, games: Object.fromEntries(plays.flatMap((p, i) => (p.report ? [[`g${i + 1}`, { published: "x", ...p.report }]] : []))) },
  };
};
/** Version 4's entries, which a season without source seasons must hand back as they are. */
const v4Of = (seasons: readonly Built[]) => new Map<string, Availability>(seasons.map((s) => [s.data.season, { lineups: new Map(), extra: new Map(), missing: new Map() }]));
const priced = (seasons: readonly Built[], rule: RosterRule = { fill: -0.3 }, v4 = v4Of(seasons)) =>
  rosterAvailability(seasons.map(({ data, box }) => ({ data, box })), new Map(seasons.map((s) => [s.data.season, s.archive])), rule, v4);
const rates = (seasons: readonly Built[], from: readonly string[]) => rosterRates(seasons.map(({ data, box }) => ({ data, box })), new Map(seasons.map((s) => [s.data.season, s.archive])), from);
const prospect = (p: Omit<Prospect, "athlete">): Prospect => ({ athlete: 0, ...p });

const B = at(48, 11, 12, 13, 14, 15);
// The source season. A's 1 to 4 play 50 a game and 5 and 6 play 20; 6 sits game 3 unlisted, and in game 4, with 1 and
// 2 listed Out, 3 to 6 play 60 each. B's five play 48 every game. Its observations, from games 2 to 4:
//   plays (status, missed): unlisted 0 holds 30, all 1 but 6 in game 3, so 29/30; unlisted 1 holds 6 in game 4,
//     who played, so 1; Out 0 holds 1 and 2 in game 4, so 0. No cell reaches 40, so status x missed prices.
//   minutes (usual, absent), played over usual: 26+ under 8% holds 23 at 1. 18-26 under 8%: 5 and 6 at 20/20 in
//     game 2, and 5 at 40/20 in game 3, so 4/3. In game 4, 1 and 2 Out and 6, unlisted, missing game 3 take 100 + 20
//     of the regulars' 246.667 usual minutes (5's last three, 20, 20, 40, average 26.667), 35%+: 3 and 4 at 60/50 and
//     5 at 60/26.667 = 2.25 make 26+ (1.2 + 1.2 + 2.25) / 3 = 1.55, and 6 at 60/20 makes 18-26 at 3.
const source = built("2025-26", [
  { lines: { A: [...at(50, 1, 2, 3, 4), ...at(20, 5, 6)], B }, report: covered() },
  { lines: { A: [...at(50, 1, 2, 3, 4), ...at(20, 5, 6)], B }, report: covered() },
  { lines: { A: [...at(50, 1, 2, 3, 4), [5, 40]], B }, report: covered() },
  { lines: { A: at(60, 3, 4, 5, 6), B }, report: { home: { 1: "Out", 2: "Out" }, away: {} } },
]);
const SB = at(48, 111, 112, 113, 114, 115);
// The season priced, with new players. Game 2's report lists 101 Out and 106 sits too; game 3 has them both back, and
// its report is `third`, or none when null.
const target = (third: Play["report"] | null = covered(), later: Play[] = []) => built("2026-27", [
  { lines: { A: at(40, 101, 102, 103, 104, 105, 106), B: SB }, report: covered() },
  { lines: { A: at(60, 102, 103, 104, 105), B: SB }, report: { home: { 101: "Out" }, away: {} } },
  { lines: { A: at(40, 101, 102, 103, 104, 105, 106), B: SB }, report: third ?? undefined },
  ...later,
]);

test("a lookup takes the full cell at 40 observations or more, else status x missed, then status, then 0.5", () => {
  // A's 1 to 5 play every game, at 26+ usual minutes; 6, at 8, plays the odd games only, and games 3 to 5 list him
  // Questionable. Each game from the second gives unlisted, missed 0, 26+ ten observations, all 1.
  const chain = (games: number) => built("2025-26", Array.from({ length: games }, (_, i): Play => ({
    lines: { A: i % 2 === 0 ? [...at(48, 1, 2, 3, 4), [5, 40], [6, 8]] : at(48, 1, 2, 3, 4, 5), B },
    report: i >= 2 && i <= 4 ? { home: { 6: "Questionable" }, away: {} } : covered(),
  })));
  const regular = prospect({ usual: 30, missed: 0, status: "unlisted", absent: 0 });
  assert.equal(rates([chain(5)], ["2025-26"]).rate("plays", regular), 1, "games 2 to 5: 40 observations, the cell's own rate");
  // Games 2 to 4: 30 in the cell, so unlisted, missed 0, which adds 6 in game 2, unlisted, sitting: 30/31.
  near(rates([chain(4)], ["2025-26"]).rate("plays", regular), 30 / 31, "39 or fewer fall back");
  const five = rates([chain(5)], ["2025-26"]);
  // Questionable: 6 missed 1 and played in games 3 and 5, missed 0 and sat in game 4.
  assert.equal(five.rate("plays", prospect({ usual: 30, missed: 1, status: "Questionable", absent: 0 })), 1, "Questionable, missed 1: 2 of 2");
  near(five.rate("plays", prospect({ usual: 30, missed: 2, status: "Questionable", absent: 0 })), 2 / 3, "no Questionable, missed 2: Questionable's 2 of 3");
  assert.equal(five.rate("plays", prospect({ usual: 30, missed: 0, status: "Doubtful", absent: 0 })), 0.5, "never seen");
  assert.deepEqual(five.cells.find((c) => c.table === "plays" && c.at.status === "Questionable" && c.at.missed === "1" && c.at.usual === undefined), { table: "plays", at: { status: "Questionable", missed: "1" }, sum: 2, n: 2 });
});

test("the minutes multiplier moves minutes to the bench when a large share of the rotation is absent", () => {
  const learned = rates([source], ["2025-26"]);
  const minutes = (usual: number, absent: number) => learned.rate("minutes", prospect({ usual, missed: 0, status: "unlisted", absent }));
  near(minutes(20, 0), 4 / 3, "a 20-minute player, no one absent");
  assert.equal(minutes(20, 0.5), 3, "a 20-minute player, 35% or more absent");
  near(minutes(30, 0.5), 1.55, "a 30-minute player, 35% or more absent");
  assert.equal(minutes(5, 0.1), 1, "a cell never observed");
});

test("a side is priced at plays x minutes x usual, and its missing minutes set the extra term", () => {
  const game2 = priced([source, target()]).get("2026-27")!;
  // A: 101 is Out, at Out, missed 0's 0, so he is left out. 102 to 106 at 40 usual, unlisted, missed 0, all at 29/30,
  // and 40 of 240 usual minutes absent (8-20%, never observed, so 1): equal, 48 each.
  assert.deepEqual(minutesOf(game2.lineups.get("g2")!.home), { 102: 48, 103: 48, 104: 48, 105: 48, 106: 48 });
  assert.deepEqual(minutesOf(game2.lineups.get("g2")!.away), { 111: 48, 112: 48, 113: 48, 114: 48, 115: 48 });
  // A: 5 x (40 x 1 + 5 x 40 x 1/30) / 240 = 35/36. B: 5 x (5 x 48 x 1/30) / 240 = 1/6.
  near(game2.missing.get("g2")!.home, 35 / 36, "A's missing minutes");
  near(game2.missing.get("g2")!.away, 1 / 6, "B's missing minutes");
  near(game2.extra.get("g2")!, -0.3 * (35 / 36 - 1 / 6), "fill x (home - away)");
  assert.ok(!game2.extra.has("g1"), "a team's first game: both lineups empty, nothing missing, no extra term");
  assert.deepEqual(game2.lineups.get("g1"), { home: [], away: [] });
});

test("a regular who sat the last game unlisted counts at the learned unlisted, missed 1 rate, not at 0", () => {
  const season = priced([source, target()]).get("2026-27")!;
  // Game 3, A: 102 to 105 at 50 usual (40, 60) and 29/30; 101 and 106 at 40 usual, missed 1, unlisted: 1.
  // Absent: 101 and 106, 80 of 280, 20-35%, never observed, so 1. 4 x 48.333 + 2 x 40 = 273.333 scale to 240.
  assert.deepEqual(minutesOf(season.lineups.get("g3")!.home), { 101: 35.122, 102: 42.439, 103: 42.439, 104: 42.439, 105: 42.439, 106: 35.122 });
  near(season.missing.get("g3")!.home, (5 * (4 * 50 * (1 / 30))) / 280, "only 102 to 105 may not play");
});

test("a side the report does not cover is priced at the uncovered rates, and so is a game with no report", () => {
  const nullSide = priced([source, target({ home: {}, away: null })]).get("2026-27")!;
  // B, uncovered: never observed, so 0.5 each, equal, 48 each; 5 x (240 x 0.5) / 240 = 2.5 missing.
  assert.deepEqual(minutesOf(nullSide.lineups.get("g3")!.away), { 111: 48, 112: 48, 113: 48, 114: 48, 115: 48 });
  assert.equal(nullSide.missing.get("g3")!.away, 2.5);
  const none = priced([source, target(null)]).get("2026-27")!;
  // A, uncovered: all at 0.5, so 102 to 105 at 25 and 101 and 106 at 20, 140 scaled to 240.
  assert.deepEqual(minutesOf(none.lineups.get("g3")!.home), { 101: 34.286, 102: 42.857, 103: 42.857, 104: 42.857, 105: 42.857, 106: 34.286 });
  near(none.lineups.get("g3")!.home.reduce((s, p) => s + p.share, 0), 5, "A's shares");
  assert.equal(none.missing.get("g3")!.home, 2.5);
  assert.ok(!none.extra.has("g3"), "both sides miss 2.5");
});

test("a game's lineup does not read its own day's box scores or any later day's", () => {
  const base = priced([source, target()]).get("2026-27")!;
  const changed = priced([source, built("2026-27", [
    { lines: { A: at(40, 101, 102, 103, 104, 105, 106), B: SB }, report: covered() },
    { lines: { A: [[101, 120], [102, 120]], B: at(80, 111, 112, 113) }, report: { home: { 101: "Out" }, away: {} } },
    { lines: { A: [[107, 240]], B: SB }, report: covered() },
  ])]).get("2026-27")!;
  assert.deepEqual(changed.lineups.get("g2"), base.lineups.get("g2"));
  assert.deepEqual(changed.missing.get("g2"), base.missing.get("g2"));
  assert.notDeepEqual(changed.lineups.get("g3"), base.lineups.get("g3"), "game 3 reads game 2's box score");
});

test("a season's rates come from the seasons before it, never its own games or reports", () => {
  // Later games where 101 is listed Out and plays: had they fed the rates, Out, missed 0 would rise above 0.
  const outButPlays: Play[] = [0, 1, 2].map(() => ({ lines: { A: at(40, 101, 102, 103, 104, 105, 106), B: SB }, report: { home: { 101: "Out" }, away: {} } }));
  const base = priced([source, target()]).get("2026-27")!;
  const more = priced([source, target(covered(), outButPlays)]).get("2026-27")!;
  assert.deepEqual(more.lineups.get("g2"), base.lineups.get("g2"));
  assert.deepEqual(more.missing.get("g2"), base.missing.get("g2"));
});

// A's 120 plays day 1 for A; on day 2 B's report lists him; on day 3 A hosts C; on day 4 B and A play again, to come.
const traded = (status: "Available" | "Out", playsForB: boolean) => built("2026-27", [
  { day: 1, home: "A", away: "C", lines: { A: [[120, 40], ...at(40, 101, 102, 103, 104, 105)], C: at(48, 131, 132, 133, 134, 135) }, report: covered() },
  { day: 1, home: "B", away: "D", lines: { B: SB, D: at(48, 141, 142, 143, 144, 145) }, report: covered() },
  { day: 2, home: "B", away: "D", lines: { B: [...SB, ...(playsForB ? [[120, 20] as [number, number]] : [])], D: at(48, 141, 142, 143, 144, 145) }, report: { home: { 120: status }, away: {} } },
  { day: 3, home: "A", away: "C", lines: { A: at(48, 101, 102, 103, 104, 105), C: at(48, 131, 132, 133, 134, 135) }, report: covered() },
  { day: 4, home: "B", away: "D", report: covered() },
  { day: 4, home: "A", away: "C", report: covered() },
]);
const holding = (season: Availability, athlete: number) => [...season.lineups].flatMap(([id, sides]) => (["home", "away"] as const).flatMap((w) => (sides[w].some((p) => p.athlete === athlete) ? [`${id} ${w}`] : [])));

test("a traded player counts for one team at most: the one whose report lists him, then the one he plays for", () => {
  // Listed Available by B: B's lineup in game 3 holds him; A's in games 4 and 6 do not, and nor does B's in game 5,
  // whose report does not list him.
  assert.deepEqual(holding(priced([source, traded("Available", false)]).get("2026-27")!, 120), ["g3 home"]);
  // Listed Out by B: no lineup holds him, A's included.
  assert.deepEqual(holding(priced([source, traded("Out", false)]).get("2026-27")!, 120), []);
  // He plays for B in game 3: B's next lineup holds him, A's day-3 and day-4 lineups do not.
  assert.deepEqual(holding(priced([source, traded("Available", true)]).get("2026-27")!, 120), ["g3 home", "g5 home"]);
});

test("a report adds a player only once he has played this season", () => {
  // 1 played for A last season and has not played this one. Game 3's report lists him Available, and he stays out:
  // the fit holds a value for him now only if he plays later this season. The traded player above, who has played
  // this season, shows a report can add a player.
  const listed = priced([source, target({ home: { 1: "Available" }, away: {} })]).get("2026-27")!;
  assert.deepEqual(Object.keys(minutesOf(listed.lineups.get("g3")!.home)).map(Number), [101, 102, 103, 104, 105, 106]);
});

test("a regular who sat the last game with no report clearing him counts as absent", () => {
  // A's 1 to 5 play 48 each in games 1 and 2. 5 sits games 3 and 4, unlisted, and 1 to 4 play 60 each. Game 3: 5
  // played the last game, so no one is absent. Game 4: 1 to 4 have 52 usual minutes (48, 48, 60), and 5, with 48,
  // missed game 3: 48 of 256 absent, 18.75%. So 8-20% holds 1 to 4 in game 4, each at 60/52, and nothing else.
  const sat = built("2025-26", [
    { lines: { A: at(48, 1, 2, 3, 4, 5), B }, report: covered() },
    { lines: { A: at(48, 1, 2, 3, 4, 5), B }, report: covered() },
    { lines: { A: at(60, 1, 2, 3, 4), B }, report: covered() },
    { lines: { A: at(60, 1, 2, 3, 4), B }, report: covered() },
  ]);
  const cell = rates([sat], ["2025-26"]).cells.find((c) => c.table === "minutes" && c.at.usual === "26+" && c.at.absent === "8-20%");
  assert.equal(cell?.n, 4);
  near(cell!.sum, 4 * (60 / 52), "1 to 4 in game 4");
});

test("the missing minutes leave out a regular who has missed more than the team's last game", () => {
  // 106 plays game 1 and sits games 2 and 3. Game 4, to come: 101 to 105 have 45.333 usual minutes (40, 48, 48) and
  // count at unlisted, missed 0's 29/30, so 5 x (5 x 45.333 x 1/30) / (5 x 45.333) = 1/6. 106, who missed 2, is no
  // part of it: with his 40 usual minutes at unlisted's 30/31 it would be 0.1659.
  const season = priced([source, built("2026-27", [
    { lines: { A: at(40, 101, 102, 103, 104, 105, 106), B: SB }, report: covered() },
    { lines: { A: at(48, 101, 102, 103, 104, 105), B: SB }, report: covered() },
    { lines: { A: at(48, 101, 102, 103, 104, 105), B: SB }, report: covered() },
    { report: covered() },
  ])]).get("2026-27")!;
  near(season.missing.get("g4")!.home, 1 / 6, "A's missing minutes");
});

test("a day's box scores enter after the whole day is priced, not game by game", () => {
  // Day 2 has two games. 150 plays his first game of the season in the first, for A, and B's report for the second
  // lists him Available. Before the day he has not played this season, so B's lineup does not hold him.
  const season = priced([source, built("2026-27", [
    { day: 1, home: "A", away: "C", lines: { A: at(48, 101, 102, 103, 104, 105), C: at(48, 131, 132, 133, 134, 135) }, report: covered() },
    { day: 1, home: "B", away: "D", lines: { B: SB, D: at(48, 141, 142, 143, 144, 145) }, report: covered() },
    { day: 2, home: "A", away: "C", lines: { A: [...at(40, 101, 102, 103, 104, 105), [150, 40]], C: at(48, 131, 132, 133, 134, 135) }, report: covered() },
    { day: 2, home: "B", away: "D", lines: { B: SB, D: at(48, 141, 142, 143, 144, 145) }, report: { home: { 150: "Available" }, away: {} } },
  ])]).get("2026-27")!;
  assert.deepEqual(holding(season, 150), []);
});

test("a season without a source season keeps version 4's entry itself", () => {
  const seasons = [source, target()];
  const v4 = v4Of(seasons);
  const out = priced(seasons, { fill: -0.3 }, v4);
  assert.equal(out.get("2025-26"), v4.get("2025-26"), "no season before it");
  assert.notEqual(out.get("2026-27"), v4.get("2026-27"));
  const fixed = priced(seasons, { fill: -0.3, from: ["2026-27"] }, v4);
  assert.equal(fixed.get("2026-27"), v4.get("2026-27"), "a listed season not before it");
  assert.deepEqual(priced(seasons, { fill: -0.3, from: ["2025-26"] }, v4).get("2026-27"), out.get("2026-27"), "listing the one season before it");
});
