import { test } from "node:test";
import assert from "node:assert/strict";
import { dayKey, type Fit, type FitDay, type Game, type SeasonData } from "../src/lib/elo.ts";
import { parseBox, type Athlete, type Lineup } from "../src/lib/players.ts";
import { callsOf, changedByLaterResults, marketLines, reportsRead, scoreboard, type Call, type Calls, type Candidate, type Season } from "./past-seasons.ts";

const TEAM = { name: "T", short: "T", color: "000000", alternateColor: "ffffff" };
const NO_LINEUP = { home: [], away: [] };
/** A final game between H at home and A on `date` (6 pm US Eastern), with `hs` and `as`. */
const game = (id: string, date: string, hs: number, as: number): Game =>
  ({ id, t: `${date}T23:00:00Z`, home: "H", away: "A", hs, as, final: true, neutral: false, note: null });
const seasonOf = (id: string, games: Game[], box?: unknown, nbaReports?: unknown): Season =>
  ({ data: { season: id, teams: { H: TEAM, A: TEAM }, games }, box, preseason: undefined, nbaReports });
/** A box line of `minutes` for `athlete`, the other 12 numbers 0. */
const line = (athlete: Athlete, minutes: number) => [athlete, minutes, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const call = (p: number, lineup: Call["lineup"] = NO_LINEUP, values: Call["values"] = new Map()): Call => ({ p, lineup, values });
/** Every final game of a season at the same chance. */
const flat = (season: Season, p: number): Calls => new Map(season.data.games.filter((g) => g.final).map((g) => [g.id, call(p)]));
const constant = (name: string, p: number): Candidate => ({ name, choose: () => ({ settings: String(p), price: (s) => flat(s, p) }) });
const close = (actual: number, expected: number, tol = 1e-12) => assert.ok(Math.abs(actual - expected) < tol, `${actual} is not ${expected}`);

const A = seasonOf("2001-02", [game("a1", "2001-11-01", 100, 90), game("a2", "2001-11-02", 100, 90), game("a3", "2001-11-03", 100, 90), game("a4", "2001-11-04", 90, 100)]);
const B = seasonOf("2002-03", [game("b1", "2002-11-01", 100, 90), game("b2", "2002-11-02", 90, 100)]);
const C = seasonOf("2003-04", [game("c1", "2003-11-01", 100, 90), game("c2", "2003-11-02", 100, 90), game("c3", "2003-11-09", 90, 100)]);

test("scoreboard hands choose() only the seasons before the one it scores", () => {
  const rate: Candidate = {
    name: "Home-win rate",
    choose: (earlier) => {
      const finals = earlier.flatMap((s) => s.data.games);
      const r = finals.length ? finals.filter((g) => g.hs! > g.as!).length / finals.length : 0.5;
      return { settings: String(r), price: (s) => flat(s, r) };
    },
  };
  const board = scoreboard({ seasons: [C, A, B], scored: ["2002-03"], candidate: rate, baseline: constant("Even", 0.5) });
  // 2001-02 alone: 3 home wins in 4, so 0.75; a home win costs -ln 0.75, an away win -ln 0.25. With 2002-03 in, 4 in 6.
  assert.deepEqual(board.seasons[0].chosenFrom, ["2001-02"]);
  assert.equal(board.seasons[0].settings.candidate, "0.75");
  close(board.seasons[0].logLoss.a, (0.2876820724517809 + 1.3862943611198906) / 2);
  close(board.seasons[0].logLoss.b, 0.6931471805599453);
});

test("scoreboard scores two versions game by game, per season and pooled", () => {
  const board = scoreboard({ seasons: [A, B, C], scored: ["2003-04", "2002-03"], candidate: constant("Eighty", 0.8), baseline: constant("Even", 0.5) });
  assert.deepEqual(board.seasons.map((s) => s.season), ["2002-03", "2003-04"]);
  assert.deepEqual(board.seasons.map((s) => s.chosenFrom), [["2001-02"], ["2001-02", "2002-03"]]);
  const [b, c] = board.seasons.map((s) => s.logLoss);
  close(b.a, 0.916290731874155); close(b.b, 0.6931471805599453); close(b.d, 0.2231435513142097);
  close(c.a, 0.6852416716875066); close(c.b, 0.6931471805599453); close(c.d, -0.0079055088724387);
  const p = board.pooled.logLoss;
  assert.equal(p.n, 5);
  close(p.a, 0.7776612957621659); close(p.b, 0.6931471805599453); close(p.d, 0.0845141152022206);
  assert.deepEqual(board.games.map((g) => [g.id, g.day, g.y]), [["b1", 0, 1], ["b2", 1, 0], ["c1", 0, 1], ["c2", 1, 1], ["c3", 8, 0]]);
});

test("a version against itself differs by exactly 0", () => {
  let priced = 0;
  const same: Candidate = { name: "Eighty", choose: () => ({ settings: "", price: (s) => (priced++, flat(s, 0.8)) }) };
  const board = scoreboard({ seasons: [A, B, C], scored: ["2002-03", "2003-04"], candidate: same, baseline: same });
  for (const l of [...board.seasons, board.pooled]) assert.deepEqual([l.logLoss.d, l.logLoss.lo, l.logLoss.hi], [0, 0, 0]);
  // Each season priced by both, so the zero tests the pairing rather than one set of calls against itself.
  assert.equal(priced, 4);
});

test("scoreboard throws when a version has no call for a final game, or a scored season is not on file", () => {
  const none: Candidate = { name: "Silent", choose: () => ({ settings: "", price: () => new Map() }) };
  assert.throws(() => scoreboard({ seasons: [A, B], scored: ["2002-03"], candidate: none, baseline: constant("Even", 0.5) }), /Silent has no call for 2002-03 game b1/);
  assert.throws(() => scoreboard({ seasons: [A, B], scored: ["2009-10"], candidate: constant("Even", 0.5), baseline: constant("Even", 0.5) }), /2009-10 is not on file/);
});

test("the lineup measure: minutes on the wrong players and their value, played minutes scaled to 240", () => {
  // Overtime: five players at 53 minutes, 265 in all, so each played 48 of 240. The away side has no lines.
  const box = { season: "2002-03", games: { g1: { H: [line(1, 53), line(2, 53), line(3, 53), line(4, 53), line(5, 53)] } } };
  const S = seasonOf("2002-03", [game("g1", "2002-11-01", 100, 90)], box);
  // Player 4 predicted 24 of his 48, player 9 predicted 24 and did not play, player 5 out (his gap slot) and played 48.
  const guess: Lineup = [{ athlete: 1, share: 1 }, { athlete: 2, share: 1 }, { athlete: 3, share: 1 }, { athlete: 4, share: 0.5 }, { athlete: 9, share: 0.5 }, { athlete: -5, share: 1 }];
  const right: Lineup = [1, 2, 3, 4, 5].map((athlete) => ({ athlete, share: 1 }));
  const values = new Map([[4, 2], [9, -1], [5, 3]]);
  const fixed = (name: string, home: Lineup): Candidate => ({ name, choose: () => ({ settings: "", price: () => new Map([["g1", call(0.5, { home, away: [] }, values)]]) }) });
  const board = scoreboard({ seasons: [S], scored: ["2002-03"], candidate: fixed("Guess", guess), baseline: fixed("Right", right) });
  const l = board.seasons[0].lineups;
  assert.equal(l.teamGames, 1);
  // (24 + 24 + 48) / 2 = 48 minutes; -24/48 * 2 + 24/48 * -1 - 48/48 * 3 = -4.5.
  assert.deepEqual([l.misplaced.a, l.misplaced.b, l.misplaced.d], [48, 0, 48]);
  assert.deepEqual(l.valueError, { candidate: 4.5, baseline: 0 });
  const bare = scoreboard({ seasons: [B], scored: ["2002-03"], candidate: constant("Even", 0.5), baseline: constant("Even", 0.5) }).pooled.lineups;
  assert.equal(bare.teamGames, 0);
  assert.ok(Number.isNaN(bare.misplaced.d) && Number.isNaN(bare.valueError.candidate));
});

test("marketLines scores only the games the market has, and leaves the board as it was", () => {
  const board = scoreboard({ seasons: [A, B, C], scored: ["2002-03", "2003-04"], candidate: constant("Eighty", 0.8), baseline: constant("Even", 0.5) });
  const before = structuredClone(board);
  const m = marketLines(board, { c2: 0.6, z9: 0.3 });
  assert.deepEqual(board, before);
  assert.equal(m.seasons.length, 1);
  assert.equal(m.seasons[0].season, "2003-04");
  assert.equal(m.seasons[0].games, 1);
  close(m.seasons[0].market, 0.5108256237659907);
  close(m.seasons[0].candidate, 0.2231435513142097);
  close(m.seasons[0].baseline, 0.6931471805599453);
  assert.equal(m.pooled.games, 1);
  close(m.pooled.market, 0.5108256237659907);
  const empty = marketLines(board, {});
  assert.equal(empty.seasons.length, 0);
  assert.ok(empty.pooled.games === 0 && Number.isNaN(empty.pooled.market));
});

test("reportsRead counts the sides covered and the minutes from each report to its tip-off", () => {
  const games: Game[] = [
    { ...game("r1", "2024-11-12", 100, 90), t: "2024-11-13T00:30:00Z" },
    { ...game("r2", "2024-11-13", 100, 90), t: "2024-11-14T00:40:00Z" },
    game("r3", "2024-11-14", 100, 90),
    { ...game("r4", "2024-11-15", 0, 0), hs: null, as: null, final: false },
    { ...game("r5", "2024-11-16", 100, 90), t: "2024-11-17T00:30:00Z" },
  ];
  const reports = {
    season: "2024-25",
    games: {
      r1: { published: "2024-11-12T19:00", home: {}, away: {} },
      r2: { published: "2024-11-13T19:00", home: { 7: "Out" }, away: null },
      r5: { published: "2024-11-16T19:01", home: {}, away: {} },
    },
  };
  // r1 tips at 19:30 Eastern, 30 minutes after its report, which is in time; r2 at 19:40, 40 minutes after; r5 at 19:30, 29 minutes after.
  assert.deepEqual(reportsRead(seasonOf("2024-25", games, undefined, reports)), { finals: 4, both: 2, one: 1, neither: 1, lead: { median: 30, shortest: 29, late: 1 } });
  assert.deepEqual(reportsRead(seasonOf("2024-25", games)), { finals: 4, both: 0, one: 0, neither: 4, lead: null });
});

test("changedByLaterResults names the games whose calls read their own day or later", () => {
  const box = { season: "2002-03", games: { w1: { H: [line(1, 40)] }, w2: { H: [line(2, 40)] }, w3: { H: [line(3, 40)] } } };
  const S = seasonOf("2002-03", [game("w1", "2002-11-01", 100, 90), game("w2", "2002-11-02", 100, 90), game("w3", "2002-11-03", 100, 90)], box);
  const homeRate = (games: readonly Game[]) => (games.length ? games.filter((g) => g.hs! > g.as!).length / games.length : 0.5);
  const priceBy = (name: string, f: (season: Season, g: Game) => Call): Candidate =>
    ({ name, choose: () => ({ settings: "", price: (s) => new Map(s.data.games.map((g) => [g.id, f(s, g)])) }) });
  const walking = priceBy("Earlier days", (s, g) => call(homeRate(s.data.games.filter((x) => dayKey(x.t) < dayKey(g.t)))));
  const record = priceBy("Final record", (s) => call(homeRate(s.data.games)));
  const ownBox = priceBy("Own box score", (s, g) => {
    const lines = s.box === undefined ? [] : (parseBox(s.box, s.data.season).games[g.id]?.H ?? []);
    return call(0.5, { home: lines.map((l) => ({ athlete: l[0], share: l[1] / 48 })), away: [] });
  });
  const check = (candidate: Candidate, season = S) => changedByLaterResults({ candidate, earlier: [], season, day: "2002-11-02" });
  assert.deepEqual(check(walking), []);
  assert.deepEqual(check(record), ["w1", "w2"]);
  assert.deepEqual(check(ownBox), ["w2"]);
  // Versions that price every game from one figure of the whole season, each a kind of later data: all are caught.
  const keys = (file: unknown, field: string) => Object.keys((file as Record<string, object> | undefined)?.[field] ?? {}).length;
  const whole = (name: string, figure: (s: Season) => number) => priceBy(name, (s) => call(0.3 + figure(s) / 10_000));
  const byGame = { season: "2002-03", games: { w1: [], w2: [], w3: [] } };
  const reports = { season: "2002-03", games: { w1: { published: "2002-11-01T17:30", home: {}, away: {} }, w2: { published: "2002-11-02T17:30", home: {}, away: {} }, w3: { published: "2002-11-03T17:30", home: {}, away: {} } } };
  const injuries = { season: "2002-03", days: { "2002-11-01": {}, "2002-11-02": {}, "2002-11-03": {} } };
  const full: Season = { ...S, stints: byGame, nbaReports: reports, injuries };
  for (const leak of [
    whole("Margin sizes", (s) => s.data.games.reduce((t, g) => t + Math.abs(g.hs! - g.as!), 0)),
    whole("Points", (s) => s.data.games.reduce((t, g) => t + g.hs! + g.as!, 0)),
    whole("Play-by-play", (s) => keys(s.stints, "games")),
    whole("NBA reports", (s) => keys(s.nbaReports, "games")),
    whole("ESPN reports", (s) => keys(s.injuries, "days")),
  ]) assert.deepEqual(check(leak, full), ["w1", "w2"], leak.name);
  // A game's own NBA report and its day's ESPN report are published before it, so reading them is no leak.
  const ownReport = priceBy("Own reports", (s, g) => call(0.3 + (Number(g.id in ((s.nbaReports as typeof reports | undefined)?.games ?? {})) + Number(dayKey(g.t) in ((s.injuries as typeof injuries | undefined)?.days ?? {}))) / 10));
  assert.deepEqual(check(ownReport, full), []);
});

test("callsOf widens sigma while either side has played fewer than EARLY.games", () => {
  const fit: Fit = { r: { H: 2, A: 0 }, home: 1, v: new Map() };
  const games = [1, 2, 3, 4, 5, 6].map((d) => game(`c${d}`, `2002-11-0${d}`, 100, 90));
  const data: SeasonData = { season: "2002-03", teams: { H: TEAM, A: TEAM }, games };
  const days: FitDay[] = games.map((g) => ({ day: dayKey(g.t), games: [{ game: { ...g, hs: 100, as: 90 }, b2b: 0, lineup: NO_LINEUP }], before: fit, after: fit }));
  // Expected margin 2 - 0 + 1 = 3, sigma 3: with five games behind each side, Phi(1); with four, widened by 2, Phi(0.5).
  const calls = callsOf(data, days, 3, 2);
  close(calls.get("c5")!.p, 0.6914624612740131, 1e-6);
  close(calls.get("c6")!.p, 0.8413447460685429, 1e-6);
  assert.equal(calls.get("c6")!.values, fit.v);
});
