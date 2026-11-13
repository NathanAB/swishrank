import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, type Game, type SeasonData } from "./elo.ts";
import { onCourtRatings, onCourtWalk, SECONDS_PER_POSSESSION, type OnCourtRule, type OnCourtSeason } from "./on-court.ts";
import type { Athlete, BoxRatings } from "./players.ts";
import type { SeasonStints, Stint } from "./stints.ts";

const near = (actual: number, want: number, what: string, tol = 1e-9) => assert.ok(Math.abs(actual - want) < tol, `${what}: ${actual}, wanted ${want}`);
const game = (id: string, day: string, final = true): Game => ({ id, t: `${day}T17:00Z`, home: "H", away: "A", hs: final ? 100 : null, as: final ? 90 : null, final, neutral: false, note: null });
const team = (name: string) => ({ name, short: name, color: "000000", alternateColor: "ffffff" });
/** A season with one game, `<season>-<i>`, on each of `days`. */
const seasonOf = (season: string, days: readonly string[]): SeasonData => ({ season, teams: { H: team("H"), A: team("A") }, games: days.map((d, i) => game(`${season}-${i}`, d)) });
const run = (first: string, n: number) => Array.from({ length: n }, (_, i) => addDays(first, i));
/** Box ratings over `days` with each player at `value(athlete, day)`. */
const boxOf = (athletes: Athlete[], days: readonly string[], value: (a: Athlete, day: string) => number = () => 0): BoxRatings => ({
  athletes, start: new Float64Array(athletes.length), after: new Map(days.map((d) => [d, Float64Array.from(athletes, (a) => value(a, d))])),
});
const stint = (home: Athlete[], away: Athlete[], seconds: number, hp: number, ap: number, threes: [number, number, number, number] = [0, 0, 0, 0]): Stint => [home, away, seconds, hp, ap, ...threes];
const record = (season: string, games: Record<string, Stint[]>): SeasonStints => ({ season, games });
const at = (r: BoxRatings, a: Athlete, values: Float64Array) => values[r.athletes.indexOf(a)];

const G1 = [1, 2, 3, 4, 5], G2 = [6, 7, 8, 9, 10], G3 = [11, 12, 13, 14, 15], G4 = [16, 17, 18, 19, 20];
const TEN = [...G1, ...G2];
// 288 seconds is 10 possessions: G1 wins its home stint by 10, 100 per possession, and loses its road stint by 4, -40.
const swapped = [stint(G1, G2, 288, 30, 20), stint(G2, G1, 288, 20, 24)];

// Each G1 player at u and each G2 player at -u, the home term at h: the two stints read 10u + h and -10u + h, so
// the ridge sum is 10 (100 - 10u - h)^2 + 10 (-40 + 10u - h)^2 + 10 ridge u^2, whose u-equation, free of h, is
// u (200 + ridge) = 1400: u = 14/3 at ridge 100.
test("a refit is the hand-worked ridge solution, and a box prior moves each player's value but the residual is what the stints add", () => {
  const day = "2020-01-01";
  const seasons: OnCourtSeason[] = [{ data: seasonOf("s1", [day]), stints: record("s1", { "s1-0": swapped }) }, { data: seasonOf("s2", []) }];
  const box = (value: (a: Athlete) => number) => new Map([["s1", boxOf(TEN, [day], value)], ["s2", boxOf(TEN, [])]]);
  const plain = onCourtRatings(seasons, box(() => 0), { ridge: 100, halfLife: 365, boxPrior: 0 }).get("s2")!;
  for (const a of TEN) near(at(plain, a, plain.start), a <= 5 ? 14 / 3 : -14 / 3, `player ${a}`);
  // G1's box rating 4 at boxPrior 0.5 puts its prior at 2 and G2's at 0. With residual e for G1 and -e for G2, the
  // stints read 10 + 10e + h and -10 - 10e + h: e (200 + ridge) = 1400 - 200, e = 4.
  const prior = onCourtRatings(seasons, box((a) => (a <= 5 ? 4 : 0)), { ridge: 100, halfLife: 365, boxPrior: 0.5 }).get("s2")!;
  for (const a of TEN) near(at(prior, a, prior.start), a <= 5 ? 4 : -4, `player ${a} with a box prior`);
});

