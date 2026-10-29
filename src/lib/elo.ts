// Elo-style ratings for NBA teams, worked out like SRS or Massey ratings: after every game day the season's
// ratings are fitted again, by least squares, to the margins of every game so far, each team pulled toward a
// preseason seed from sportsbooks' win totals and each player toward his box-score rating. 1000 is the league
// average. docs/model.md and docs/model-v2.md hold the backtests behind every setting.
import type { Athlete, BoxRatings, Lineup, Lineups, SeasonBox, SeasonRotations, Sides } from "./players.ts";

export const START = 1000;
export const TZ = "America/New_York";

export type Abbr = string;
/** `color` and `alternateColor` are ESPN's team colours, as six hex digits without the "#". */
export type Team = { name: string; short: string; color: string; alternateColor: string };
export type Game = {
  id: string;
  t: string;
  home: Abbr;
  away: Abbr;
  hs: number | null;
  as: number | null;
  final: boolean;
  neutral: boolean;
  note: string | null;
};
export type SeasonData = { season: string; teams: Record<Abbr, Team>; games: Game[] };
export type FinalGame = Game & { hs: number; as: number };

/** How much a final margin counts in the fit: as it is, capped, or as (|margin| + 3)^q. */
export type MarginRule = { kind: "raw" } | { kind: "cap"; at: number } | { kind: "power"; q: number };
/** The home edge: fitted from the season's games and pulled toward `centre` with `weight` games, or fixed. */
export type HomeRule = { kind: "fitted"; centre: number; weight: number } | { kind: "fixed"; value: number };
/**
 * Version 2's team seeds: a team's prior centre is `scale * (wins / games - 0.5)` from its preseason win total,
 * or `carry` times its final rating of the season before when a season has no totals, and the pull toward it
 * fades as n0 * exp(-day / fade).
 */
export type SeedRule = { scale: number; fade: number; carry: number };
/** Version 2's players: each one's value is pulled toward `a` times his box rating with `np` games. */
export type PlayerRule = { a: number; np: number; halfLife: number };
/**
 * `n0` is the pull toward each team's prior centre, in games against an average team that ended level. Version 1
 * is the rule without `seed`, `b2b` or `players`: every centre at 0, the league average, and a pull that stays.
 * `b2b` is what a team on the second night of a back-to-back gives up, in margin units.
 */
export type FitRule = { n0: number; margin: MarginRule; home: HomeRule; seed?: SeedRule; b2b?: number; players?: PlayerRule };
/** `sigma` turns an expected margin into a win chance: Phi(margin / sigma). */
export type Params = FitRule & { sigma: number };

/** The site's model, version 2, chosen by the pre-registered backtest: docs/model-v2.md, tables 1 and 2. */
export const PARAMS = {
  n0: 96, margin: { kind: "power", q: 0.5 }, home: { kind: "fixed", value: 0.622 },
  seed: { scale: 5, fade: 120, carry: 0.7 }, b2b: 0.4, players: { a: 0.08, np: 320, halfLife: 365 },
  sigma: 2.997,
} satisfies Params;

/** Games a team plays before its rating stops being provisional: docs/model-v2.md, table 9. */
export const PROVISIONAL = 8;

/** What a final margin, home minus away, counts for in the fit. */
export function counted(margin: number, rule: MarginRule): number {
  const m = Math.abs(margin);
  const v = rule.kind === "raw" ? m : rule.kind === "cap" ? Math.min(m, rule.at) : (m + 3) ** rule.q;
  return Math.sign(margin) * v;
}

/** One fit: each team's rating, the home edge and each player's value, in the margin rule's units. */
export type Fit = { r: Record<Abbr, number>; home: number; v: ReadonlyMap<Athlete, number> };
/** A final game as its prediction saw it: the back-to-back term, in margin units, and each side's lineup. */
export type Pregame = { game: FinalGame; b2b: number; lineup: Sides<Lineup> };
/** A game day: its games, the fit they were predicted from, and the fit after them. */
export type FitDay = { day: string; games: Pregame[]; before: Fit; after: Fit };
/** What a season's fit reads beyond its games: each team's prior centre, and its players' lines, ratings and lineups. */
export type SeasonInputs = {
  centres?: Record<Abbr, number>;
  players?: { box: SeasonBox; ratings: BoxRatings; lineups: ReadonlyMap<string, Sides<Lineup>> };
};

