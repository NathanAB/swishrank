import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compute, dayKey, EARLY, ELO_PER_SIGMA, expected, fitModel, fitSeason, PARAMS, phi, played, playerPart, secondNights, shownLineups, START, b2bTerm, type Game, type SeasonData } from "./elo.ts";
import type { DraftFile } from "./draft.ts";
import { outcome } from "./facts.ts";
import { fixture } from "./fixtures.ts";
import { modelInputs, type OnCourt, type SeasonFiles } from "./inputs.ts";
import { onCourtRatings } from "./on-court.ts";
import { boxRatings, lineups, parseBox, type BoxLine, type Lineup } from "./players.ts";
import type { RosterRule } from "./roster-lineups.ts";
import { newcomers } from "./rookies.ts";
import { parseStints, type Stint } from "./stints.ts";
import { topThreeStart, V4 } from "./v4.ts";

const season = "2026-27";
const near = (actual: number, want: number, what: string) => assert.ok(Math.abs(actual - want) < 1e-9, `${what}: ${actual}, wanted ${want}`);
const team = (name: string) => ({ name, short: name, color: "000000", alternateColor: "ffffff" });
const game = (id: string, day: number, away: string, home: string, as: number | null = null, hs: number | null = null): Game => ({
  id, t: `2026-10-${day}T23:00Z`, home, away, hs, as, final: hs !== null, neutral: false, note: null,
});
const line = (athlete: number, minutes: number, points: number): BoxLine => [athlete, minutes, points, 4, 8, 2, 2, 1, 3, 2, 1, 0, 1, 2];
const roster = (base: number, points: number) => [line(base, 36, points), line(base + 1, 30, points - 4), line(base + 2, 24, 6)];

// Three game days played, then A hosts B on the 24th, B's second night, and C hosts D on the 26th, both rested.
const data: SeasonData = {
  season,
  teams: Object.fromEntries(["A", "B", "C", "D"].map((a) => [a, team(a)])),
  games: [
    game("1", 21, "B", "A", 100, 110), game("2", 21, "D", "C", 98, 101),
    game("3", 22, "C", "A", 104, 99), game("4", 23, "D", "B", 95, 107),
    game("5", 24, "B", "A"), game("6", 26, "D", "C"),
  ],
};
const box = {
  season,
  games: {
    1: { A: roster(10, 24), B: roster(20, 20) }, 2: { C: roster(30, 18), D: roster(40, 16) },
    3: { A: roster(10, 22), C: roster(30, 20) }, 4: { B: roster(20, 22), D: roster(40, 14) },
  },
};
const preseason = { season, games: 82, totals: { A: 55, B: 46, C: 38, D: 25 }, source: "test" };
const inputs = modelInputs([{ data, box, preseason }]).get(season)!;
const model = compute(data, inputs);

test("opening night shows each team's seed, read from its preseason win total", () => {
  const opening = model.series[0].r;
  const byTotal = [...model.abbrs].sort((x, y) => preseason.totals[y] - preseason.totals[x] || x.localeCompare(y));
  const byOpening = [...model.abbrs].sort((x, y) => opening[y] - opening[x] || x.localeCompare(y));
  assert.deepEqual(byOpening, byTotal);
  const perWin = (PARAMS.seed.scale / preseason.games) * (ELO_PER_SIGMA / PARAMS.sigma);
  assert.ok(Math.abs(opening.A - opening.D - perWin * (preseason.totals.A - preseason.totals.D)) < 1e-9, `A ${opening.A}, D ${opening.D}`);
  const days = model.series.map((d) => d.r.D);
  assert.deepEqual(model.stats.D, { hi: Math.max(...days), lo: Math.min(...days) }, "hi and lo run from the seed, not from 1000");
});