test("the same stints halfLife days older count half", () => {
  const second = run("2020-01-05", 7);
  const seasons: OnCourtSeason[] = [{ data: seasonOf("s1", ["2020-01-01"]), stints: record("s1", { "s1-0": swapped }) }, { data: seasonOf("s2", second), stints: record("s2", {}) }];
  const box = new Map([["s1", boxOf(TEN, ["2020-01-01"])], ["s2", boxOf(TEN, second)]]);
  const s2 = onCourtRatings(seasons, box, { ridge: 100, halfLife: 10, boxPrior: 0 }).get("s2")!;
  near(at(s2, 1, s2.start), 14 / 3, "on the stints' own day, at full weight");
  near(at(s2, 1, s2.after.get("2020-01-10")!), 14 / 3, "before s2's first refit");
  // Ten days on, each stint counts 5 possessions: u (100 + ridge) = 700, u = 3.5.
  near(at(s2, 1, s2.after.get("2020-01-11")!), 3.5, "after s2's refit on day 7, ten days on");
  near(at(s2, 6, s2.after.get("2020-01-11")!), -3.5, "player 6, ten days on");
});

test("three-point makes above the earlier seasons' rate come out of the score, and a first season keeps its points", () => {
  // s1 makes 12 of 30 threes, 0.4, but its home side in the first stint 6 of 10 and its first road side 2 of 10.
  const s1 = [stint(G1, G2, 288, 30, 20, [10, 6, 5, 2]), stint(G2, G1, 288, 20, 24, [10, 2, 5, 2])];
  // In s2, G3 at home makes 6 of 10, 2 above 0.4, so its 10-point win counts as 4: u (200 + ridge) = 800, u = 8/3.
  const s2 = [stint(G3, G4, 288, 30, 20, [10, 6, 5, 2]), stint(G4, G3, 288, 20, 24, [10, 4, 10, 4])];
  const seasons: OnCourtSeason[] = [
    { data: seasonOf("s1", ["2020-01-01"]), stints: record("s1", { "s1-0": s1 }) },
    { data: seasonOf("s2", ["2021-01-01"]), stints: record("s2", { "s2-0": s2 }) },
    { data: seasonOf("s3", []) },
  ];
  const all = [...TEN, ...G3, ...G4];
  const box = new Map([["s1", boxOf(all, ["2020-01-01"])], ["s2", boxOf(all, ["2021-01-01"])], ["s3", boxOf(all, [])]]);
  const out = onCourtRatings(seasons, box, { ridge: 100, halfLife: 1e9, boxPrior: 0 });
  const second = out.get("s2")!, third = out.get("s3")!;
  near(at(second, 1, second.start), 14 / 3, "s1, with no earlier rate, keeps its points as scored");
  near(at(third, 11, third.start), 8 / 3, "s2 at s1's rate");
  near(at(third, 16, third.start), -8 / 3, "s2 at s1's rate, the road side");
});

test("a player with no stints, or under half a possession, keeps 0, and a very large ridge leaves every residual at 0", () => {
  const day = "2020-01-01";
  const tiny = stint([11, 2, 3, 4, 5], G2, SECONDS_PER_POSSESSION / 10, 1, 0);
  const seasons: OnCourtSeason[] = [{ data: seasonOf("s1", [day]), stints: record("s1", { "s1-0": [...swapped, tiny] }) }, { data: seasonOf("s2", []) }];
  const athletes = [...TEN, 11, 99];
  const box = new Map([["s1", boxOf(athletes, [day], (a) => (a === 11 || a === 99 ? 6 : a <= 5 ? 4 : 0))], ["s2", boxOf(athletes, [])]]);
  const s2 = onCourtRatings(seasons, box, { ridge: 100, halfLife: 365, boxPrior: 0.5 }).get("s2")!;
  assert.equal(at(s2, 99, s2.start), 0, "player 99 has no stint");
  assert.equal(at(s2, 11, s2.start), 0, "player 11 has a tenth of a possession");
  assert.ok(Math.abs(at(s2, 1, s2.start)) > 1, "player 1 has 20 possessions");
  const held = onCourtRatings(seasons, box, { ridge: 1e12, halfLife: 365, boxPrior: 0.5 }).get("s2")!;
  for (const a of athletes) assert.ok(Math.abs(at(held, a, held.start)) < 1e-6, `player ${a} at ridge 1e12: ${at(held, a, held.start)}`);
});

