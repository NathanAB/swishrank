// node scripts/rookie-start.ts: an investigation on past seasons, not part of any model (docs/rookie-start.md). Does a
// rookie's starting box rating from his draft pick and age predict games better than version 4's top-three rule?
// It fits the level rookies played their first 500 minutes at against pick and age on 2016-17 to 2022-23, scores
// each rule against version 4 as the site runs it, and shows what the curve would do to 2026-27's rookies. With
// --fit it stops after the fits, in about a second; the backtest takes about 15 minutes. Birth dates come from ESPN's
// athlete pages and are cached in .cache/birth-dates.json, which git ignores: the repository is public and keeps
// nothing about a player but his name.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ELO_PER_SIGMA, finalDays, fitModel, PARAMS, seasonRule, type SeasonData, type SeasonInputs } from "../src/lib/elo.ts";
import { parseArchive } from "../src/lib/injuries.ts";
import { modelInputs, type SeasonFiles } from "../src/lib/inputs.ts";
import { parseNbaArchive, type NbaArchive } from "../src/lib/nba-report.ts";
import { boxRatings, gameScore, lineups, parseBox, REPLACEMENT, type Athlete, type BoxRatings, type SeasonBox } from "../src/lib/players.ts";
import { reportLineups } from "../src/lib/report-lineup.ts";
import { availability, seasonMean, topThreeStart, V4, type Availability } from "../src/lib/v4.ts";
import { topPick, type DraftFile } from "../src/lib/draft.ts";
import { compare, fitSigma, fitWiden, inSeasons, modelRows, price, TUNING, type Diff, type Row, type Scored } from "./evaluate.ts";

const FIT = ["2016-17", "2017-18", "2018-19", "2019-20", "2020-21", "2021-22", "2022-23"];
const EARLY_FIT = ["2016-17", "2017-18", "2018-19", "2019-20"];
const EXPLORATION = ["2023-24", "2024-25", "2025-26"];
const LATER = ["2020-21", "2021-22", "2022-23", ...EXPLORATION];
const CURRENT = "2026-27";
/** The minutes of a rookie's career his level is read over, as in docs/model-v4.md. */
const FIRST = 500;
/** Ages are counted from this age, so the curve's constant is a 20-year-old's level. */
const AGE0 = 20;

const read = (path: string): unknown => JSON.parse(readFileSync(new URL(`../src/data/${path}`, import.meta.url), "utf8"));
const maybe = (path: string): unknown => { try { return read(path); } catch { return undefined; } };
const ALL = (read("seasons.json") as { id: string }[]).map((s) => s.id).sort();
const draft = read("draft.json") as DraftFile;
const names = read("players.json") as Record<string, string>;
const files: SeasonFiles[] = ALL.map((id) => ({ data: read(`games/${id}.json`) as SeasonData, box: maybe(`box/${id}.json`), preseason: maybe(`preseason/${id}.json`), injuries: maybe(`injuries/${id}.json`), nbaReports: maybe(`nba-reports/${id}.json`) }));
const walked = files.map((f) => ({ data: f.data, box: f.box === undefined ? { season: f.data.season, games: {} } : parseBox(f.box, f.data.season) }));
const site = modelInputs(files, draft);
const rookies = new Map(ALL.map((id) => [id, site.get(id)!.players!.rookies!]));
const means = new Map(walked.map((w) => [w.data.season, seasonMean(w.box)]));
const before = (season: string) => means.get(ALL[ALL.indexOf(season) - 1]);