test("a game to come gets the model's chance: team parts, each side's next lineup, home court and the back-to-back", () => {
  const days = fitSeason(data, PARAMS, inputs);
  const next: Record<string, Lineup> = Object.fromEntries(model.abbrs.map((a) => [a, []]));
  for (const teams of lineups([{ data, box }], V4.recent).get(season)!.next.values()) Object.assign(next, teams);
  const fit = days.at(-1)!.after;
  const second = secondNights(data);
  assert.deepEqual(model.upcoming.map((g) => [g.id, model.b2b[g.id] !== 0]), [["5", true], ["6", false]]);
  for (const game of model.upcoming) {
    const e = expected(fit, { game: { ...game, hs: 0, as: 0 }, b2b: b2bTerm(PARAMS, second.get(game.id)!), lineup: { home: next[game.home], away: next[game.away] } });
    const widen = played(model.log, game) < EARLY.games ? EARLY.widen : 1;
    const p = fixture(game, model).lines[1].chance;
    assert.ok(Math.abs(p - phi(e / (PARAMS.sigma * widen))) < 1e-9, `${game.id}: ${p}`);
  }
});

// Last season player 99 starred for E; this season A brings him in for its second game, a 35-point loss at C.
// D has yet to play.
const lastSeason: SeasonData = {
  season: "2025-26",
  teams: { A: team("A"), E: team("E") },
  games: [21, 22, 23, 24, 25].map((day) => ({ ...game(`old${day}`, day, "A", "E", 100, 112), t: `2025-10-${day}T23:00Z` })),
};
const lastBox = { season: "2025-26", games: Object.fromEntries(lastSeason.games.map((g) => [g.id, { A: roster(10, 18), E: [line(99, 36, 45), ...roster(50, 16)] }])) };
const switched: SeasonData = {
  season,
  teams: data.teams,
  games: [game("1", 21, "B", "A", 100, 110), game("2", 22, "A", "C", 90, 125), game("3", 22, "B", "D")],
};
const switchedBox = { season, games: { 1: { A: roster(10, 24), B: roster(20, 20) }, 2: { A: [...roster(10, 12).slice(0, 2), line(99, 36, 30)], C: roster(30, 30) } } };
const seasonsWith = (box: unknown) => modelInputs([{ data: lastSeason, box: lastBox, preseason: { ...preseason, season: "2025-26", totals: { A: 41, E: 41 } } }, { data: switched, box, preseason }]);
const withStar = compute(switched, seasonsWith(switchedBox).get(season));

test("a game's change is its team's whole move that day, from the chart the day before to the chart that day, a new player's first minutes included", () => {
  const { result } = withStar.log.A[1];
  assert.equal(result.game.id, "2");
  const chart = (day: string) => withStar.series.find((d) => d.day === day)!.r.A;
  near(result.pre.a, chart("2026-10-21"), "A's rating before the game");
  near(result.post.a, chart(result.day), "A's rating after the game");
  near(outcome(result).away.rating, chart(result.day), "A's rating in its log");
  const inputs = seasonsWith(switchedBox).get(season)!;
  const { before, after } = fitModel(switched, inputs).find((d) => d.day === result.day)!;
  const was = inputs.players!.rotation.get("2026-10-21")!.A!;
  const fit = (after.r.A - before.r.A + playerPart(after, was) - playerPart(before, was)) * (ELO_PER_SIGMA / PARAMS.sigma);
  assert.ok(fit < 0, `A lost by 35 and the fit alone moved it ${fit}`);
  assert.ok(result.post.a - result.pre.a > fit + 20, `A's change, ${result.post.a - result.pre.a}, counts player 99; the fit alone moved it ${fit}`);
});

test("a team's opening point counts the players of its first game once it is played, and its seed alone until then", () => {
  const inputs = seasonsWith(switchedBox).get(season)!;
  const start = fitSeason(switched, PARAMS, inputs)[0].before;
  const firstGame = playerPart(start, inputs.players!.rotation.get("2026-10-21")!.A!);
  assert.ok(Math.abs(firstGame) > 0.05, `A's first game's players are worth ${firstGame}`);
  const opening = withStar.series[0].r;
  const seedGap = PARAMS.seed.scale * ((preseason.totals.A - preseason.totals.D) / preseason.games);
  const want = (seedGap + firstGame) * (ELO_PER_SIGMA / PARAMS.sigma);
  assert.ok(Math.abs(opening.A - opening.D - want) < 1e-9, `A ${opening.A}, D ${opening.D}, gap wanted ${want}`);
});