test("a season without a play-by-play record still gets its ratings, and the next season carries on from them", () => {
  const second = run("2020-01-05", 7);
  const seasons = (stints: SeasonStints | undefined): OnCourtSeason[] => [
    { data: seasonOf("s1", ["2020-01-01"]), stints: record("s1", { "s1-0": swapped }) },
    { data: seasonOf("s2", second), stints },
    { data: seasonOf("s3", ["2020-03-01"]) },
  ];
  const box = new Map([["s1", boxOf(TEN, ["2020-01-01"])], ["s2", boxOf(TEN, second)], ["s3", boxOf(TEN, ["2020-03-01"])]]);
  const rule = { ridge: 100, halfLife: 10, boxPrior: 0 };
  const out = onCourtRatings(seasons(undefined), box, rule);
  const s2 = out.get("s2")!, s3 = out.get("s3")!;
  assert.deepEqual([...s2.after.keys()], second);
  near(at(s2, 1, s2.after.get("2020-01-11")!), 3.5, "s2's refit decays s1's stints");
  assert.deepEqual(s3.start, s2.after.get("2020-01-11"), "s3 starts from s2's last refit");
  assert.deepEqual(out, onCourtRatings(seasons(record("s2", {})), box, rule), "no record is an empty record");
});

/** A deterministic record over players 1 to 12 and three seasons, with a game that is not final and stints the fit skips. */
function synthetic() {
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const lengths: [string, string, number][] = [["s1", "2020-01-01", 9], ["s2", "2020-03-01", 8], ["s3", "2020-05-01", 7]];
  const players = Array.from({ length: 11 }, (_, i) => i + 1);
  const seasons: OnCourtSeason[] = lengths.map(([season, first, n]) => {
    const days = run(first, n);
    const data = seasonOf(season, days);
    data.games.push(game(`${season}-open`, days[2], false));
    const games: Record<string, Stint[]> = {};
    for (const g of data.games) {
      games[g.id] = Array.from({ length: 4 }, () => {
        const order = [...players].sort(() => rand() - 0.5);
        const home = order.slice(0, 5).sort((a, b) => a - b), away = order.slice(5, 10).sort((a, b) => a - b);
        const ha = int(0, 8), aa = int(0, 8);
        return stint(home, away, int(60, 500), int(5, 30), int(5, 30), [ha, int(0, ha), aa, int(0, aa)]);
      });
      games[g.id].push(stint([1, 2, 3, 4], [5, 6, 7, 8, 9], 100, 10, 0), stint([1, 2, 3, 4, 5], [6, 7, 8, 9, 10], 0, 3, 0));
    }
    // Player 12 plays a few possessions on s1's first day only, so he drops below half a possession by s2.
    if (season === "s1") games["s1-0"].push(stint([1, 2, 3, 4, 12], [6, 7, 8, 9, 10], 120, 9, 2, [2, 1, 1, 0]));
    return { data, stints: record(season, games) };
  });
  const athletes = [...players, 12, 99];
  const box = new Map(seasons.map((s) => [s.data.season, boxOf(athletes, s.data.games.filter((g) => g.final).map((g) => g.t.slice(0, 10)), (a, d) => ((a * 7 + Number(d.slice(8))) % 11 - 5) / 2)]));
  return { seasons, box };
}
const RULE: OnCourtRule = { ridge: 50, halfLife: 10, boxPrior: 0.5 };