// Birth dates.
const CACHE = new URL("../.cache/birth-dates.json", import.meta.url);
const ATHLETE = (id: Athlete) => `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}`;
const births: Record<string, string | null> = (() => { try { return JSON.parse(readFileSync(CACHE, "utf8")); } catch { return {}; } })();
/** ESPN's displayDOB, day first, as in "4/1/2004" for January 4, as an ISO day, or undefined without one. */
const isoDob = (s: string | null | undefined) => {
  const m = s ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s) : null;
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : undefined;
};
const wanted = [...new Set([...rookies.values()].flatMap((s) => [...s]))].filter((a) => !(a in births));
for (let i = 0; i < wanted.length; i += 4) {
  await Promise.all(wanted.slice(i, i + 4).map(async (a) => {
    try {
      const res = await fetch(ATHLETE(a));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const dob = ((await res.json()) as { athlete?: { displayDOB?: unknown } }).athlete?.displayDOB;
      births[a] = typeof dob === "string" && dob ? dob : null;
    } catch (err) {
      console.error(`no birth date for ${a} this time: ${(err as Error).message}`);
    }
  }));
  await new Promise((r) => setTimeout(r, 200));
}
if (wanted.length) { mkdirSync(new URL("../.cache/", import.meta.url), { recursive: true }); writeFileSync(CACHE, JSON.stringify(births, null, 1)); }
/** Age in years on February 1 of the season's second calendar year, Basketball-Reference's season age, unrounded. */
const ageOf = (a: Athlete, season: string) => {
  const dob = isoDob(births[a]);
  return dob ?(Date.parse(`${Number(season.slice(0, 4)) + 1}-02-01`) - Date.parse(dob)) / (365.2425 * 86_400_000) : undefined;
};

// Every rookie: his draft, age, and the level of his first 500 minutes against the previous season's mean.
type Rookie = { athlete: Athlete; season: string; pick: number | null; topThree: boolean; age: number | undefined; minutes: number; level: number };
const first = new Map<Athlete, { season: string; g: number; m: number }>();
for (const [season, set] of rookies) for (const a of set) first.set(a, { season, g: 0, m: 0 });
for (const { data, box } of walked) for (const { games } of finalDays(data)) for (const g of games) for (const lines of Object.values(box.games[g.id] ?? {})) for (const l of lines ?? []) {
  const r = first.get(l[0]);
  if (!r || r.m >= FIRST) continue;
  const take = Math.min(1, (FIRST - r.m) / l[1]);
  r.g += take * gameScore(l); r.m += take * l[1];
}
const all: Rookie[] = [...first].flatMap(([athlete, { season, g, m }]) => {
  const mean = before(season);
  if (mean === undefined || !m) return [];
  const d = draft[athlete];
  return [{ athlete, season, pick: Array.isArray(d) ? d[2] : null, topThree: topPick(draft, athlete, season), age: ageOf(athlete, season), minutes: m, level: (36 * g) / m - mean }];
});
const inFit = (ids: string[]) => all.filter((r) => ids.includes(r.season));