/** A season's final, scored games grouped by US Eastern day, in date order. */
export function finalDays(data: SeasonData): { day: string; games: FinalGame[] }[] {
  const byDay = new Map<string, FinalGame[]>();
  for (const g of data.games) {
    if (!g.final || g.hs === null || g.as === null) continue;
    const day = dayKey(g.t);
    byDay.set(day, [...(byDay.get(day) ?? []), { ...g, hs: g.hs, as: g.as }]);
  }
  return [...byDay].sort(([x], [y]) => x.localeCompare(y)).map(([day, games]) => ({ day, games }));
}

/** For every game, played or to come, whether each side played on the US Eastern day before. */
export function secondNights(data: SeasonData): Map<string, Sides<boolean>> {
  const last = new Map<Abbr, string>();
  const out = new Map<string, Sides<boolean>>();
  for (const g of [...data.games].sort((x, y) => x.t.localeCompare(y.t) || x.id.localeCompare(y.id))) {
    const day = dayKey(g.t);
    const yesterday = addDays(day, -1);
    out.set(g.id, { home: last.get(g.home) === yesterday, away: last.get(g.away) === yesterday });
    last.set(g.home, day);
    last.set(g.away, day);
  }
  return out;
}

/** The back-to-back term of a game's expected home margin: the home side gains when only its rival is on a second night. */
export const b2bTerm = (rule: FitRule, second: Sides<boolean>) => (rule.b2b ? rule.b2b * (Number(second.away) - Number(second.home)) : 0);

/** A lineup's part of its team's expected margin. */
export const playerPart = (fit: Fit, lineup: Lineup) => lineup.reduce((s, p) => s + p.share * (fit.v.get(p.athlete) ?? 0), 0);

/** A game's expected home margin under `fit`. */
export const expected = (fit: Fit, { game, b2b, lineup }: Pregame) =>
  fit.r[game.home] - fit.r[game.away] + (game.neutral ? 0 : fit.home) + b2b + playerPart(fit, lineup.home) - playerPart(fit, lineup.away);

/**
 * Team prior centres, shifted to sum to 0: from each team's preseason win total set for `games` games, or, for a
 * team without one, `carry` times its `last` fitted team part of the season before, and 0 for a team new to the league.
 */
export function seedCentres(rule: SeedRule, abbrs: Abbr[], from: { preseason: { totals: Record<Abbr, number>; games: number } | null; last: Record<Abbr, number> }): Record<Abbr, number> {
  const { preseason, last } = from;
  const raw = abbrs.map((a) => (preseason && a in preseason.totals ? rule.scale * (preseason.totals[a] / preseason.games - 0.5) : rule.carry * (last[a] ?? 0)));
  const mean = raw.length ? raw.reduce((s, x) => s + x, 0) / raw.length : 0;
  return Object.fromEntries(abbrs.map((a, i) => [a, raw[i] - mean]));
}

