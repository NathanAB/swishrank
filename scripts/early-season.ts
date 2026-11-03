// node scripts/early-season.ts: is version 4 weak at the start of a season, and would counting early games for more
// help? It prints its tables and rewrites them between the markers in docs/early-season.md. It diagnoses the site's model by the game number of the less
// experienced side, against Vegas on the same games; tests whether a team's early misses against the model keep going
// over its next games; then scores changes to the team seed's pull, each with its own SIGMA and early widening fitted on
// the tuning seasons, against the site's model. Investigation only: it changes nothing the site runs.
//
// The seed's pull is one number a day for all 30 teams inside src/lib/elo.ts fitSeason, so a pull per team needs a
// copy of that fit here (fitWith). The copy checks itself against fitSeason on every season before any variant runs.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  compute, counted, ELO_PER_SIGMA, finalDays, fitModel, phi, playerPart, pregameOf, secondNights, seasonRule, shownLineups, START,
  type Abbr, type Fit, type FitDay, type FitRule, type MarginRule, type ModelInputs, type Pregame, type SeasonData, type SeasonInputs,
} from "../src/lib/elo.ts";
import type { DraftFile } from "../src/lib/draft.ts";
import { modelInputs } from "../src/lib/inputs.ts";
import type { Athlete, SeasonBox } from "../src/lib/players.ts";
import { compare, fitSigma, HELD_OUT, inSeasons, loss, mean, modelRows, TUNING, type Diff, type Row, type Scored } from "./evaluate.ts";
import { loadVegas } from "./vegas.ts";

const t0 = performance.now();
const read = (path: string): unknown => {
  const url = new URL(`../src/data/${path}`, import.meta.url);
  return existsSync(url) ? JSON.parse(readFileSync(url, "utf8")) : undefined;
};
const ids = (read("seasons.json") as { id: string }[]).map((s) => s.id).sort();
const CURRENT = ids.at(-1)!;
const files = ids.map((id) => ({ data: read(`games/${id}.json`) as SeasonData, box: read(`box/${id}.json`), preseason: read(`preseason/${id}.json`), injuries: read(`injuries/${id}.json`), nbaReports: read(`nba-reports/${id}.json`) }));
const inputs = modelInputs(files, read("draft.json") as DraftFile);
const inputsOf = (season: string) => inputs.get(season)!;
const vegas: Record<string, number> = Object.assign({}, ...ids.map((id) => loadVegas(id).chances));

// ---- The fit, with a pull per team ----

/**
 * What a day's fit knows when it sets each team's pull toward its seed: days since the season's first game day, each
 * team's games played through the day, and each team's part before the day's games, all in the season's team order.
 */
type Day = { season: string; day: string; t: number; played: Float64Array; r: Float64Array };
/** Each team's pull toward its seed on a day, in games against an average team that ended level. */
type Strength = (d: Day) => Float64Array;
const uniform = (rule: FitRule): Strength => ({ t, played }) => new Float64Array(played.length).fill(rule.n0 * Math.exp(-t / rule.seed!.fade));

/** The teams and players a day's fit may move: those in the day's games. */
function dayFree(games: readonly Pregame[], box: SeasonBox) {
  const teams = new Set<Abbr>(), players = new Set<Athlete>();
  for (const { game: g } of games) {
    teams.add(g.home);
    teams.add(g.away);
    for (const lines of Object.values(box.games[g.id] ?? {})) for (const l of lines ?? []) players.add(l[0]);
  }
  return { teams, players };
}

/**
 * src/lib/elo.ts fitSeason for the site's rule (players, a fixed home edge, idle teams frozen), with each team's pull
 * from `strength` and, when `margin` is given, a margin rule by day. Its conjugate-gradient solver is fitSeason's.
 */
