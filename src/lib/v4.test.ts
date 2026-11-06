import { test } from "node:test";
import assert from "node:assert/strict";
import { fitSeason, PARAMS, type Game, type SeasonData } from "./elo.ts";
import { parseDraft, topPick } from "./draft.ts";
import type { NbaArchive } from "./nba-report.ts";
import { boxRatings, gameScore, lineups, REPLACEMENT, type BoxLine, type Lineup, type SeasonBox, type Sides } from "./players.ts";
import { availability, seasonMean, SITE_RULE, topThreeStart, V4 } from "./v4.ts";

const team = (name: string) => ({ name, short: name, color: "000000", alternateColor: "ffffff" });
const game = (id: string, day: number): Game => ({
  id, t: `2026-10-${day}T23:00Z`, home: "A", away: "B", hs: 100, as: 90, final: true, neutral: false, note: null,
});
const line = (athlete: number, minutes: number): BoxLine => [athlete, minutes, 10, 4, 8, 2, 2, 1, 3, 2, 1, 0, 1, 2];
const minutesOf = (l: Lineup) => Object.fromEntries(l.map((p) => [p.athlete, Math.round(p.share * 48 * 1000) / 1000]));

// A plays four games. Player 3 plays the first and misses the second and third; the third's report clears him.
const data: SeasonData = { season: "2026-27", teams: { A: team("A"), B: team("B") }, games: [game("1", 20), game("2", 22), game("3", 24), game("4", 26)] };
const box: SeasonBox = {
  season: "2026-27",
  games: {
    1: { A: [line(1, 40), line(2, 40), line(3, 40), line(4, 40), line(5, 40), line(6, 40)], B: [line(9, 48)] },
    2: { A: [line(1, 40), line(2, 40), line(4, 40), line(5, 40), line(6, 40)], B: [line(9, 48)] },
    3: { A: [line(1, 40), line(2, 40), line(4, 40), line(5, 40), line(6, 40)], B: [line(9, 48)] },
    4: { A: [line(1, 40), line(2, 40), line(3, 40), line(4, 40), line(5, 40)], B: [line(9, 48)] },
  },
};
const archive: NbaArchive = {
  season: "2026-27",
  games: {
    3: { published: "2026-10-24T17:00", home: { 2: "Out", 4: "Questionable", 3: "Probable" }, away: null },
    4: { published: "2026-10-26T17:00", home: { 6: "Doubtful" }, away: {} },
  },
};
const fallback = (): ReadonlyMap<string, Sides<Lineup>> => new Map([["3", { home: [], away: [{ athlete: 77, share: 5 }] }]]);

test("a covered side drops Out and Doubtful, halves Questionable, and brings back a listed player who missed the last game", () => {
  const season = availability([{ data, box }], new Map([["2026-27", archive]]), fallback).get("2026-27")!;
  // Game 3, home: the previous game's 1, 2, 4, 5 and 6 at 40 each; 2 is out, 4 counts 20, and 3 comes back at 40.
  // 180 expected minutes scale to 240.
  assert.deepEqual(minutesOf(season.lineups.get("3")!.home), { 1: 53.333, 3: 53.333, 4: 26.667, 5: 53.333, 6: 53.333 });
  // Missing minutes: 40 of 2's and half of 4's 40, over the previous lineup's 200, as shares of 48.
  assert.equal(season.missing.get("3")!.home, (5 * 60) / 200);
  assert.deepEqual(season.lineups.get("3")!.away, [{ athlete: 77, share: 5 }], "an uncovered side takes the fallback");
  assert.equal(season.missing.get("3")!.away, 0);
  assert.ok(Math.abs(season.extra.get("3")! - V4.fill * 1.5) < 1e-12);
  // Game 4: 6 is Doubtful, so out; B is covered with no one listed, so its previous lineup stands.
  assert.deepEqual(Object.keys(minutesOf(season.lineups.get("4")!.home)).map(Number), [1, 2, 4, 5]);
  assert.deepEqual(minutesOf(season.lineups.get("4")!.away), { 9: 240 });
  assert.ok(!season.extra.has("1") && !season.extra.has("2"), "games without a report have no extra term");
});

test("a game still to come is priced by the same rule, from the team's last game", () => {
  const ahead: SeasonData = { ...data, games: [...data.games, { ...game("5", 28), hs: null, as: null, final: false }] };
  const reports: NbaArchive = { season: "2026-27", games: { 5: { published: "2026-10-28T17:00", home: { 1: "Out" }, away: null } } };
  const uncovered = () => new Map([["5", { home: [], away: [{ athlete: 77, share: 5 }] }]]);
  const season = availability([{ data: ahead, box }], new Map([["2026-27", reports]]), uncovered).get("2026-27")!;
  // Game 4's 1, 2, 3, 4 and 5, less 1; 6, who missed game 4, is not listed, so he stays out.
  assert.deepEqual(minutesOf(season.lineups.get("5")!.home), { 2: 60, 3: 60, 4: 60, 5: 60 });
  assert.deepEqual(season.lineups.get("5")!.away, [{ athlete: 77, share: 5 }], "an uncovered side takes the fallback");
  assert.ok(Math.abs(season.extra.get("5")! - V4.fill) < 1e-12, "40 of the previous lineup's 200 minutes, times 5");
});