test("a team's shown rating is 1000 plus its own team part and its rotation's player part, so no other team's move shifts it", () => {
  const inputs = seasonsWith(switchedBox).get(season)!;
  const shown = shownLineups(switched, inputs.players!.rotation);
  for (const { day, after } of fitModel(switched, inputs)) {
    const r = withStar.series.find((d) => d.day === day)!.r;
    for (const a of Object.keys(r)) near(r[a], START + (after.r[a] + playerPart(after, shown.after.get(day)![a])) * (ELO_PER_SIGMA / PARAMS.sigma), `${day} ${a}`);
  }
});

// Next season: A, B and C have totals, D has none, and Z, a total for a team with no games, is ignored.
const nextSeason = (teams: string[], nextTotals: unknown) => {
  const nextData: SeasonData = { season: "2027-28", teams: Object.fromEntries(teams.map((a) => [a, team(a)])), games: [] };
  return modelInputs([{ data, box, preseason }, { data: nextData, box: { season: "2027-28", games: {} }, preseason: nextTotals }]);
};
const lastParts = () => fitModel(data, modelInputs([{ data, box, preseason }]).get(season)!).at(-1)!.after.r;

test("a season without preseason totals seeds each team at 0.7 times its last team rating of the season before, centred", () => {
  const centres = nextSeason(["A", "B", "C", "D"], undefined).get("2027-28")!.centres!;
  const last = lastParts();
  const mean = (last.A + last.B + last.C + last.D) / 4;
  for (const a of ["A", "B", "C", "D"]) near(centres[a], PARAMS.seed.carry * (last[a] - mean), a);
});

test("a team without a total is seeded from the season before, a team new to the league at the average, and a total for a team with no games is ignored", () => {
  const totals = { A: 50, B: 40, C: 30, Z: 60 };
  const centres = nextSeason(["A", "B", "C", "D", "N"], { season: "2027-28", games: 82, totals, source: "test" }).get("2027-28")!.centres!;
  const raw = { ...Object.fromEntries(Object.entries(totals).map(([a, w]) => [a, PARAMS.seed.scale * (w / 82 - 0.5)])), D: PARAMS.seed.carry * lastParts().D, N: 0 };
  const mean = (raw.A + raw.B + raw.C + raw.D + raw.N) / 5;
  assert.deepEqual(Object.keys(centres), ["A", "B", "C", "D", "N"]);
  for (const a of Object.keys(centres)) near(centres[a], raw[a as keyof typeof raw] - mean, a);
});

test("a season added before opening night, with no teams or some of them, and a season without box scores still rate", () => {
  for (const teams of [[], ["A", "B", "C"]]) {
    const inputs = nextSeason(teams, { season: "2027-28", games: 82, totals: { A: 50, B: 40, C: 30, D: 20 }, source: "test" }).get("2027-28");
    const model = compute({ season: "2027-28", teams: Object.fromEntries(teams.map((a) => [a, team(a)])), games: [] }, inputs);
    assert.deepEqual([model.series, model.results, model.order], [[], [], teams.length ? ["A", "B", "C"] : []]);
  }
  const noBox = modelInputs([{ data, box: undefined, preseason }]).get(season)!;
  const teamsAlone = compute(data, { centres: noBox.centres });
  compute(data, noBox).results.forEach((r, i) => near(r.p, teamsAlone.results[i].p, `game ${r.game.id} without box scores`));
});