function solveCholesky(M: number[][], v: number[]): number[] {
  const n = v.length;
  const L = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let j = 0; j < n; j++) {
    let d = M[j][j];
    for (let k = 0; k < j; k++) d -= L[j][k] ** 2;
    L[j][j] = Math.sqrt(d);
    for (let i = j + 1; i < n; i++) {
      let s = M[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = s / L[j][j];
    }
  }
  const y = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let s = v[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  const x = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

const NO_PLAYERS: ReadonlyMap<Athlete, number> = new Map();
const startFit = (abbrs: Abbr[], rule: FitRule, centres?: Record<Abbr, number>): Fit => ({
  r: Object.fromEntries(abbrs.map((a) => [a, centres?.[a] ?? 0])),
  home: rule.home.kind === "fixed" ? rule.home.value : rule.home.centre,
  v: NO_PLAYERS,
});
const NO_LINEUP: Sides<Lineup> = { home: [], away: [] };

/**
 * The season fitted after every game day. Each fit minimises the squared misses on every final game so far,
 * sum (counted(margin) - b2b - (r_home - r_away + home + player parts))^2, plus strength * (r - centre)^2 for
 * every team, np * (v - a * box rating)^2 for every player and, for a fitted home edge, weight * (home - centre)^2.
 * A player who played counts with share minutes / 48. Before the first game every team sits at its centre.
 */
export function fitSeason(data: SeasonData, rule: FitRule, inputs: SeasonInputs = {}): FitDay[] {
  const abbrs = Object.keys(data.teams);
  const { centres } = inputs;
  const players = rule.players && inputs.players ? { rule: rule.players, ...inputs.players } : null;
  const second = secondNights(data);
  const days = finalDays(data);
  const first = days.length ? Date.parse(days[0].day) : 0;
  const strength = (day: string) => (rule.seed ? rule.n0 * Math.exp(-Math.round((Date.parse(day) - first) / 86_400_000) / rule.seed.fade) : rule.n0);
  const pregame = (game: FinalGame): Pregame => ({ game, b2b: b2bTerm(rule, second.get(game.id)!), lineup: players?.lineups.get(game.id) ?? NO_LINEUP });
  const solver = players ? playerSolver(abbrs, rule, centres, players) : teamSolver(abbrs, rule, centres);
  let fit = solver.start;
  const out: FitDay[] = [];
  for (const { day, games } of days) {
    const pre = games.map(pregame);
    for (const p of pre) solver.add(p);
    const before = fit;
    fit = solver.fit(day, strength(day));
    out.push({ day, games: pre, before, after: fit });
  }
  return out;
}

type Solver = { start: Fit; add: (p: Pregame) => void; fit: (day: string, strength: number) => Fit };

/** Teams only: the normal equations are 30 or 31 wide, so they are solved exactly each day. */
function teamSolver(abbrs: Abbr[], rule: FitRule, centres: Record<Abbr, number> | undefined): Solver {
  const n = abbrs.length;
  const at = new Map(abbrs.map((a, i) => [a, i]));
  const xx = Array.from({ length: n + 1 }, () => new Array<number>(n + 1).fill(0));
  const xy = new Array<number>(n + 1).fill(0);
  const home = rule.home;
  return {
    start: startFit(abbrs, rule, centres),
    add({ game: g, b2b }) {
      const idx: [number, number][] = [[at.get(g.home)!, 1], [at.get(g.away)!, -1]];
      if (!g.neutral) idx.push([n, 1]);
      const y = counted(g.hs - g.as, rule.margin) - b2b;
      for (const [i, xi] of idx) {
        xy[i] += xi * y;
        for (const [j, xj] of idx) xx[i][j] += xi * xj;
      }
    },
    fit(_day, strength) {
      const size = home.kind === "fixed" ? n : n + 1;
      const M = xx.slice(0, size).map((row) => row.slice(0, size));
      const v = xy.slice(0, size);
      for (let i = 0; i < n; i++) M[i][i] += strength;
      if (centres) for (let i = 0; i < n; i++) v[i] += strength * centres[abbrs[i]];
      if (home.kind === "fixed") for (let i = 0; i < n; i++) v[i] -= xx[i][n] * home.value;
      else {
        M[n][n] += home.weight;
        v[n] += home.weight * home.centre;
      }
      const x = solveCholesky(M, v);
      return { r: Object.fromEntries(abbrs.map((a, i) => [a, x[i]])), home: home.kind === "fixed" ? home.value : x[n], v: NO_PLAYERS };
    },
  };
}

/**
 * Teams and players together, several hundred columns wide: conjugate gradients with a diagonal preconditioner,
 * started from the day before's answer, to a relative residual of 1e-12.
 */
function playerSolver(abbrs: Abbr[], rule: FitRule, centres: Record<Abbr, number> | undefined, players: NonNullable<SeasonInputs["players"]> & { rule: PlayerRule }): Solver {
  const n = abbrs.length;
  const home = rule.home;
  const fitted = home.kind === "fitted";
  const p0 = fitted ? n + 1 : n;
  const { athletes } = players.ratings;
  const dim = p0 + athletes.length;
  const col = new Map<string | Athlete, number>([...abbrs.map((a, i) => [a, i] as const), ...athletes.map((a, j) => [a, p0 + j] as const)]);
  const centre = new Float64Array(dim);
  const setPlayerCentres = (rating: Float64Array) => { for (let j = 0; j < athletes.length; j++) centre[p0 + j] = players.rule.a * rating[j]; };
  abbrs.forEach((a, i) => (centre[i] = centres?.[a] ?? 0));
  if (fitted) centre[n] = home.centre;
  setPlayerCentres(players.ratings.start);
  const x = centre.slice();
  const offs = [0], idx: number[] = [], val: number[] = [];
  const D = new Float64Array(dim), diag = new Float64Array(dim), xty = new Float64Array(dim);
  const A = new Float64Array(dim), r = new Float64Array(dim), z = new Float64Array(dim), q = new Float64Array(dim), b = new Float64Array(dim);
  const matvec = (v: Float64Array, out: Float64Array) => {
    for (let i = 0; i < dim; i++) out[i] = D[i] * v[i];
    for (let g = 0; g + 1 < offs.length; g++) {
      let d = 0;
      for (let k = offs[g]; k < offs[g + 1]; k++) d += val[k] * v[idx[k]];
      for (let k = offs[g]; k < offs[g + 1]; k++) out[idx[k]] += d * val[k];
    }
  };
  const snapshot = (): Fit => ({
    r: Object.fromEntries(abbrs.map((a, i) => [a, x[i]])),
    home: fitted ? x[n] : home.value,
    v: new Map(athletes.map((a, j) => [a, x[p0 + j]])),
  });
  return {
    start: snapshot(),
    add({ game: g, b2b }) {
      const cols = new Map<number, number>([[col.get(g.home)!, 1], [col.get(g.away)!, -1]]);
      if (fitted && !g.neutral) cols.set(n, 1);
      const sides = players.box.games[g.id] ?? {};
      for (const [abbr, sign] of [[g.home, 1], [g.away, -1]] as const) {
        for (const l of sides[abbr] ?? []) { const c = col.get(l[0])!; cols.set(c, (cols.get(c) ?? 0) + (sign * l[1]) / 48); }
      }
      const y = counted(g.hs - g.as, rule.margin) - b2b - (fitted || g.neutral ? 0 : home.value);
      for (const [c, v] of cols) { idx.push(c); val.push(v); diag[c] += v * v; xty[c] += v * y; }
      offs.push(idx.length);
    },
    fit(day, strength) {
      setPlayerCentres(players.ratings.after.get(day)!);
      for (let k = 0; k < dim; k++) {
        D[k] = k < n ? strength : k < p0 && fitted ? home.weight : players.rule.np;
        b[k] = xty[k] + D[k] * centre[k];
      }
      matvec(x, A);
      let rz = 0, bb = 0;
      for (let k = 0; k < dim; k++) { r[k] = b[k] - A[k]; z[k] = r[k] / (diag[k] + D[k]); q[k] = z[k]; rz += r[k] * z[k]; bb += b[k] * b[k]; }
      for (let it = 0; it < 2000; it++) {
        let rr = 0;
        for (let k = 0; k < dim; k++) rr += r[k] * r[k];
        if (rr <= 1e-24 * bb) break;
        matvec(q, A);
        let qa = 0;
        for (let k = 0; k < dim; k++) qa += q[k] * A[k];
        const alpha = rz / qa;
        let rz2 = 0;
        for (let k = 0; k < dim; k++) { x[k] += alpha * q[k]; r[k] -= alpha * A[k]; z[k] = r[k] / (diag[k] + D[k]); rz2 += r[k] * z[k]; }
        const beta = rz2 / rz;
        rz = rz2;
        for (let k = 0; k < dim; k++) q[k] = z[k] + beta * q[k];
      }
      return snapshot();
    },
  };
}

/**
 * The standard normal distribution function, from Numerical Recipes' erfc (fractional error under 1.2e-7).
 * It returns exactly 0.5 at 0, where the approximation is 3e-8 off, so level teams on neutral ground are even.
 */
export function phi(z: number): number {
  if (z === 0) return 0.5;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.5 * x);
  const erfc = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return z >= 0 ? 1 - erfc / 2 : erfc / 2;
}

/**
 * Elo points per sigma of expected margin. Phi(z) is within 0.0095 of the logistic 1 / (1 + e^(-1.702 z)), so
 * at this scale the model's chance for a rating gap is within a point of classic Elo's 1 / (1 + 10^(-gap / 400)):
 * 100 points makes a 63% favourite, where classic Elo says 64%. docs/model.md, table 9.
 */
export const ELO_PER_SIGMA = (400 / Math.LN10) * 1.702;

/**
 * A season's first games say little, and the model's chances for them run high. While either side has played
 * fewer than `games` games, a gap counts `widen` times less, fitted on the tuning seasons: docs/model-v2.md, table 2.
 */
export const EARLY = { games: 5, widen: 1.15 };

/** The model's win chance for a rating gap in Elo points, when the less experienced side has `played` games. */
export const winProb = (gap: number, played = Infinity) => phi(gap / (ELO_PER_SIGMA * (played < EARLY.games ? EARLY.widen : 1)));

/** The fewest games either side of `game` had played, by `log`. */
export const played = (log: Record<Abbr, readonly unknown[]>, game: Game) => Math.min(log[game.home].length, log[game.away].length);

/** Home-court-adjusted rating gap, home minus away, with `home` the home edge in Elo points. */
export const gap = (game: Game, r: Record<Abbr, number>, home: number) => r[game.home] + (game.neutral ? 0 : home) - r[game.away];

type Pair = { h: number; a: number };
/**
 * One final game: the home side's pre-game chance; each side's rating before and after it, whose difference is
 * what the game did; and `shown`, each side's rating on the chart at the end of the game's day.
 */
export type Result = { game: Game; day: string; p: number; pre: Pair; post: Pair; shown: Pair };
export type Snapshot = { day: string; r: Record<Abbr, number> };
export type TeamGame = { result: Result; side: "h" | "a" };
/** `hi` and `lo` are the team's highest and lowest rating on any day of the season, its seed included. */
export type TeamStats = { hi: number; lo: number };

export type Season = {
  data: SeasonData;
  abbrs: Abbr[];
  /** Each team's shown rating today. */
  r: Record<Abbr, number>;
  /**
   * Each team's rating as the chances of games to come read it, in Elo points: its team part plus the player part of
   * the lineup it takes into its next game. Only a gap between two of them means anything.
   */
  pricing: Record<Abbr, number>;
  /** The home edge the latest fit measured, in Elo points. */
  home: number;
  rank: Record<Abbr, number>;
  results: Result[];
  log: Record<Abbr, TeamGame[]>;
  series: Snapshot[];
  stats: Record<Abbr, TeamStats>;
  order: Abbr[];
  upcoming: Game[];
  /** What the back-to-back adds to each game's home edge, in Elo points: the chances use it, the ratings never do. */
  b2b: Record<string, number>;
};

/**
 * What compute() reads beyond a season's games: each team's seed, and its players' lines, box ratings, the lineups
 * its games are predicted with and the rotation its shown rating counts.
 */
export type ModelInputs = { centres?: Record<Abbr, number>; players?: { box: SeasonBox; ratings: BoxRatings; lineups: Lineups; rotation: SeasonRotations } };

/** The site's model fitted to a season: each game predicted with the lineup of the team's previous game. */
export const fitModel = (data: SeasonData, { centres, players }: ModelInputs): FitDay[] =>
  fitSeason(data, PARAMS, { centres, players: players && { ...players, lineups: players.lineups.previous } });

/** Standard competition ranks on displayed (rounded) ratings: equal ratings share a rank, the next rank skips. */
export function ranksOf(ratings: Record<Abbr, number>) {
  const vals = Object.entries(ratings).map(([a, v]) => [a, Math.round(v)] as const);
  return Object.fromEntries(vals.map(([a, v]) => [a, 1 + vals.filter(([, w]) => w > v).length]));
}

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
/** The US Eastern calendar day a game belongs to, as YYYY-MM-DD. */
export const dayKey = (iso: string) => dayFmt.format(new Date(iso));
export const addDays = (key: string, n: number) => new Date(Date.parse(key + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

/** The lineup each team's shown rating counts on opening night, and after each game day. */
export type ShownLineups = { opening: Record<Abbr, Lineup>; after: Map<string, Record<Abbr, Lineup>> };

/**
 * The lineup each team's shown rating counts: on opening night the rotation of its first game, when that game
 * has one, and after each game day the latest rotation it has had.
 */
export function shownLineups(data: SeasonData, rotation: SeasonRotations | undefined): ShownLineups {
  const days = finalDays(data);
  const first = new Map<Abbr, string>();
  for (const { day, games } of days) for (const g of games) for (const abbr of [g.home, g.away]) if (!first.has(abbr)) first.set(abbr, day);
  const opening: Record<Abbr, Lineup> = Object.fromEntries(Object.keys(data.teams).map((abbr) => [abbr, rotation?.get(first.get(abbr) ?? "")?.[abbr] ?? []]));
  const after = new Map<string, Record<Abbr, Lineup>>();
  let usual = opening;
  for (const { day } of days) after.set(day, (usual = Object.assign({}, usual, rotation?.get(day))));
  return { opening, after };
}

/**
 * The season as the site shows it. A team's shown rating is its team part plus the player part of its rotation
 * (usualRotations() in src/lib/players.ts), on the Elo scale: the fitted margin units times ELO_PER_SIGMA / SIGMA, shifted each day by
 * the same amount for every team so the league's mean is 1000. Until a team's first game is played it shows its
 * seed alone; once it is, the days before it count that game's rotation, if it has one. A game's `pre` and `post` hold the
 * rotation the team had before its day and the day's shift, so their difference is what the game did: a change
 * of players, or of the shift, shows on the chart and never in the game's change. After a team's last game in
 * the season's file, played or to come, its rating holds where that game day left it, and only the shift moves it.
 */
export function compute(data: SeasonData, inputs: ModelInputs = {}): Season {
  const abbrs = Object.keys(data.teams);
  const { centres, players } = inputs;
  const scale = ELO_PER_SIGMA / PARAMS.sigma;
  const days = fitModel(data, inputs);
  const next: Record<Abbr, Lineup> = Object.fromEntries(abbrs.map((a) => [a, []]));
  const shown = shownLineups(data, players?.rotation);
  let usual = shown.opening;
  const rated = (fit: Fit, lineups: Record<Abbr, Lineup>) => Object.fromEntries(abbrs.map((a) => [a, (fit.r[a] + playerPart(fit, lineups[a])) * scale]));
  const shiftTo1000 = (raw: Record<Abbr, number>) => START - abbrs.reduce((s, a) => s + raw[a], 0) / (abbrs.length || 1);
  const shifted = (raw: Record<Abbr, number>, by: number) => Object.fromEntries(abbrs.map((a) => [a, raw[a] + by]));
  const start = days[0]?.before ?? startFit(abbrs, PARAMS, centres);
  const startRated = rated(start, usual);
  const opening = shifted(startRated, shiftTo1000(startRated));
  let r = opening;
  let latest = start;
  const log: Record<Abbr, TeamGame[]> = Object.fromEntries(abbrs.map((a) => [a, []]));
  const results: Result[] = [];
  const endOfDay = new Map<string, Record<Abbr, number>>();
  const lastDay = new Map<Abbr, string>();
  for (const g of data.games) for (const a of [g.home, g.away]) if (dayKey(g.t) > (lastDay.get(a) ?? "")) lastDay.set(a, dayKey(g.t));
  const held = new Map<Abbr, number>();

  for (const { day, games, before, after } of days) {
    const priced = games.map((pg) => ({
      pg,
      p: phi(expected(before, pg) / (PARAMS.sigma * (played(log, pg.game) < EARLY.games ? EARLY.widen : 1))),
    }));
    const was = rated(before, usual);
    const kept = rated(after, usual);
    Object.assign(next, players?.lineups.next.get(day));
    usual = shown.after.get(day)!;
    const now = rated(after, usual);
    for (const a of abbrs) {
      const h = held.get(a);
      if (h !== undefined) now[a] = h;
      else if (lastDay.get(a) === day) held.set(a, now[a]);
    }
    const by = shiftTo1000(now);
    r = shifted(now, by);
    latest = after;
    for (const { pg: { game }, p } of priced) {
      const side = (ratings: Record<Abbr, number>, shift: number) => ({ h: ratings[game.home] + shift, a: ratings[game.away] + shift });
      const result: Result = { game, day, p, pre: side(was, by), post: side(kept, by), shown: side(r, 0) };
      results.push(result);
      log[game.home].push({ result, side: "h" });
      log[game.away].push({ result, side: "a" });
    }
    endOfDay.set(day, r);
  }

  // One snapshot per calendar day from the day before opening night to the latest game day.
  const series: Snapshot[] = [];
  if (results.length) {
    const first = results[0].day;
    const last = results[results.length - 1].day;
    let cur = opening;
    series.push({ day: addDays(first, -1), r: cur });
    for (let d = first; d <= last; d = addDays(d, 1)) {
      cur = endOfDay.get(d) ?? cur;
      series.push({ day: d, r: cur });
    }
  }

  const stats = Object.fromEntries(
    abbrs.map((a) => {
      const s: TeamStats = { hi: opening[a], lo: opening[a] };
      for (const d of series) {
        s.hi = Math.max(s.hi, d.r[a]);
        s.lo = Math.min(s.lo, d.r[a]);
      }
      return [a, s];
    }),
  );

  const second = secondNights(data);
  const order = [...abbrs].sort((x, y) => r[y] - r[x] || data.teams[x].name.localeCompare(data.teams[y].name));
  const pricing = rated(latest, next);
  return {
    data, abbrs, r, pricing, home: latest.home * scale, rank: ranksOf(r), log, results, series, stats, order,
    upcoming: data.games.filter((g) => !g.final),
    b2b: Object.fromEntries(data.games.map((g) => [g.id, b2bTerm(PARAMS, second.get(g.id)!) * scale])),
  };
}

/** A per-game change as the reader sees it: the gap between the two displayed (rounded) ratings. */
export const shownChange = (pre: number, post: number) => Math.round(post) - Math.round(pre);