function fitWith(data: SeasonData, rule: FitRule, inputs: SeasonInputs, strength: Strength, margin?: (t: number) => MarginRule): FitDay[] {
  if (rule.home.kind !== "fixed" || !rule.players || !inputs.players || rule.idle !== "freeze") throw new Error("fitWith: the site's rule only");
  const abbrs = Object.keys(data.teams), n = abbrs.length;
  const { box, ratings, rookies } = inputs.players;
  const pr = rule.players, homeValue = rule.home.value;
  const days = finalDays(data);
  const first = days.length ? Date.parse(days[0].day) : 0;
  const pregame = pregameOf(rule, secondNights(data), inputs);
  const { athletes } = ratings;
  const dim = n + athletes.length;
  const col = new Map<string | Athlete, number>([...abbrs.map((a, i) => [a, i] as const), ...athletes.map((a, j) => [a, n + j] as const)]);
  const centre = new Float64Array(dim);
  const hold = Float64Array.from(athletes, (a) => (pr.rookieNp !== undefined && rookies?.has(a) ? pr.rookieNp : pr.np));
  const setPlayerCentres = (rating: Float64Array) => { for (let j = 0; j < athletes.length; j++) centre[n + j] = pr.a * rating[j]; };
  abbrs.forEach((a, i) => (centre[i] = inputs.centres?.[a] ?? 0));
  setPlayerCentres(ratings.start);
  const x = centre.slice();
  const offs = [0], idx: number[] = [], val: number[] = [];
  const D = new Float64Array(dim), diag = new Float64Array(dim), xty = new Float64Array(dim);
  const A = new Float64Array(dim), r = new Float64Array(dim), z = new Float64Array(dim), q = new Float64Array(dim), b = new Float64Array(dim);
  const on = new Uint8Array(dim);
  const matvec = (v: Float64Array, o: Float64Array) => {
    for (let i = 0; i < dim; i++) o[i] = D[i] * v[i];
    for (let g = 0; g + 1 < offs.length; g++) {
      let d = 0;
      for (let k = offs[g]; k < offs[g + 1]; k++) d += val[k] * v[idx[k]];
      for (let k = offs[g]; k < offs[g + 1]; k++) o[idx[k]] += d * val[k];
    }
  };
  const snapshot = (): Fit => ({ r: Object.fromEntries(abbrs.map((a, i) => [a, x[i]])), home: homeValue, v: new Map(athletes.map((a, j) => [a, x[n + j]])) });
  const add = ({ game: g, b2b }: Pregame, t: number) => {
    const cols = new Map<number, number>([[col.get(g.home)!, 1], [col.get(g.away)!, -1]]);
    const sides = box.games[g.id] ?? {};
    for (const [abbr, sign] of [[g.home, 1], [g.away, -1]] as const) {
      for (const l of sides[abbr] ?? []) { const c = col.get(l[0])!; cols.set(c, (cols.get(c) ?? 0) + (sign * l[1]) / 48); }
    }
    const y = counted(g.hs - g.as, margin ? margin(t) : rule.margin) - b2b - (g.neutral ? 0 : homeValue);
    for (const [c, v] of cols) { idx.push(c); val.push(v); diag[c] += v * v; xty[c] += v * y; }
    offs.push(idx.length);
  };
  const solve = (day: string, s: Float64Array, free: ReturnType<typeof dayFree>) => {
    setPlayerCentres(ratings.after.get(day)!);
    for (let k = 0; k < dim; k++) {
      D[k] = k < n ? s[k] : hold[k - n];
      b[k] = xty[k] + D[k] * centre[k];
      on[k] = k < n ? Number(free.teams.has(abbrs[k])) : Number(free.players.has(athletes[k - n]));
    }
    matvec(x, A);
    let rz = 0, bb = 0;
    for (let k = 0; k < dim; k++) { r[k] = on[k] ? b[k] - A[k] : 0; z[k] = r[k] / (diag[k] + D[k]); q[k] = z[k]; rz += r[k] * z[k]; if (on[k]) bb += b[k] * b[k]; }
    for (let it = 0; it < 2000; it++) {
      let rr = 0;
      for (let k = 0; k < dim; k++) rr += r[k] * r[k];
      if (rr <= 1e-24 * bb) break;
      matvec(q, A);
      let qa = 0;
      for (let k = 0; k < dim; k++) qa += q[k] * A[k];
      const alpha = rz / qa;
      let rz2 = 0;
      for (let k = 0; k < dim; k++) { x[k] += alpha * q[k]; r[k] = on[k] ? r[k] - alpha * A[k] : 0; z[k] = r[k] / (diag[k] + D[k]); rz2 += r[k] * z[k]; }
      const beta = rz2 / rz;
      rz = rz2;
      for (let k = 0; k < dim; k++) q[k] = z[k] + beta * q[k];
    }
    return snapshot();
  };
  const played = new Float64Array(n);
  let fit = snapshot();
  const out: FitDay[] = [];
  for (const { day, games } of days) {
    const t = Math.round((Date.parse(day) - first) / 86_400_000);
    const pre = games.map(pregame);
    for (const p of pre) { add(p, t); played[col.get(p.game.home)!]++; played[col.get(p.game.away)!]++; }
    const before = fit;
    fit = solve(day, strength({ season: data.season, day, t, played: played.slice(), r: x.slice(0, n) }), dayFree(pre, box));
    out.push({ day, games: pre, before, after: fit });
  }
  return out;
}

/** evaluate.ts modelRows for a fit already made. */
function rowsOf(data: SeasonData, days: FitDay[]): Row[] {
  if (!days.length) return [];
  const last = days[days.length - 1].after, first = Date.parse(days[0].day);
  const played: Record<string, number> = Object.fromEntries(Object.keys(data.teams).map((a) => [a, 0]));
  const rows: Row[] = [];
  for (const { day, games, before } of days) {
    for (const pg of games) {
      const g = pg.game;
      const e = (fit: Fit) => fit.r[g.home] - fit.r[g.away] + (g.neutral ? 0 : fit.home) + pg.b2b + playerPart(fit, pg.lineup.home) - playerPart(fit, pg.lineup.away);
      rows.push({ id: g.id, season: data.season, day: Math.round((Date.parse(day) - first) / 86_400_000), y: g.hs > g.as ? 1 : 0, e: e(before), hind: e(last), k: Math.min(played[g.home], played[g.away]) });
    }
    for (const { game: g } of games) { played[g.home]++; played[g.away]++; }
  }
  return rows;
}