// Version 5: stints for game 2 (D at C) and game 3 (C at A), none for B's players, then two seasons of A against B
// with box scores and no play-by-play.
const fives = (base: number, last = 4) => [base, base + 1, base + 2, base + 3, base + last];
const stints = {
  season,
  games: {
    2: [[fives(30), fives(40), 500, 15, 10, 5, 2, 4, 1]],
    3: [[fives(10), fives(30), 600, 20, 10, 5, 2, 5, 2], [fives(10, 5), fives(30, 5), 400, 8, 12, 3, 1, 4, 2]],
  } satisfies Record<string, Stint[]>,
};
const later = (id: string): SeasonFiles => ({
  data: { season: id, teams: { A: team("A"), B: team("B") }, games: [{ ...game("1", 21, "B", "A", 100, 104), t: `${id.slice(0, 4)}-10-21T23:00Z` }] },
  box: { season: id, games: { 1: { A: roster(10, 20), B: roster(20, 20) } } },
  preseason: undefined,
});
const files: SeasonFiles[] = [{ data, box, preseason, stints }, later("2027-28"), later("2028-29")];
const RULE: OnCourt = { ridge: 100, halfLife: 365, boxPrior: 0.5, refitEvery: 1, weight: 0.12 };

test("with on-court settings, a rating is the box rating plus weight / a times the on-court residual, and a player with no play-by-play keeps his box rating exactly", () => {
  const v4 = modelInputs(files).get("2027-28")!.players!.ratings;
  const v5 = modelInputs(files, {}, RULE).get("2027-28")!.players!.ratings;
  const boxBy = new Map(["2026-27", "2027-28", "2028-29"].map((id) => [id, modelInputs(files).get(id)!.players!.ratings]));
  const residual = onCourtRatings(files.map((f) => ({ data: f.data, stints: f.stints === undefined ? undefined : parseStints(f.stints, f.data.season) })), boxBy, RULE).get("2027-28")!;
  assert.deepEqual(v5.athletes, [10, 11, 12, 20, 21, 22]);
  for (const j of [3, 4, 5]) assert.equal(v5.start[j], v4.start[j], `player ${v5.athletes[j]} has no stint`);
  for (const j of [0, 1, 2]) {
    assert.ok(Math.abs(residual.start[j]) > 0.01, `player ${v5.athletes[j]}'s residual, ${residual.start[j]}`);
    near((v5.start[j] - v4.start[j]) / residual.start[j], 1.5, `player ${v5.athletes[j]}: weight / a = 0.12 / 0.08`);
  }
});

test("seasons without a play-by-play record still get on-court ratings, carried on from the record before them", () => {
  const v4 = modelInputs(files), v5 = modelInputs(files, {}, RULE);
  for (const id of ["2027-28", "2028-29"]) {
    const box = v4.get(id)!.players!.ratings, mixed = v5.get(id)!.players!.ratings;
    assert.deepEqual([...mixed.after.keys()], [...box.after.keys()], id);
    assert.ok(Math.abs(mixed.start[0] - box.start[0]) > 0.01, `${id}: player 10 starts at ${mixed.start[0]}, his box rating ${box.start[0]}`);
  }
});

test("without on-court settings, a real season's ratings are its box ratings, its play-by-play on file or not", () => {
  const ID = "2023-24";
  const read = (path: string): unknown => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));
  const full = read(`src/data/games/${ID}.json`) as SeasonData;
  const real: SeasonData = { ...full, games: full.games.filter((g) => dayKey(g.t) < "2023-11-15") };
  const ids = new Set(real.games.map((g) => g.id));
  const cut = (raw: unknown) => ({ season: ID, games: Object.fromEntries(Object.entries(parseStints(raw, ID).games).filter(([id]) => ids.has(id))) });
  const rawBox = parseBox(read(`src/data/box/${ID}.json`), ID);
  const realBox = { season: ID, games: Object.fromEntries(Object.entries(rawBox.games).filter(([id]) => ids.has(id))) };
  const draft = read("src/data/draft.json") as DraftFile;
  const walked = [{ data: real, box: realBox }];
  const own = boxRatings(walked, PARAMS.players.halfLife, topThreeStart(walked, newcomers(walked), draft)).get(ID)!;
  const file = { data: real, box: realBox, preseason: undefined, stints: cut(read(`scripts/stints/${ID}.json`)) };
  assert.ok(own.after.size > 15 && own.athletes.length > 300);
  assert.deepEqual(modelInputs([file], draft).get(ID)!.players!.ratings, own);
  assert.notDeepEqual(modelInputs([file], draft, RULE).get(ID)!.players!.ratings, own, "the on-court settings do move it");
});