// Coverage.
const out: string[] = [];
const say = (s: string) => out.push(s);
const table = (head: string[], body: (string | number)[][]) => say([`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((r) => `| ${r.join(" | ")} |`)].join("\n") + "\n");
{
  const rows = ALL.filter((id) => rookies.get(id)!.size).map((id) => {
    const set = [...rookies.get(id)!];
    const noDraft = set.filter((a) => !(a in draft)).length, undrafted = set.filter((a) => draft[a] === 0).length;
    return [id, set.length, set.length - undrafted - noDraft, undrafted, noDraft, set.filter((a) => !isoDob(births[a])).length];
  });
  say("### Rookies, drafts and birth dates\n");
  table(["Season", "Rookies", "Drafted", "Undrafted", "Not in draft.json", "No birth date"], rows);
}

// Fits: minutes-weighted least squares of the level on each rule's terms.
type Curve = { a: number; b: number; c: number; undrafted: number; age: number };
function solve(X: number[][], y: number[], w: number[]): number[] {
  const k = X[0].length;
  const A = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
  X.forEach((x, n) => { for (let i = 0; i < k; i++) { for (let j = 0; j < k; j++) A[i][j] += w[n] * x[i] * x[j]; A[i][k] += w[n] * x[i] * y[n]; } });
  for (let i = 0; i < k; i++) {
    const p = A.slice(i).reduce((best, row, j) => (Math.abs(row[i]) > Math.abs(A[best][i]) ? i + j : best), i);
    [A[i], A[p]] = [A[p], A[i]];
    for (let r = 0; r < k; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c <= k; c++) A[r][c] -= f * A[i][c]; }
  }
  return A.map((row, i) => row[k] / row[i]);
}
const wmean = (xs: number[], w: number[]) => xs.reduce((s, x, i) => s + w[i] * x, 0) / w.reduce((s, x) => s + x, 0);
/** A rule fitted on `rs`: the drafted rookies' a + b log(pick) + c (age - 20), with `c` 0 for pick alone, and the undrafted rookies' own mean. */
function fitCurve(rs: Rookie[], withAge: boolean): Curve {
  const drafted = rs.filter((r) => r.pick !== null);
  const age = wmean(drafted.filter((r) => r.age !== undefined).map((r) => r.age!), drafted.filter((r) => r.age !== undefined).map((r) => r.minutes));
  const X = drafted.map((r) => [1, Math.log(r.pick!), ...(withAge ? [(r.age ?? age) - AGE0] : [])]);
  const [a, b, c = 0] = solve(X, drafted.map((r) => r.level), drafted.map((r) => r.minutes));
  const und = rs.filter((r) => r.pick === null);
  return { a, b, c, age, undrafted: wmean(und.map((r) => r.level), und.map((r) => r.minutes)) };
}
/** A rookie's predicted level: drafted ones on the curve, undrafted ones at replacement, or the undrafted mean when `fitted`. */
const onCurve = (cv: Curve, fitted = false) => (r: Pick<Rookie, "pick" | "age" | "season">) =>
  r.pick !== null ? cv.a + cv.b * Math.log(r.pick) + cv.c * ((r.age ?? cv.age) - AGE0) : fitted ? cv.undrafted : REPLACEMENT - before(r.season)!;
const v4Rule = (r: Pick<Rookie, "topThree" | "season">) => (r.topThree ? V4.topThree : REPLACEMENT - before(r.season)!);
/** Minutes-weighted RMSE and R² of a rule's levels on `rs`. */
function quality(rs: Rookie[], predict: (r: Rookie) => number) {
  const w = rs.map((r) => r.minutes), y = rs.map((r) => r.level), m = wmean(y, w);
  const sse = rs.reduce((s, r, i) => s + w[i] * (r.level - predict(r)) ** 2, 0), sst = rs.reduce((s, r, i) => s + w[i] * (r.level - m) ** 2, 0);
  const W = w.reduce((s, x) => s + x, 0);
  return { rmse: Math.sqrt(sse / W), r2: 1 - sse / sst };
}
const pickAge = fitCurve(inFit(FIT), true), pickOnly = fitCurve(inFit(FIT), false), earlyPickAge = fitCurve(inFit(EARLY_FIT), true);
const others = inFit(FIT).filter((r) => !r.topThree);
const othersLevel = wmean(others.map((o) => o.level), others.map((o) => o.minutes));
/** The shape the levels show: version 4's top three at +0.28, and every other rookie, drafted or not, at their mean. */
const twoStep = (r: Pick<Rookie, "topThree">) => (r.topThree ? V4.topThree : othersLevel);
const f2 = (x: number) => x.toFixed(2);
const s2 = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(2);
{
  say(`### The levels rookies played at\n\nFirst ${FIRST} minutes' Game Score per 36 less the previous season's minutes-weighted mean, pooled and minutes-weighted, 2016-17 to 2022-23.\n`);
  const fit = inFit(FIT);
  const group = (name: string, keep: (r: Rookie) => boolean) => {
    const rs = fit.filter(keep);
    return [name, rs.length, Math.round(rs.reduce((s, r) => s + r.minutes, 0)), s2(wmean(rs.map((r) => r.level), rs.map((r) => r.minutes))), rs.filter((r) => r.age !== undefined).length ? f2(wmean(rs.filter((r) => r.age !== undefined).map((r) => r.age!), rs.filter((r) => r.age !== undefined).map((r) => r.minutes))) : ""];
  };
  table(["Rookies", "Players", "Minutes", "Level", "Mean age"], [
    group("Top three, version 4's rule", (r) => r.topThree),
    group("Picks 1-3", (r) => r.pick !== null && r.pick <= 3),
    group("Picks 4-10", (r) => r.pick !== null && r.pick >= 4 && r.pick <= 10),
    group("Picks 11-30", (r) => r.pick !== null && r.pick >= 11 && r.pick <= 30),
    group("Picks 31-60", (r) => r.pick !== null && r.pick >= 31),
    group("Undrafted", (r) => r.pick === null),
    group("Every rookie", () => true),
  ]);
  const curveRow = (name: string, cv: Curve) => [name, f2(cv.a), f2(cv.b), cv.c ? f2(cv.c) : "", f2(cv.undrafted), ...[1, 3, 10, 30, 45, 60].map((p) => s2(cv.a + cv.b * Math.log(p) + cv.c * (cv.age - AGE0)))];
  say(`Each curve, minutes-weighted least squares over drafted rookies: level = a + b ln(pick) + c (age - ${AGE0}), age on February 1 of the rookie season. A drafted rookie without a birth date takes the fit's mean age. The levels at each pick are at the fit's mean age, ${f2(pickAge.age)}.\n`);
  table(["Curve", "a", "b", "c", "Undrafted mean", "Pick 1", "Pick 3", "Pick 10", "Pick 30", "Pick 45", "Pick 60"], [
    curveRow("Pick and age, 2016-17 to 2022-23", pickAge),
    curveRow("Pick alone, 2016-17 to 2022-23", pickOnly),
    curveRow("Pick and age, 2016-17 to 2019-20", earlyPickAge),
  ]);
  const qrow = (name: string, predict: (r: Rookie) => number) => {
    const a = quality(inFit(FIT), predict), b = quality(inFit(EXPLORATION), predict);
    return [name, f2(a.rmse), f2(a.r2), f2(b.rmse), f2(b.r2)];
  };
  say("How well each rule predicts the levels, minutes-weighted, every rookie. RMSE is per 36 minutes and includes each rookie's sampling noise over at most 500 minutes, so no rule gets near 0.\n");
  table(["Rule", "RMSE, 2016-17 to 2022-23", "R², 2016-17 to 2022-23", "RMSE, 2023-24 to 2025-26", "R², 2023-24 to 2025-26"], [
    qrow("Everyone at replacement (version 3)", (r) => REPLACEMENT - before(r.season)!),
    qrow("Version 4: top three at +0.28, the rest at replacement", v4Rule),
    qrow("Pick alone, undrafted at replacement", onCurve(pickOnly)),
    qrow("Pick and age, undrafted at replacement", onCurve(pickAge)),
    qrow("Pick and age, undrafted at their mean", onCurve(pickAge, true)),
    qrow(`Top three at +0.28, every other rookie at their mean, ${s2(twoStep({ topThree: false }))}`, twoStep),
  ]);
}

if (process.argv.includes("--fit")) { console.log(out.join("\n")); process.exit(0); }

// The backtest: version 4 as the site runs it, with each rule as its starting box rating.
const espn = new Map(files.flatMap((f) => (f.injuries === undefined ? [] : [[f.data.season, parseArchive(f.injuries, f.data.season)] as const])));
const reports = new Map<string, NbaArchive>(files.flatMap((f) => (f.nbaReports === undefined ? [] : [[f.data.season, parseNbaArchive(f.nbaReports, f.data.season)] as const])));
const previous = lineups(walked, V4.recent);
const v4Lineups: Map<string, Availability> = availability(walked, reports, (season) => reportLineups(walked.find((w) => w.data.season === season)!.data, previous.get(season)!.previous, espn.get(season)));
const isRookie = (a: Athlete, season: string) => rookies.get(season)?.has(a) ?? false;
/** Each rookie's own first-500-minute level, which no rule could know before he plays: the most a starting level could do. */
const own = new Map(all.map((r) => [r.athlete, r]));
/** boxRatings()'s `level` for a rule, for rookies in a season with one before it on file. */
const levelOf = (predict: (r: Pick<Rookie, "pick" | "age" | "season" | "topThree">) => number) => (a: Athlete, season: string) => {
  const mean = before(season);
  if (!isRookie(a, season) || mean === undefined) return undefined;
  const d = draft[a];
  return mean + predict({ season, pick: Array.isArray(d) ? d[2] : null, topThree: topPick(draft, a, season), age: ageOf(a, season) });
};
const halfLife = PARAMS.players.halfLife;
const ratings = {
  v4: boxRatings(walked, halfLife, topThreeStart(walked, rookies, draft)),
  pickAge: boxRatings(walked, halfLife, levelOf(onCurve(pickAge))),
  pickOnly: boxRatings(walked, halfLife, levelOf(onCurve(pickOnly))),
  pickAgeUndrafted: boxRatings(walked, halfLife, levelOf(onCurve(pickAge, true))),
  earlyPickAge: boxRatings(walked, halfLife, levelOf(onCurve(earlyPickAge))),
  twoStep: boxRatings(walked, halfLife, levelOf(twoStep)),
  oracle: boxRatings(walked, halfLife, (a, season) => { const r = own.get(a); return r?.season === season ? before(season)! + r.level : undefined; }),
};
function rows(r: ReadonlyMap<string, BoxRatings>): Row[] {
  return walked.flatMap(({ data, box }) => {
    const inp = site.get(data.season)!;
    const a = v4Lineups.get(data.season)!;
    const season: SeasonInputs = { centres: inp.centres, players: { box: box as SeasonBox, ratings: r.get(data.season)!, lineups: a.lineups, rookies: inp.players!.rookies }, extra: a.extra };
    return modelRows(data, seasonRule(inp), season);
  });
}
const fitted = (r: Row[], on: string[] = TUNING) => {
  const tun = r.filter((x) => on.includes(x.season));
  const sigma = fitSigma(tun);
  return price(r, sigma, fitWiden(tun, sigma));
};
const rowsOf = Object.fromEntries(Object.entries(ratings).map(([k, v]) => [k, rows(v)])) as Record<keyof typeof ratings, Row[]>;
const scored = Object.fromEntries(Object.entries(rowsOf).map(([k, v]) => [k, fitted(v)])) as Record<keyof typeof ratings, Scored[]>;

/** Games where either side gave rookies a fifth of its minutes or more, from the game's own box score. */
const rookieHeavy = new Set<string>();
for (const { data, box } of walked) for (const [id, sides] of Object.entries(box.games)) for (const lines of Object.values(sides)) {
  const total = (lines ?? []).reduce((s, l) => s + l[1], 0), rook = (lines ?? []).filter((l) => isRookie(l[0], data.season)).reduce((s, l) => s + l[1], 0);
  if (total && rook >= 0.2 * total) rookieHeavy.add(id);
}
const s4 = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(4);
const ci = (d: Diff) => `${s4(d.d)} [${s4(d.lo)}, ${s4(d.hi)}]`;
const verdict = (d: Diff) => (d.hi < 0 ? "better" : d.lo > 0 ? "worse" : "tie");
const splits: [string, (x: Scored) => boolean][] = [
  ["Tuning, 2015-16 to 2022-23", inSeasons(TUNING)],
  ["Exploration, 2023-24 to 2025-26", inSeasons(EXPLORATION)],
  ["Rookie-heavy, tuning", (x) => TUNING.includes(x.season) && rookieHeavy.has(x.id)],
  ["Rookie-heavy, exploration", (x) => EXPLORATION.includes(x.season) && rookieHeavy.has(x.id)],
  ["Each team's first 10 games, tuning", (x) => TUNING.includes(x.season) && x.k < 10],
  ["Each team's first 10 games, exploration", (x) => EXPLORATION.includes(x.season) && x.k < 10],
];
say("### Against version 4\n\nLog loss minus version 4's, with version 4's own SIGMA and early widening refitted the same way. Every rule has its own SIGMA and early widening fitted on the tuning seasons, version 4 included. The curves were fitted on 2016-17 to 2022-23's rookies, inside the tuning seasons. Rookie-heavy games are those where either side gave rookies a fifth of its minutes or more in the game's box score; first 10 games are those where either side had played fewer than 10.\n");
const backtest: [string, Scored[]][] = [
  ["Pick and age, undrafted at replacement", scored.pickAge],
  ["Pick alone, undrafted at replacement", scored.pickOnly],
  ["Pick and age, undrafted at their mean", scored.pickAgeUndrafted],
  ["Top three at +0.28, every other rookie at their mean", scored.twoStep],
  ["Ceiling: each rookie starts at the level he went on to play his first 500 minutes at", scored.oracle],
];
table(["Rule", "Games", "Version 4 log loss", "Minus version 4 [95%]", "Verdict"], backtest.flatMap(([name, s]) => splits.map(([split, keep]) => {
  const d = compare(s, scored.v4, keep);
  return [`${name}, ${split}`, d.n, d.b.toFixed(4), ci(d), verdict(d)];
})));
{
  say(`Out of sample: the pick and age curve fitted on 2016-17 to 2019-20's rookies, against version 4, both with SIGMA and early widening fitted on 2015-16 to 2019-20, scored on 2020-21 to 2025-26.\n`);
  const on = ["2015-16", ...EARLY_FIT];
  const a = fitted(rowsOf.earlyPickAge, on), b = fitted(rowsOf.v4, on);
  const later: [string, (x: Scored) => boolean][] = [
    ["2020-21 to 2025-26", inSeasons(LATER)],
    ["Rookie-heavy, 2020-21 to 2025-26", (x) => LATER.includes(x.season) && rookieHeavy.has(x.id)],
    ["First 10 games, 2020-21 to 2025-26", (x) => LATER.includes(x.season) && x.k < 10],
  ];
  table(["Games", "Count", "Version 4 log loss", "Minus version 4 [95%]", "Verdict"], later.map(([name, keep]) => { const d = compare(a, b, keep); return [name, d.n, d.b.toFixed(4), ci(d), verdict(d)]; }));
}

// 2026-27's rookies: their starting level and the value the site shows, under version 4 and the pick and age curve.
{
  const data = walked.find((w) => w.data.season === CURRENT)!.data;
  const inp = site.get(CURRENT)!;
  const scale = ELO_PER_SIGMA / PARAMS.sigma;
  const valuesWith = (r: BoxRatings) => fitModel(data, { ...inp, players: { ...inp.players!, ratings: r } }).at(-1)!.after.v;
  const v4 = valuesWith(ratings.v4.get(CURRENT)!), pa = valuesWith(ratings.pickAge.get(CURRENT)!), two = valuesWith(ratings.twoStep.get(CURRENT)!);
  const minutes = new Map<Athlete, { m: number; team: string }>();
  for (const [id, sides] of Object.entries(walked.find((w) => w.data.season === CURRENT)!.box.games)) for (const [team, lines] of Object.entries(sides)) for (const l of lines ?? []) {
    if (isRookie(l[0], CURRENT) && data.games.some((g) => g.id === id && g.final)) minutes.set(l[0], { m: (minutes.get(l[0])?.m ?? 0) + l[1], team });
  }
  const top = [...minutes].sort((x, y) => y[1].m - x[1].m).slice(0, 15);
  const mean = before(CURRENT)!;
  const lastDay = finalDays(data).at(-1)?.day;
  say(`### ${CURRENT}'s rookies\n\nThe 15 with the most minutes through ${lastDay}. Starting level is the box rating's start against 2025-26's mean of ${f2(mean)} per 36; value is what the site shows, Elo points per 48 minutes, from the latest fit with the site's SIGMA.\n`);
  const start = (rule: Parameters<typeof levelOf>[0], a: Athlete) => s2((levelOf(rule)(a, CURRENT) ?? REPLACEMENT) - mean);
  const value = (v: Map<Athlete, number>, a: Athlete) => Math.round((v.get(a) ?? 0) * scale);
  table(["Player", "Team", "Pick", "Age", "Minutes", "Start, version 4", "Start, pick and age", "Start, two-step", "Value, version 4", "Value, pick and age", "Value, two-step"], top.map(([a, { m, team }]) => {
    const d = draft[a];
    const age = ageOf(a, CURRENT);
    return [names[a] ?? String(a), team, Array.isArray(d) ? String(d[2]) : "undrafted", age === undefined ? "" : f2(age), Math.round(m), start(v4Rule, a), start(onCurve(pickAge), a), start(twoStep, a), value(v4, a), value(pa, a), value(two, a)];
  }));
}

console.log(out.join("\n"));