// fitWith with the site's pull must give fitSeason's expected margins on every game of every season.
{
  let worst = 0, games = 0;
  for (const f of files) {
    const inp = inputsOf(f.data.season), rule = seasonRule(inp);
    const a = modelRows(f.data, rule, inp), b = rowsOf(f.data, fitWith(f.data, rule, inp, uniform(rule)));
    if (a.length !== b.length) throw new Error(`fitWith: ${f.data.season} has ${b.length} rows, fitSeason ${a.length}`);
    a.forEach((r, i) => { worst = Math.max(worst, Math.abs(r.e - b[i].e)); games++; });
  }
  if (worst > 1e-6) throw new Error(`fitWith departs from fitSeason by ${worst} margin units`);
  console.error(`fitWith matches fitSeason on ${games} games, largest difference ${worst.toExponential(1)} margin units`);
}

// ---- Variants and pricing ----

/** A change to the site's fit: its rule, its seed centres, each team's pull by day, or what a margin counts by day. */
type Variant = { rule?: (r: FitRule) => FitRule; centres?: (season: string) => Record<Abbr, number>; strength?: (rule: FitRule, season: string) => Strength; margin?: (t: number) => MarginRule };

/** A final game as a model priced it, with what the diagnosis reads beyond a Scored row. */
type Game = Scored & { home: Abbr; away: Abbr; m: number; e: number; z: number };
const sides = new Map(files.flatMap((f) => finalDays(f.data).flatMap(({ games }) => games.map((g) => [g.id, { home: g.home, away: g.away, m: counted(g.hs - g.as, seasonRule(inputsOf(f.data.season)).margin) }] as const))));

/** The early widening: a gap counts `widen(k)` times less when the less experienced side has played k games. */
type Widening = (k: number) => number;
/** The site's: `w` while either side has played fewer than 5. */
const step = (w: number): Widening => (k) => (k < 5 ? w : 1);

/** The scale by maximum likelihood: golden-section search on its log, as evaluate.ts fits SIGMA. */
function bestScale(f: (s: number) => number, lo = 0.01, hi = 1000) {
  let a = Math.log(lo), b = Math.log(hi);
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = f(Math.exp(c)), fd = f(Math.exp(d));
  for (let i = 0; i < 80; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(Math.exp(c)); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(Math.exp(d)); }
  }
  return Math.exp((a + b) / 2);
}
const lossAt = (rows: Row[], z: (r: Row) => number) => rows.reduce((t, r) => t + loss(phi(z(r)), r.y), 0);

/** Rows priced with SIGMA and the site's step widening fitted on the tuning seasons, as backtest-v4.ts fits them. */
function priced(rows: Row[], widening?: (sigma: number, tun: Row[]) => Widening) {
  const tun = rows.filter((r) => TUNING.includes(r.season));
  const sigma = fitSigma(tun);
  const widen = widening ? widening(sigma, tun) : step(bestScale((w) => lossAt(tun.filter((r) => r.k < 5), (r) => r.e / (sigma * w))));
  const games: Game[] = rows.map((r) => {
    const z = r.e / (sigma * widen(r.k));
    return { id: r.id, season: r.season, day: r.day, y: r.y, k: r.k, p: phi(z), ph: phi(r.hind / sigma), ...sides.get(r.id)!, e: r.e, z };
  });
  return { sigma, widen, games };
}

/** Each team's shown rating and rank after a season's last game day under a fit, as compute() shows it, at `sigma`. */
function shownAfter(data: SeasonData, inp: ModelInputs, days: FitDay[], sigma: number) {
  const last = days.at(-1)!;
  const lineups = shownLineups(data, inp.players!.rotation).after.get(last.day)!;
  const r = Object.fromEntries(Object.keys(data.teams).map((a) => [a, START + (last.after.r[a] + playerPart(last.after, lineups[a])) * (ELO_PER_SIGMA / sigma)]));
  const order = Object.keys(r).sort((a, b) => r[b] - r[a]);
  return { day: last.day, r, rank: (a: Abbr) => order.indexOf(a) + 1 };
}

/** A variant's rows on every season, priced, and the current season's shown ratings after its last game day. */
function run(v: Variant) {
  const rows: Row[] = [];
  let current: { data: SeasonData; inp: ModelInputs; days: FitDay[] } | undefined;
  for (const f of files) {
    const s = f.data.season, base = inputsOf(s);
    const inp: ModelInputs = v.centres ? { ...base, centres: v.centres(s) } : base;
    const rule = (v.rule ?? ((r) => r))(seasonRule(inp));
    const days = fitWith(f.data, rule, inp, v.strength ? v.strength(rule, s) : uniform(rule), v.margin);
    rows.push(...rowsOf(f.data, days));
    if (s === CURRENT) current = { data: f.data, inp, days };
  }
  const p = priced(rows);
  return { ...p, rows, today: shownAfter(current!.data, current!.inp, current!.days, p.sigma) };
}