test("with a roster rule, a game still to come gets a roster lineup, and its report's statuses move it and the game's chance", () => {
  const games = (year: string, ids: string[], played: number): Game[] => ids.map((id, i) => ({
    id, t: `${year}-11-0${i + 1}T23:00Z`, home: "A", away: "B", hs: i < played ? 100 : null, as: i < played ? 90 : null, final: i < played, neutral: false, note: null,
  }));
  const five = (base: number, minutes = 48) => [0, 1, 2, 3, 4].map((k) => line(base + k, minutes, 10));
  // Last season: in its second game, A's 5 is listed Out and sits, and 1 to 4 play 60 each with 48 of their 240
  // usual minutes absent: Out, missed 0 is 0 of 1, unlisted 1 of 1, and the minutes multiplier at 26+ and 20-35% is
  // 60/48 = 1.25, at 26+ and under 8% (B) 1.
  const last: SeasonData = { season: "2025-26", teams: { A: team("A"), B: team("B") }, games: games("2025", ["s1", "s2"], 2) };
  const lastBox = { season: "2025-26", games: { s1: { A: five(1), B: five(11) }, s2: { A: [1, 2, 3, 4].map((a) => line(a, 60, 10)), B: five(11) } } };
  const lastReports = { season: "2025-26", games: { s1: { published: "x", home: {}, away: {} }, s2: { published: "x", home: { 5: "Out" }, away: {} } } };
  const now: SeasonData = { season, teams: last.teams, games: games("2026", ["n1", "n2"], 1) };
  const nowBox = { season, games: { n1: { A: five(101), B: five(111) } } };
  const priced = (status: string, roster: RosterRule | null = { fill: -0.3 }) => {
    const nbaReports = { season, games: { n1: { published: "x", home: {}, away: {} }, n2: { published: "x", home: { 102: status }, away: {} } } };
    const files: SeasonFiles[] = [
      { data: last, box: lastBox, preseason: { season: "2025-26", games: 82, totals: { A: 41, B: 41 }, source: "test" }, nbaReports: lastReports },
      { data: now, box: nowBox, preseason: { season, games: 82, totals: { A: 41, B: 41 }, source: "test" }, nbaReports },
    ];
    const inputs = modelInputs(files, {}, undefined, roster ?? undefined).get(season)!;
    const minutes = Object.fromEntries(inputs.players!.lineups.get("n2")!.home.map((p) => [p.athlete, Math.round(p.share * 48 * 1000) / 1000]));
    return { minutes, gap: compute(now, inputs).gaps.n2 };
  };
  // Out: 102 at 0; 101, 103, 104 and 105 at 1 x 1.25 x 48 each, equal, 60 each.
  const out = priced("Out");
  assert.deepEqual(out.minutes, { 101: 60, 103: 60, 104: 60, 105: 60 });
  // Available, never observed: 0.5, and no one absent, so 1: 102 at 24 and the rest at 48, 216 scaled to 240.
  const available = priced("Available");
  assert.deepEqual(available.minutes, { 101: 53.333, 102: 26.667, 103: 53.333, 104: 53.333, 105: 53.333 });
  assert.notEqual(available.gap, out.gap);
  assert.deepEqual(priced("Available", null).minutes, { 101: 48, 102: 48, 103: 48, 104: 48, 105: 48 }, "without the rule, version 4's: game 1's five at their 48");
});