test("no rating reads a later game: on or before a day, every value is the same when later games' stints and box ratings change", () => {
  const { seasons, box } = synthetic();
  const base = onCourtRatings(seasons, box, RULE);
  const dayOf = (g: Game) => g.t.slice(0, 10);
  // s1's seventh day is a refit, its ninth its last; s2's third and seventh, a refit; s3's first.
  for (const cut of ["2020-01-07", "2020-01-08", "2020-01-09", "2020-03-03", "2020-03-07", "2020-05-01"]) {
    const changed = seasons.map(({ data, stints }): OnCourtSeason => ({
      data,
      stints: stints && record(stints.season, Object.fromEntries(Object.entries(stints.games).flatMap(([id, list]) => {
        const g = data.games.find((x) => x.id === id)!;
        if (dayOf(g) <= cut) return [[id, list]];
        return Number(dayOf(g).slice(8)) % 2 ? [] : [[id, list.map((s): Stint => [s[1], s[0], s[2], s[4] + 7, s[3], s[7], s[8], s[5], s[6]])]];
      }))),
    }));
    const changedBox = new Map([...box].map(([id, r]) => [id, { ...r, after: new Map([...r.after].map(([d, v]) => [d, d > cut ? v.map((x) => x + 1) : v])) }]));
    const later = onCourtRatings(changed, changedBox, RULE);
    seasons.forEach(({ data }, k) => {
      const id = data.season, a = base.get(id)!, b = later.get(id)!;
      const lastBefore = k > 0 ? [...base.get(seasons[k - 1].data.season)!.after.keys()].at(-1)! : "";
      if (lastBefore <= cut) assert.deepEqual(b.start, a.start, `${id} start, cut ${cut}`);
      for (const [d, v] of a.after) if (d <= cut) assert.deepEqual(b.after.get(d), v, `${id} ${d}, cut ${cut}`);
    });
  }
});

test("a player on record who first plays late in a season changes no rating before he does", () => {
  // Player 1 plays in s1, then not until s2's eighth and last day; 21 takes his place until then.
  const d1 = run("2020-01-01", 7), d2 = run("2020-03-01", 8);
  const s1: OnCourtSeason = { data: seasonOf("s1", d1), stints: record("s1", { "s1-0": swapped }) };
  const early = { "s2-0": [stint([2, 3, 4, 5, 21], G2, 288, 26, 20), stint(G2, [2, 3, 4, 5, 21], 288, 20, 22)] };
  const rest = [...G1.slice(1), ...G2, 21];
  const ratings = (stints: Record<string, Stint[]>, athletes: Athlete[]) =>
    onCourtRatings([s1, { data: seasonOf("s2", d2), stints: record("s2", stints) }], new Map([["s1", boxOf(TEN, d1)], ["s2", boxOf(athletes, d2, () => 2)]]), { ...RULE, halfLife: 365 }).get("s2")!;
  const full = ratings({ ...early, "s2-7": swapped }, [...rest, 1]), before = ratings(early, rest);
  const seventh = (r: BoxRatings) => rest.map((a) => at(r, a, r.after.get(d2[6])!));
  assert.deepEqual(seventh(full), seventh(before));
  assert.notEqual(at(full, 2, full.after.get(d2[6])!), 0);
});

test("a walk continued season by season gives what onCourtRatings gives over the whole list", () => {
  const { seasons, box } = synthetic();
  const walk = onCourtWalk(RULE);
  const kept = seasons.map((s) => {
    const r = walk.next(s, box.get(s.data.season)!);
    return { start: r.start.slice(), after: [...r.after].map(([d, v]) => [d, v.slice()] as const) };
  });
  const whole = onCourtRatings(seasons, box, RULE);
  seasons.forEach((s, k) => {
    const w = whole.get(s.data.season)!;
    assert.deepEqual(kept[k], { start: w.start, after: [...w.after] }, s.data.season);
  });
});