const site = run({});
console.error(`site fitted ${((performance.now() - t0) / 1000).toFixed(1)} s: SIGMA ${site.sigma.toFixed(3)}, widening ${site.widen(0).toFixed(3)}`);

// ---- Formatting ----
const f3 = (x: number) => x.toFixed(3);
const f4 = (x: number) => x.toFixed(4);
const s4 = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(4);
const s3 = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(3);
const ci = (d: Diff) => `${s4(d.d)} [${s4(d.lo)}, ${s4(d.hi)}]`;
const verdict = (d: Diff) => (d.hi < 0 ? "better" : d.lo > 0 ? "worse" : "tie");
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
function table(head: string[], body: (string | number)[][]) {
  return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}
const out: string[] = [];
const section = (title: string, intro: string, body: string) => out.push(`### ${title}\n\n${intro}\n\n${body}`);

// ---- Diagnosis ----
const finished = (g: Scored) => TUNING.includes(g.season) || HELD_OUT.includes(g.season);
const SPLITS: [string, (g: Scored) => boolean][] = [["Tuning", inSeasons(TUNING)], ["Exploration", inSeasons(HELD_OUT)]];
/** Buckets of the less experienced side's game number: its games played before this one, plus 1. */
const BUCKETS: [string, number, number][] = [["1-5", 1, 5], ["6-10", 6, 10], ["11-20", 11, 20], ["21-40", 21, 40], ["41+", 41, Infinity]];
const inBucket = (lo: number, hi: number) => (g: Scored) => g.k + 1 >= lo && g.k + 1 <= hi;
const asVegas = (gs: Game[]): Game[] => gs.map((g) => ({ ...g, p: vegas[g.id] ?? 0.5 }));
const withLine = (g: Scored) => g.id in vegas;
/** Inverse of phi, by bisection. */
const probit = (p: number) => { let a = -8, b = 8; for (let i = 0; i < 60; i++) { const c = (a + b) / 2; if (phi(c) < p) a = c; else b = c; } return (a + b) / 2; };
/** The multiplier on z-scores that maximises their likelihood: below 1, the chances should have been more timid; above, bolder. */
const boldness = (zs: number[], ys: (0 | 1)[]) => bestScale((c) => zs.reduce((t, z, i) => t + loss(phi(c * z), ys[i]), 0), 0.2, 5);

const vg = asVegas(site.games);
section(
  "Table 1. Log loss by the less experienced side's game number, against Vegas",
  "Version 4 as the site runs it, with SIGMA and early widening fitted on the tuning seasons. A game falls in the bucket of the game number of the side that had played fewer games. Only games with a Vegas line. Boldness is the multiplier on each chance's z-score that would maximise its likelihood on those games: 1 is calibrated, below 1 the chances should have been more timid, above 1 bolder. Version 4's boldness on tuning games 1-5 is 1 by construction, since the early widening is fitted on those games.",
  table(
    ["Seasons", "Game number", "Games", "Vegas log loss", "Version 4 log loss", "Version 4 - Vegas [95%]", "Version 4 boldness", "Vegas boldness"],
    SPLITS.flatMap(([name, keep]) => BUCKETS.map(([b, lo, hi]) => {
      const k = (g: Scored) => keep(g) && inBucket(lo, hi)(g) && withLine(g);
      const d = compare(site.games, vg, k);
      const gs = site.games.filter(k);
      return [name, b, d.n, f4(d.b), f4(d.a), ci(d), f3(boldness(gs.map((g) => g.z), gs.map((g) => g.y))), f3(boldness(gs.map((g) => probit(vegas[g.id])), gs.map((g) => g.y)))];
    })),
  ),
);

const BINS: [number, number][] = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 1.01]];
function calibration(gs: Game[], chance: (g: Game) => number) {
  return BINS.map(([lo, hi]) => {
    const fav = gs.map((g) => { const p = chance(g); return p >= 0.5 ? { p, y: g.y } : { p: 1 - p, y: 1 - g.y }; }).filter((x) => x.p >= lo && x.p < hi);
    return fav.length ? `${pct(mean(fav.map((x) => x.p)))} / ${pct(mean(fav.map((x) => x.y)))} (${fav.length})` : "";
  });
}
section(
  "Table 2. Calibration by game number",
  "The favourite's mean chance / how often the favourite won (games), in bins of the favourite's chance, for version 4 and for Vegas on the same games. Tuning and exploration seasons pooled, games with a Vegas line.",
  table(
    ["Game number", "Source", "50-60%", "60-70%", "70-80%", "80%+"],
    ([["1-10", 1, 10], ["11-20", 11, 20], ["41+", 41, Infinity]] as const).flatMap(([b, lo, hi]) => {
      const gs = site.games.filter((g) => finished(g) && inBucket(lo, hi)(g) && withLine(g));
      return [[b, "Version 4", ...calibration(gs, (g) => g.p)], [b, "Vegas", ...calibration(gs, (g) => vegas[g.id])]];
    }),
  ),
);

