// Scoring for the backtest and its guard test: every game's pre-game chance from a model, log loss, the
// weekly block bootstrap and the maximum-likelihood SIGMA. docs/model.md's pre-registration defines each.
import { readFileSync } from "node:fs";
import { EARLY, expected, fitSeason, phi, type FitRule, type Params, type SeasonData, type SeasonInputs } from "../src/lib/elo.ts";
import { parseBox, type SeasonBox } from "../src/lib/players.ts";
import { parsePreseason, type Preseason } from "../src/lib/preseason.ts";
import { eloChances } from "./elo538.ts";

export const TUNING = ["2015-16", "2016-17", "2017-18", "2018-19", "2019-20", "2020-21", "2021-22", "2022-23"];
export const HELD_OUT = ["2023-24", "2024-25", "2025-26"];
export const LOG_ONLY = ["2026-27"];

/** Version 1 as shipped at commit 3a88d0b, kept here so its backtest stays checkable after src/lib/elo.ts moves on. */
export const V1 = {
  params: { n0: 12, margin: { kind: "power", q: 0.5 }, home: { kind: "fixed", value: 0.622 }, sigma: 2.866 } satisfies Params,
  provisional: 26,
  early: { games: 5, widen: 1.55 },
};

/**
 * Version 2 as the site ran it until 2026-10-31, when it switched to version 3, kept here so version 2's backtest
 * and version 3's baseline stay checkable after src/lib/elo.ts moved on.
 */
export const V2 = {
  params: {
    n0: 96, margin: { kind: "power", q: 0.5 }, home: { kind: "fixed", value: 0.622 },
    seed: { scale: 5, fade: 120, carry: 0.7 }, b2b: 0.4, players: { a: 0.08, np: 320, halfLife: 365 },
    sigma: 2.997,
  } satisfies Params,
  provisional: 8,
  early: { games: 5, widen: 1.15 },
};

const read = (path: string): unknown => JSON.parse(readFileSync(new URL(`../src/data/${path}`, import.meta.url), "utf8"));
export const loadSeason = (id: string) => read(`games/${id}.json`) as SeasonData;
export const loadBox = (id: string): SeasonBox => parseBox(read(`box/${id}.json`), id);
export const loadPreseason = (data: SeasonData): Preseason => parsePreseason(read(`preseason/${data.season}.json`), data.season);

/**
 * One final game as a model saw it. `day` counts from the season's first game day; `e` is the model's
 * expected home margin before the game and `hind` the final fit's, both in the model's units; `k` is how many
 * games the less experienced side had played before it.
 */
export type Row = { id: string; season: string; day: number; y: 0 | 1; e: number; hind: number; k: number };
/** A row priced: `p` is the home side's chance and `ph` the final fit's. */
export type Scored = { id: string; season: string; day: number; y: 0 | 1; p: number; ph: number; k: number };

const dayIndex = (first: string) => (day: string) => Math.round((Date.parse(day) - Date.parse(first)) / 86_400_000);

export function modelRows(data: SeasonData, rule: FitRule, inputs: SeasonInputs = {}): Row[] {
  const days = fitSeason(data, rule, inputs);
  if (!days.length) return [];
  const last = days[days.length - 1].after;
  const index = dayIndex(days[0].day);
  const played: Record<string, number> = Object.fromEntries(Object.keys(data.teams).map((a) => [a, 0]));
  const rows: Row[] = [];
  for (const { day, games, before } of days) {
    for (const pg of games) {
      const g = pg.game;
      rows.push({ id: g.id, season: data.season, day: index(day), y: g.hs > g.as ? 1 : 0, e: expected(before, pg), hind: expected(last, pg), k: Math.min(played[g.home], played[g.away]) });
    }
    for (const { game: g } of games) { played[g.home]++; played[g.away]++; }
  }
  return rows;
}

/** Each row's chance: Phi(e / sigma), with sigma `widen` times wider while either side has played fewer than EARLY.games. */
export const price = (rows: Row[], sigma: number, widen = 1): Scored[] =>
  rows.map(({ e, hind, ...rest }) => ({ ...rest, p: phi(e / (sigma * (rest.k < EARLY.games ? widen : 1))), ph: phi(hind / sigma) }));

/** The baseline Elo's chances on the same games, in the same order as modelRows. */
export function eloScored(data: SeasonData, like: Row[]): Scored[] {
  const p = new Map(eloChances(data).map((x) => [x.id, x.p]));
  return like.map(({ id, season, day, y, k }) => ({ id, season, day, y, k, p: p.get(id)!, ph: NaN }));
}

const CLAMP = 1e-15;
export const loss = (p: number, y: 0 | 1) => -Math.log(Math.min(1 - CLAMP, Math.max(CLAMP, y ? p : 1 - p)));
export const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
export const logLoss = (s: Scored[]) => mean(s.map((x) => loss(x.p, x.y)));
export const brier = (s: Scored[]) => mean(s.map((x) => (x.p - x.y) ** 2));
export const accuracy = (s: Scored[]) => mean(s.map((x) => ((x.p >= 0.5) === (x.y === 1) ? 1 : 0)));