/** Every refit solved from scratch: the weighted normal equations of every stint up to its day, by Gaussian elimination. */
function direct(seasons: readonly OnCourtSeason[], box: ReadonlyMap<string, BoxRatings>, rule: OnCourtRule, season: number, day: string): Map<Athlete, number> {
  const f = 0.5 ** (1 / rule.halfLife);
  const epoch = (d: string) => Date.parse(d) / 86_400_000;
  const rows: { cols: Athlete[]; signs: number[]; y: number; weight: number }[] = [];
  let attempted = 0, made = 0;
  seasons.forEach(({ data, stints }, k) => {
    if (k > season) return;
    const rate = attempted > 0 ? made / attempted : null;
    for (const g of data.games) {
      if (!g.final) continue;
      const d = g.t.slice(0, 10);
      for (const s of stints?.games[g.id] ?? []) {
        if (s[0].length !== 5 || s[1].length !== 5 || s[2] <= 0) continue;
        if (k < season) { attempted += s[5] + s[7]; made += s[6] + s[8]; }
        if (d > day) continue;
        const w = s[2] / 28.8;
        const luck = rate === null ? 0 : 3 * (s[6] - rate * s[5]) - 3 * (s[8] - rate * s[7]);
        rows.push({ cols: [0, ...s[0], ...s[1]], signs: [1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1], y: (100 * (s[3] - s[4] - luck)) / w, weight: w * f ** (epoch(day) - epoch(d)) });
      }
    }
  });
  const ids = [...new Set(rows.flatMap((r) => r.cols))].sort((a, b) => a - b);
  const pos = new Map(ids.map((a, i) => [a, i]));
  const n = ids.length;
  const M = Array.from({ length: n }, () => new Array<number>(n).fill(0)), v = new Array<number>(n).fill(0);
  for (const r of rows) r.cols.forEach((c, p) => {
    v[pos.get(c)!] += r.weight * r.signs[p] * r.y;
    r.cols.forEach((d, q) => (M[pos.get(c)!][pos.get(d)!] += r.weight * r.signs[p] * r.signs[q]));
  });
  const b = box.get(seasons[season].data.season)!;
  const prior = (a: Athlete) => (b.athletes.includes(a) ? rule.boxPrior * b.after.get(day)![b.athletes.indexOf(a)] : 0);
  const active = ids.filter((a) => a === 0 || M[pos.get(a)!][pos.get(a)!] > 0.5);
  const S = active.map((a) => active.map((c) => M[pos.get(a)!][pos.get(c)!] + (a === c ? (a === 0 ? 1e-3 : rule.ridge) : 0)));
  const s = active.map((a) => v[pos.get(a)!] + (a === 0 ? 0 : rule.ridge * prior(a)));
  for (let i = 0; i < active.length; i++) for (let k = i + 1; k < active.length; k++) {
    const m = S[k][i] / S[i][i];
    for (let j = i; j < active.length; j++) S[k][j] -= m * S[i][j];
    s[k] -= m * s[i];
  }
  const x = new Array<number>(active.length).fill(0);
  for (let i = active.length - 1; i >= 0; i--) {
    let t = s[i];
    for (let j = i + 1; j < active.length; j++) t -= S[i][j] * x[j];
    x[i] = t / S[i][i];
  }
  return new Map(active.flatMap((a, i) => (a === 0 ? [] : [[a, x[i] - prior(a)] as const])));
}

test("every refit matches a from-scratch solve of the weighted normal equations", () => {
  const { seasons, box } = synthetic();
  const out = onCourtRatings(seasons, box, RULE);
  // Refits: s1 days 7 and 9 (its last, read as s2's start), s2 days 7 and 8 (s3's start), s3 day 7.
  const refits: [number, string, BoxRatings, Float64Array][] = [
    [0, "2020-01-07", out.get("s1")!, out.get("s1")!.after.get("2020-01-07")!],
    [0, "2020-01-09", out.get("s2")!, out.get("s2")!.start],
    [1, "2020-03-07", out.get("s2")!, out.get("s2")!.after.get("2020-03-07")!],
    [1, "2020-03-08", out.get("s3")!, out.get("s3")!.start],
    [2, "2020-05-07", out.get("s3")!, out.get("s3")!.after.get("2020-05-07")!],
  ];
  for (const [season, day, r, values] of refits) {
    const want = direct(seasons, box, RULE, season, day);
    if (day >= "2020-03-01") assert.ok(!want.has(12), "player 12 has dropped below half a possession");
    assert.ok(want.size >= 11, `${day}: ${want.size} players fitted`);
    for (const a of r.athletes) near(at(r, a, values), want.get(a) ?? 0, `${day} player ${a}`, 1e-7);
  }
});