/** One team's game: its miss in margin units against the model's expected margin, and its result less the model's chance and Vegas's. */
type TeamGame = { r: number; rp: number; rv: number | null };
function teamSeasons(gs: Game[]): TeamGame[][] {
  const by = new Map<string, TeamGame[]>();
  const push = (key: string, t: TeamGame) => by.set(key, [...(by.get(key) ?? []), t]);
  for (const g of [...gs].sort((x, y) => x.day - y.day)) {
    const v = vegas[g.id];
    push(`${g.season}:${g.home}`, { r: g.m - g.e, rp: g.y - g.p, rv: v === undefined ? null : g.y - v });
    push(`${g.season}:${g.away}`, { r: g.e - g.m, rp: g.p - g.y, rv: v === undefined ? null : v - g.y });
  }
  return [...by.values()];
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** The least-squares slope of y on x, with a 95% interval from resampling the points (team-seasons) 2000 times. */
function slope(pts: { x: number; y: number }[]) {
  const fit = (ps: { x: number; y: number }[]) => {
    const mx = mean(ps.map((p) => p.x)), my = mean(ps.map((p) => p.y));
    let sxy = 0, sxx = 0;
    for (const p of ps) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; }
    return sxy / sxx;
  };
  const rnd = mulberry32(20261102);
  const bs: number[] = [];
  for (let i = 0; i < 2000; i++) bs.push(fit(pts.map(() => pts[Math.floor(rnd() * pts.length)])));
  bs.sort((a, b) => a - b);
  return { b: fit(pts), lo: bs[49], hi: bs[1950] };
}
const sci = (s: { b: number; lo: number; hi: number }) => `${s3(s.b)} [${s3(s.lo)}, ${s3(s.hi)}]`;

/**
 * Whether a team's misses predict its next ones. A team-season's surprise is its mean miss in margin units over the
 * `window` games ending at its game `at`; against it, its result less the model's chance, and less Vegas's, per game
 * over its next `next` games. A slope above 0 means the model under-reacts: what it has not taken in keeps showing.
 */
function persistence(gs: Game[], at: number, window: number, next: number) {
  const pts = teamSeasons(gs).filter((t) => t.length >= at + next).map((t) => {
    const after = t.slice(at, at + next), lined = after.filter((g) => g.rv !== null);
    return { s: mean(t.slice(at - window, at).map((g) => g.r)), m: mean(after.map((g) => g.rp)), v: lined.length === next ? mean(lined.map((g) => g.rv!)) : null };
  });
  const both = pts.filter((p) => p.v !== null);
  const sd = Math.sqrt(mean(pts.map((p) => p.s ** 2)) - mean(pts.map((p) => p.s)) ** 2);
  const q = [...pts].sort((a, b) => a.s - b.s), fifth = Math.floor(q.length / 5);
  return {
    n: pts.length, sd, lined: both.length,
    model: slope(pts.map((p) => ({ x: p.s, y: p.m }))),
    modelLined: slope(both.map((p) => ({ x: p.s, y: p.m }))),
    vegas: slope(both.map((p) => ({ x: p.s, y: p.v! }))),
    top: mean(q.slice(-fifth).map((p) => p.m)), bottom: mean(q.slice(0, fifth).map((p) => p.m)),
  };
}

const CHECKS: [string, number, number, number][] = [
  ["Games 1-5, next 10", 5, 5, 10], ["Games 1-10, next 10", 10, 10, 10], ["Games 1-10, next 20", 10, 10, 20], ["Games 1-20, next 20", 20, 20, 20],
  ["Games 31-40, next 20 (control)", 40, 10, 20], ["Games 21-40, next 20 (control)", 40, 20, 20],
];
const persistenceRow = (name: string, gs: Game[], at: number, w: number, next: number) => {
  const p = persistence(gs.filter(finished), at, w, next);
  return [name, p.n, f3(p.sd), sci(p.model), s3(p.model.b * p.sd), s3(p.top), s3(p.bottom), p.lined, sci(p.modelLined), sci(p.vegas)];
};
const PERSIST_HEAD = ["Window", "Team-seasons", "Surprise SD", "Version 4 slope [95%]", "Version 4 per SD", "Hottest fifth", "Coldest fifth", "Team-seasons with lines", "Version 4 slope, same [95%]", "Vegas slope [95%]"];
section(
  "Table 3. Do a team's early misses keep going?",
  "Tuning and exploration seasons pooled. A team's surprise is its mean miss against version 4's expected margin, in margin units, over the games named. The slope is how its result less the model's chance, per game over the games after, moves per margin unit of surprise, with a 95% interval from resampling team-seasons; above 0, the model under-reacts. Per SD is the slope times the surprise's spread: the wins per game beyond the chances that a team one SD hotter than the model expected goes on to get. Hottest and coldest fifth are the mean result less the model's chance per game over the next games for the fifth of teams with the largest and smallest surprise. Vegas's slope is on the team-seasons whose next games all have a line, with version 4's on the same ones beside it.",
  table(PERSIST_HEAD, CHECKS.map(([name, at, w, next]) => persistenceRow(name, site.games, at, w, next))),
);