test("a player not listed is not brought back, and expected minutes read the last 5 appearances", () => {
  const unlisted: NbaArchive = { season: "2026-27", games: { 3: { published: "x", home: {}, away: {} } } };
  const season = availability([{ data, box }], new Map([["2026-27", unlisted]]), fallback).get("2026-27")!;
  assert.deepEqual(Object.keys(minutesOf(season.lineups.get("3")!.home)).map(Number), [1, 2, 4, 5, 6]);
  const short = lineups([{ data, box: { season: "2026-27", games: { ...box.games, 2: { A: [line(1, 10), line(2, 40)], B: [line(9, 48)] } } } }], 1).get("2026-27")!;
  assert.deepEqual(minutesOf(short.previous.get("3")!.home), { 1: 48, 2: 192 }, "with 1 appearance player 1 expects 10 minutes, not 25");
});

test("the site's rule brings back an unlisted regular who missed only the previous game", () => {
  const reports: NbaArchive = { season: "2026-27", games: { 3: { published: "x", home: {}, away: {} }, 4: { published: "x", home: {}, away: {} } } };
  const priced = (rule: typeof SITE_RULE, archive = reports) => availability([{ data, box }], new Map([["2026-27", archive]]), fallback, rule).get("2026-27")!;
  const home = (rule: typeof SITE_RULE, id: string) => Object.keys(minutesOf(priced(rule).lineups.get(id)!.home)).map(Number);
  // Player 3, at 40 expected minutes, played game 1 and missed game 2.
  assert.deepEqual(home(SITE_RULE, "3"), [1, 2, 3, 4, 5, 6]);
  assert.equal(priced(SITE_RULE).missing.get("3")!.home, 0, "he was not in the previous lineup, so no one is missing");
  assert.deepEqual(home({ ...SITE_RULE, unlisted: 41 }, "3"), [1, 2, 4, 5, 6], "below the minutes bar he stays out");
  assert.deepEqual(home(SITE_RULE, "4"), [1, 2, 4, 5, 6], "missing two games in a row keeps him out");
  const listed: NbaArchive = { season: "2026-27", games: { 3: { published: "x", home: { 3: "Out" }, away: {} } } };
  assert.ok(!(3 in minutesOf(priced(SITE_RULE, listed).lineups.get("3")!.home)), "a report that lists him out wins");
});

test("the extra term moves the expected margin and comes out of the margin in the fit", () => {
  const players = { box, ratings: boxRatings([{ data, box }], 365).get("2026-27")!, lineups: new Map<string, Sides<Lineup>>(), rookies: new Set<number>() };
  const plain = fitSeason(data, PARAMS, { players });
  const shifted = fitSeason(data, PARAMS, { players, extra: new Map([["2", 0.5]]) });
  assert.equal(shifted[1].games[0].b2b - plain[1].games[0].b2b, 0.5);
  assert.ok(shifted[1].after.r.A < plain[1].after.r.A, "A's margin in game 2 is explained in part by the extra term, so A rates lower");
});

test("ESPN's draft line parses, and a top-three pick starts from last season's mean plus 0.28", () => {
  assert.deepEqual(parseDraft("2022: Rd 1, Pk 2 (OKC)"), [2022, 1, 2]);
  assert.equal(parseDraft(undefined), 0);
  assert.throws(() => parseDraft("soon"), /unreadable/);
  const draft = { 3: [2026, 1, 1] as [number, number, number], 4: [2026, 1, 4] as [number, number, number], 5: [2020, 1, 1] as [number, number, number] };
  assert.ok(topPick(draft, 3, "2026-27"));
  assert.ok(!topPick(draft, 4, "2026-27"), "the fourth pick is not a top-three pick");
  assert.ok(!topPick(draft, 5, "2026-27"), "a pick from six years before is not this season's");
  const before: SeasonData = { season: "2025-26", teams: data.teams, games: [{ ...game("0", 20), t: "2025-10-20T23:00Z" }] };
  const beforeBox: SeasonBox = { season: "2025-26", games: { 0: { A: [line(1, 30)], B: [line(9, 30)] } } };
  const seasons = [{ data: before, box: beforeBox }, { data, box }];
  const start = topThreeStart(seasons, new Map([["2026-27", new Set([3, 4])]]), draft);
  assert.equal(seasonMean(beforeBox), (36 * gameScore(line(1, 30))) / 30);
  assert.equal(start(3, "2026-27"), seasonMean(beforeBox)! + 0.28);
  assert.equal(start(4, "2026-27"), undefined);
  assert.equal(start(1, "2026-27"), undefined, "not a rookie");
  const ratings = boxRatings(seasons, 365, start).get("2026-27")!;
  const plain = boxRatings(seasons, 365).get("2026-27")!;
  const at = (r: typeof ratings, a: number) => r.start[r.athletes.indexOf(a)];
  assert.ok(Math.abs(at(ratings, 3) - at(plain, 3) - (seasonMean(beforeBox)! + 0.28 - REPLACEMENT)) < 1e-9, "before his first game he sits at his starting level");
});