/** SIGMA by maximum likelihood: golden-section search on log SIGMA, where the log loss is unimodal. */
export const fitSigma = (rows: Row[]): number => scaleByLikelihood(rows, 1);

/** The early widening by maximum likelihood on the games where either side had played fewer than EARLY.games. */
export const fitWiden = (rows: Row[], sigma: number): number => scaleByLikelihood(rows.filter((r) => r.k < EARLY.games), sigma);

/** The s that minimises the log loss of Phi(e / (unit * s)) over `rows`. */
function scaleByLikelihood(rows: Row[], unit: number): number {
  const f = (ls: number) => {
    const s = unit * Math.exp(ls);
    let t = 0;
    for (const r of rows) t += loss(phi(r.e / s), r.y);
    return t;
  };
  let a = Math.log(0.01), b = Math.log(1000);
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
  for (let i = 0; i < 80; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return Math.exp((a + b) / 2);
}

export const BOOTSTRAP = { resamples: 2000, seed: 20261025 };

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

/** `blocks` is how many (season, week) blocks hold the games; with one, the interval has no width. */
export type Diff = { n: number; blocks: number; a: number; b: number; d: number; lo: number; hi: number };

/**
 * Model a against model b on the same games: each one's log loss, the mean per-game difference a - b, and
 * its 95% interval from resampling whole (season, week) blocks.
 */
export function compare(a: Scored[], b: Scored[], keep: (s: Scored) => boolean = () => true): Diff {
  const paired: Paired[] = [];
  a.forEach((x, i) => {
    const y = b[i];
    if (x.id !== y.id) throw new Error(`compare: game ${x.id} lines up with ${y.id}`);
    if (keep(x)) paired.push({ season: x.season, day: x.day, a: loss(x.p, x.y), b: loss(y.p, y.y) });
  });
  return blockBootstrap(paired);
}

/** One item two models are scored on: its season, its day counted from the season's first game day, and each model's loss. */
export type Paired = { season: string; day: number; a: number; b: number };

/** Each model's mean loss over `paired`, the mean difference a - b, and its 95% interval from resampling whole (season, week) blocks. */
export function blockBootstrap(paired: Paired[]): Diff {
  const blocks = new Map<string, { sum: number; n: number }>();
  let la = 0, lb = 0, n = 0;
  for (const { season, day, a: da, b: db } of paired) {
    la += da; lb += db; n++;
    const key = `${season}:${Math.floor(day / 7)}`;
    const blk = blocks.get(key) ?? { sum: 0, n: 0 };
    blk.sum += da - db; blk.n++;
    blocks.set(key, blk);
  }
  const list = [...blocks.values()];
  const rnd = mulberry32(BOOTSTRAP.seed);
  const means: number[] = [];
  for (let r = 0; r < BOOTSTRAP.resamples; r++) {
    let s = 0, c = 0;
    for (let i = 0; i < list.length; i++) {
      const blk = list[Math.floor(rnd() * list.length)];
      s += blk.sum; c += blk.n;
    }
    means.push(s / c);
  }
  means.sort((x, y) => x - y);
  return { n, blocks: list.length, a: la / n, b: lb / n, d: (la - lb) / n, lo: means[Math.floor(0.025 * BOOTSTRAP.resamples)], hi: means[Math.ceil(0.975 * BOOTSTRAP.resamples) - 1] };
}

/** Two-week windows, pooled across seasons: window w holds days 14w to 14w + 13 of every season. */
export function windows(a: Scored[], b: Scored[], keep: (s: Scored) => boolean): (Diff & { w: number })[] {
  const ws = [...new Set(a.filter(keep).map((x) => Math.floor(x.day / 14)))].sort((x, y) => x - y);
  return ws.map((w) => ({ w, ...compare(a, b, (x) => keep(x) && Math.floor(x.day / 14) === w) }));
}

/** Worse in a window: the interval of (model - baseline) lies wholly above 0. */
export const worse = (d: Diff) => d.lo > 0;

/**
 * The declared deviation from the plan (docs/model.md): a window whose games sit in one block has a
 * zero-width interval, which is no 95% interval, so it is not judged.
 */
export const worseJudged = (d: Diff) => worse(d) && d.blocks > 1;

/**
 * Version 2's declared deviation (docs/model-v2.md): a window of two blocks has an interval that runs from one
 * block's mean to the other's, no more a 95% interval than one block's, so only windows of three or more are judged.
 */
export const worseJudgedV2 = (d: Diff) => worse(d) && d.blocks > 2;

export const inSeasons = (ids: string[]) => (s: Scored) => ids.includes(s.season);