// The test must see a planted under-reaction and a planted over-reaction: a pull of 960 games that never fades, and one of 8.
const stiff = run({ rule: (r) => ({ ...r, n0: 960, seed: { ...r.seed!, fade: 1e9 } }) });
const loose = run({ rule: (r) => ({ ...r, n0: 8, seed: { ...r.seed!, fade: 1e9 } }) });
section(
  "Table 4. The test on planted mistakes",
  "Table 3's window of games 1-10 and the next 20, for the site's model and for two versions built to be wrong: one whose seed pulls with 960 games all season, which must under-react, and one with 8, which must over-react. Each has its own SIGMA and early widening.",
  table(["Model", ...PERSIST_HEAD.slice(1)], [
    persistenceRow("Version 4", site.games, 10, 10, 20),
    persistenceRow("Pull of 960 games, no fade", stiff.games, 10, 10, 20),
    persistenceRow("Pull of 8 games, no fade", loose.games, 10, 10, 20),
  ]),
);

// ---- Variants ----

/** Each team's share of its minutes so far this season played by players who played for it last season, after each game day. */
function continuity(season: string): Map<string, Float64Array> {
  const i = ids.indexOf(season);
  const out = new Map<string, Float64Array>();
  if (i === 0) return out;
  const prev = files[i - 1], cur = files[i];
  const prevBox = inputsOf(prev.data.season).players!.box, box = inputsOf(season).players!.box;
  const was = new Set<string>();
  for (const sides of Object.values(prevBox.games)) for (const [abbr, lines] of Object.entries(sides)) for (const l of lines ?? []) was.add(`${abbr}:${l[0]}`);
  const abbrs = Object.keys(cur.data.teams);
  const back = new Float64Array(abbrs.length), all = new Float64Array(abbrs.length);
  for (const { day, games } of finalDays(cur.data)) {
    for (const g of games) for (const [abbr, lines] of Object.entries(box.games[g.id] ?? {})) {
      const j = abbrs.indexOf(abbr);
      for (const l of lines ?? []) { all[j] += l[1]; if (was.has(`${abbr}:${l[0]}`)) back[j] += l[1]; }
    }
    out.set(day, Float64Array.from(abbrs, (_, j) => (all[j] > 0 ? back[j] / all[j] : NaN)));
  }
  return out;
}
const continuities = new Map(ids.map((id) => [id, continuity(id)]));

/** The site's pull, times (a team's continuity / the league's mean that day)^gamma: a weaker seed for a team that changed more. */
const byContinuity = (gamma: number): Variant["strength"] => (rule, season) => (d) => {
  const base = uniform(rule)(d), c = continuities.get(season)?.get(d.day);
  if (!c) return base;
  const known = [...c].filter((x) => !Number.isNaN(x)), m = mean(known);
  return base.map((s, j) => (Number.isNaN(c[j]) ? s : s * (c[j] / m) ** gamma));
};
/** A pull of n0 * exp(-games / fade) per team, by its own games played instead of the calendar. */
const byGames = (n0: number, fade: number): Variant["strength"] => () => (d) => d.played.map((g) => n0 * Math.exp(-g / fade));
/** The site's pull, cut for a team whose part has strayed from its seed: a heavier-tailed prior, one reweighting a day. */
const heavy = (delta: number): Variant["strength"] => (rule, season) => (d) => {
  const base = uniform(rule)(d), c = inputsOf(season).centres!, abbrs = Object.keys(files[ids.indexOf(season)].data.teams);
  return base.map((s, j) => s / (1 + ((d.r[j] - c[abbrs[j]]) / delta) ** 2));
};
/** Seed centres that blend in `w` of each team's team part at the end of the season before, re-centred. */
const lastParts = new Map(ids.map((id, i) => [id, i === 0 ? null : fitModel(files[i - 1].data, inputsOf(ids[i - 1])).at(-1)!.after.r]));
const blended = (w: number) => (season: string) => {
  const c = inputsOf(season).centres!, last = lastParts.get(season);
  if (!last) return c;
  const abbrs = Object.keys(c), raw = abbrs.map((a) => (1 - w) * c[a] + w * (last[a] ?? 0)), m = mean(raw);
  return Object.fromEntries(abbrs.map((a, i) => [a, raw[i] - m]));
};
/** n0 and fade in place of the site's 96 and 120 days. */
const pull = (n0: number, fade: number): Variant => ({ rule: (r) => ({ ...r, n0, seed: { ...r.seed!, fade } }) });

const EARLY10 = (g: Scored) => g.k <= 10, EARLY20 = (g: Scored) => g.k <= 20;
const SCORE_SPLITS: [string, (g: Scored) => boolean][] = [
  ["Tuning", inSeasons(TUNING)], ["Tuning, a side ≤ 10 games", (g) => TUNING.includes(g.season) && EARLY10(g)], ["Tuning, a side ≤ 20 games", (g) => TUNING.includes(g.season) && EARLY20(g)],
  ["Exploration", inSeasons(HELD_OUT)], ["Exploration, a side ≤ 10 games", (g) => HELD_OUT.includes(g.season) && EARLY10(g)], ["Exploration, a side ≤ 20 games", (g) => HELD_OUT.includes(g.season) && EARLY20(g)],
];
const tuningDiff = (gs: Game[]) => compare(gs, site.games, inSeasons(TUNING)).d;

/** Score each candidate on the tuning seasons alone; returns the best, by tuning log loss. */
function search(label: string, grid: [string, Variant][]) {
  const scored = grid.map(([name, v]) => { const r = run(v); return { name, r, d: tuningDiff(r.games) }; });
  scored.sort((a, b) => a.d - b.d);
  console.error(`${label}: ${scored.map((s) => `${s.name} ${s4(s.d)}`).join(", ")}`);
  return { label, grid: scored, best: scored[0] };
}

const grids = [
  search("Pull and fade", [24, 48, 64, 96, 144, 192, 288, 384].flatMap((n0) => [30, 45, 60, 120, 240, 1e9].map((fade) => [`n0 ${n0}, fade ${fade === 1e9 ? "none" : `${fade} days`}`, pull(n0, fade)] as [string, Variant]))),
  search("Fade by games played", [48, 96, 144].flatMap((n0) => [15, 30, 59, 120].map((fade) => [`n0 ${n0}, fade ${fade} games`, { strength: byGames(n0, fade) }] as [string, Variant]))),
  search("Pull by roster continuity", [0.5, 1, 2, 3].map((g) => [`gamma ${g}`, { strength: byContinuity(g) }] as [string, Variant])),
  search("Heavier-tailed seed", [0.25, 0.5, 1, 2].map((d) => [`delta ${d}`, { strength: heavy(d) }] as [string, Variant])),
  search("Last season's team part in the seed", [0.15, 0.3, 0.5].map((w) => [`w ${w}`, { centres: blended(w) }] as [string, Variant])),
  search("Early margins counted fuller", ([[14, 0.75], [14, 1], [28, 0.75], [28, 1]] as const).map(([days, q]) => [`q ${q} for ${days} days`, { margin: (t: number): MarginRule => ({ kind: "power", q: t < days ? q : 0.5 }) }] as [string, Variant])),
];

/** The smooth widening, 1 + c * exp(-k / kappa), with c fitted on the tuning seasons for each kappa; the fit is the site's. */
const smoothGrid = [1, 2, 4, 8, 16].map((kappa) => {
  const r = priced(site.rows, (sigma, tun) => {
    const c = bestScale((c1) => lossAt(tun, (r) => r.e / (sigma * (1 + (c1 - 1) * Math.exp(-r.k / kappa)))), 1, 10) - 1;
    return (k) => 1 + c * Math.exp(-k / kappa);
  });
  return { name: `kappa ${kappa}, c ${f3(r.widen(0) - 1)}`, r, d: tuningDiff(r.games) };
}).sort((a, b) => a.d - b.d);
console.error(`Smooth early widening: ${smoothGrid.map((s) => `${s.name} ${s4(s.d)}`).join(", ")}`);
const allSearches = [...grids, { label: "Smooth early widening", grid: smoothGrid, best: smoothGrid[0] }];

section(
  "Table 5. Each idea's grid on the tuning seasons",
  "Each setting has its own SIGMA and early widening, fitted on the tuning seasons, and is scored by its tuning log loss less version 4's. Best first.",
  table(["Idea", "Settings, best first, with tuning log loss less version 4's"], allSearches.map((s) => [s.label, s.grid.map((g) => `${g.name} ${s4(g.d)}`).join("; ")])),
);

section(
  "Table 6. Each idea's best tuning setting against version 4",
  "The setting each idea's grid chose on the tuning seasons, against version 4 on the same games, with SIGMA and early widening refitted. Only the tuning rows chose it; the exploration rows check whether it holds. Early rows are games where the side that had played fewer games had played 10 or fewer, or 20 or fewer, before it.",
  table(
    ["Idea", "Setting", "SIGMA", "Games", "Version 4 log loss", "Log loss", "Minus version 4 [95%]", "Verdict"],
    allSearches.flatMap((s) => SCORE_SPLITS.map(([name, keep], i) => {
      const d = compare(s.best.r.games, site.games, keep);
      return [i ? "" : s.label, i ? name : `${s.best.name}: ${name}`, i ? "" : f3(s.best.r.sigma), d.n, f4(d.b), f4(d.a), ci(d), verdict(d)];
    })),
  ),
);

const LOOSER: [string, Variant][] = [["n0 64, fade 120 days", pull(64, 120)], ["n0 48, fade 120 days", pull(48, 120)], ["n0 24, fade 120 days", pull(24, 120)], ["n0 48, fade 60 days", pull(48, 60)], ["n0 24, fade 30 days", pull(24, 30)]];
const looser = LOOSER.map(([name, v]) => ({ name, r: run(v) }));
section(
  "Table 7. Early games counted for more",
  "The owner's question taken directly: the seed's pull cut, so a team's first games move it further, each with its own SIGMA and early widening, against version 4. Version 4 pulls with 96 * exp(-day / 120) games: 85 after two weeks, 76 after four.",
  table(
    ["Pull", "SIGMA", "Seasons", "Games", "Version 4 log loss", "Log loss", "Minus version 4 [95%]", "Verdict"],
    looser.flatMap(({ name, r }) => SCORE_SPLITS.map(([split, keep], i) => {
      const d = compare(r.games, site.games, keep);
      return [i ? "" : name, i ? "" : f3(r.sigma), split, d.n, f4(d.b), f4(d.a), ci(d), verdict(d)];
    })),
  ),
);

const EARLY_SEASONS = [...TUNING, ...HELD_OUT];
section(
  "Table 7b. The looser pulls season by season",
  "Each looser pull of table 7 less version 4 in log loss on the games where a side had played 20 or fewer, season by season, with its 95% interval.",
  table(["Season", "Games", ...looser.slice(0, 3).map((l) => l.name)], EARLY_SEASONS.map((season) => {
    const keep = (g: Scored) => g.season === season && EARLY20(g);
    return [season, compare(site.games, site.games, keep).n, ...looser.slice(0, 3).map((l) => ci(compare(l.r.games, site.games, keep)))];
  })),
);

/** Version 4's chances before any early widening: Phi(e / SIGMA). */
const unwidened = site.rows.map((r) => r.e / site.sigma);
section(
  "Table 8. The widening each game number wants",
  "The widening, 1 / boldness, that maximises the likelihood of version 4's chances before any early widening on the games where the less experienced side had played k games before, on the tuning and the exploration seasons. Version 4 widens by 1.15 for k of 0 to 4 and by 1 after.",
  table(["k", "Tuning games", "Tuning widening wanted", "Exploration games", "Exploration widening wanted"], Array.from({ length: 10 }, (_, k) => {
    const wanted = (seasons: string[]) => {
      const at = site.rows.flatMap((r, i) => (seasons.includes(r.season) && r.k === k ? [i] : []));
      return [at.length, f3(1 / boldness(at.map((i) => unwidened[i]), at.map((i) => site.rows[i].y)))];
    };
    return [k, ...wanted(TUNING), ...wanted(HELD_OUT)];
  })),
);

// ---- MEM today ----

const live = compute(files.find((f) => f.data.season === CURRENT)!.data, inputsOf(CURRENT));
const mine = site.today;
if (Math.abs(mine.r.MEM - live.r.MEM) > 0.5) throw new Error(`MEM today: ${mine.r.MEM} here, ${live.r.MEM} on the site`);
const TODAY: [string, typeof mine][] = [
  ["Version 4", mine],
  ...grids.map((s) => [`${s.label}: ${s.best.name}`, s.best.r.today] as [string, typeof mine]),
  ...looser.map(({ name, r }) => [`Looser pull: ${name}`, r.today] as [string, typeof mine]),
];
section(
  `Table 9. MEM after ${mine.day}`,
  "MEM's shown rating and rank among the 30 teams under each idea's best tuning setting and each looser pull of table 7, as compute() shows a rating: the team part plus the player part of its rotation, on the Elo scale at the model's own SIGMA. The early widening changes chances, not ratings, so it has no row.",
  table(["Model", "MEM rating", "MEM rank", "Top team", "Top rating"], TODAY.map(([name, t]) => {
    const top = Object.keys(t.r).sort((a, b) => t.r[b] - t.r[a])[0];
    return [name, t.r.MEM.toFixed(0), t.rank("MEM"), top, t.r[top].toFixed(0)];
  })),
);

const memGames = site.games.filter((g) => g.season === CURRENT && (g.home === "MEM" || g.away === "MEM"));
const loosest = looser.at(-1)!;
section(
  "Table 10. MEM's games, version 4 against Vegas",
  `MEM's chance in each of its ${CURRENT} games before tip-off: version 4's, the loosest pull's of table 7 (${loosest.name}), and Vegas's. The market is a reference: if it had moved on MEM faster than the model, its chances would run above version 4's as the games went on.`,
  table(["Game", "Version 4", `Pull ${loosest.name}`, "Vegas", "MEM margin"], memGames.map((g) => {
    const mem = (p: number) => pct(g.home === "MEM" ? p : 1 - p);
    const lp = loosest.r.games.find((x) => x.id === g.id)!.p;
    const row = files.find((f) => f.data.season === CURRENT)!.data.games.find((x) => x.id === g.id)!;
    return [`${row.t.slice(0, 10)} ${g.away} at ${g.home}`, mem(g.p), mem(lp), g.id in vegas ? mem(vegas[g.id]) : "", (g.home === "MEM" ? 1 : -1) * (row.hs! - row.as!)];
  })),
);

const body = out.join("\n\n");
console.log(body);
const DOC = new URL("../docs/early-season.md", import.meta.url);
if (existsSync(DOC)) {
  const doc = readFileSync(DOC, "utf8"), START_MARK = "<!-- tables:start -->", END_MARK = "<!-- tables:end -->";
  const a = doc.indexOf(START_MARK), b = doc.indexOf(END_MARK);
  if (a >= 0 && b > a) writeFileSync(DOC, `${doc.slice(0, a + START_MARK.length)}\n${body}\n${doc.slice(b)}`);
}
console.error(`early-season: ${((performance.now() - t0) / 1000).toFixed(1)} s`);
