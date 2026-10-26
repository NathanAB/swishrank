// Elo-style ratings for NBA teams, worked out like SRS or Massey ratings: after every game day the season's
// ratings are fitted again, by least squares, to the margins of every game so far. 1500 is the league
// average and nothing carries over from last season. docs/model.md holds the backtest behind every setting.

export const START = 1500;
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
/** `n0` is the pull toward the league average, in games against an average team that ended level. */
export type FitRule = { n0: number; margin: MarginRule; home: HomeRule };
/** `sigma` turns an expected margin into a win chance: Phi(margin / sigma). */
export type Params = FitRule & { sigma: number };

/** The site's model, chosen by the pre-registered backtest: docs/model.md, tables 1 and 2. */
export const PARAMS: Params = { n0: 12, margin: { kind: "power", q: 0.5 }, home: { kind: "fixed", value: 0.622 }, sigma: 2.866 };

/** Games a team plays before its rating stops being provisional: docs/model.md, table 8. */
export const PROVISIONAL = 26;

/** What a final margin, home minus away, counts for in the fit. */
export function counted(margin: number, rule: MarginRule): number {
  const m = Math.abs(margin);
  const v = rule.kind === "raw" ? m : rule.kind === "cap" ? Math.min(m, rule.at) : (m + 3) ** rule.q;
  return Math.sign(margin) * v;
}

/** One fit: each team's rating and the home edge, in the margin rule's units. */
export type Fit = { r: Record<Abbr, number>; home: number };
/** A game day: its games, the fit they were predicted from, and the fit after them. */
export type FitDay = { day: string; games: FinalGame[]; before: Fit; after: Fit };

/** Solves M x = v for a symmetric positive-definite M by Cholesky factorisation. */
function solveSpd(M: number[][], v: number[]): number[] {
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

/** The fit before any game: every team at the league average, the home edge at its prior. */
const startFit = (abbrs: Abbr[], rule: FitRule): Fit => ({
  r: Object.fromEntries(abbrs.map((a) => [a, 0])),
  home: rule.home.kind === "fixed" ? rule.home.value : rule.home.centre,
});

/**
 * The season fitted after every game day. Each fit minimises the squared misses on every final game so far,
 * sum (counted(margin) - (r_home - r_away + home))^2, plus n0 * r^2 for every team and, for a fitted home
 * edge, weight * (home - centre)^2. Before the first game every team is at 0, the league average.
 */
export function fitSeason(data: SeasonData, rule: FitRule): FitDay[] {
  const abbrs = Object.keys(data.teams);
  const n = abbrs.length;
  const at = new Map(abbrs.map((a, i) => [a, i]));
  // Running sums of x x' and x y over the games so far, x being +1 home, -1 away and 1 in the home-edge slot.
  const xx = Array.from({ length: n + 1 }, () => new Array<number>(n + 1).fill(0));
  const xy = new Array<number>(n + 1).fill(0);
  const home = rule.home;
  const fitNow = (): Fit => {
    const size = home.kind === "fixed" ? n : n + 1;
    const M = xx.slice(0, size).map((row) => row.slice(0, size));
    const v = xy.slice(0, size);
    for (let i = 0; i < n; i++) M[i][i] += rule.n0;
    if (home.kind === "fixed") for (let i = 0; i < n; i++) v[i] -= xx[i][n] * home.value;
    else {
      M[n][n] += home.weight;
      v[n] += home.weight * home.centre;
    }
    const x = solveSpd(M, v);
    return { r: Object.fromEntries(abbrs.map((a, i) => [a, x[i]])), home: home.kind === "fixed" ? home.value : x[n] };
  };

  const byDay = new Map<string, FinalGame[]>();
  for (const g of data.games) {
    if (!g.final || g.hs === null || g.as === null) continue;
    const day = dayKey(g.t);
    byDay.set(day, [...(byDay.get(day) ?? []), { ...g, hs: g.hs, as: g.as }]);
  }

  let fit = startFit(abbrs, rule);
  const days: FitDay[] = [];
  for (const [day, games] of [...byDay].sort(([x], [y]) => x.localeCompare(y))) {
    for (const g of games) {
      const idx: [number, number][] = [[at.get(g.home)!, 1], [at.get(g.away)!, -1]];
      if (!g.neutral) idx.push([n, 1]);
      const y = counted(g.hs - g.as, rule.margin);
      for (const [i, xi] of idx) {
        xy[i] += xi * y;
        for (const [j, xj] of idx) xx[i][j] += xi * xj;
      }
    }
    const before = fit;
    fit = fitNow();
    days.push({ day, games, before, after: fit });
  }
  return days;
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
 * 100 points still makes a 64% favourite. docs/model.md, table 9.
 */
export const ELO_PER_SIGMA = (400 / Math.LN10) * 1.702;

/** The model's win chance for a rating gap in Elo points: Phi(gap / ELO_PER_SIGMA). */
export const winProb = (gap: number) => phi(gap / ELO_PER_SIGMA);

/** Home-court-adjusted rating gap, home minus away, with `home` the home edge in Elo points. */
export const gap = (game: Game, r: Record<Abbr, number>, home: number) => r[game.home] + (game.neutral ? 0 : home) - r[game.away];

/** A fit in Elo points: 1500 plus the rating at ELO_PER_SIGMA points per sigma, and the home edge likewise. */
const toElo = (fit: Fit) => ({
  r: Object.fromEntries(Object.entries(fit.r).map(([a, v]) => [a, START + (v * ELO_PER_SIGMA) / PARAMS.sigma])),
  home: (fit.home * ELO_PER_SIGMA) / PARAMS.sigma,
});

type Pair = { h: number; a: number };
/** One final game: the home side's pre-game chance, and each side's rating and rank before and after its day. */
export type Result = { game: Game; day: string; p: number; pre: Pair; post: Pair; rankPre: Pair; rankPost: Pair };
export type Snapshot = { day: string; r: Record<Abbr, number>; rank: Record<Abbr, number> };
export type TeamGame = { result: Result; side: "h" | "a" };
/** `hi` and `lo` are the team's highest and lowest rating on any day of the season, 1500 included. */
export type TeamStats = { W: number; L: number; hi: number; lo: number };

export type Season = {
  data: SeasonData;
  abbrs: Abbr[];
  r: Record<Abbr, number>;
  /** The home edge the latest fit measured, in Elo points. */
  home: number;
  rank: Record<Abbr, number>;
  results: Result[];
  log: Record<Abbr, TeamGame[]>;
  series: Snapshot[];
  weekAgo: Snapshot | null;
  stats: Record<Abbr, TeamStats>;
  order: Abbr[];
  upcoming: Game[];
};

/** Standard competition ranks on displayed (rounded) ratings: equal ratings share a rank, the next rank skips. */
export function ranksOf(ratings: Record<Abbr, number>) {
  const vals = Object.entries(ratings).map(([a, v]) => [a, Math.round(v)] as const);
  return Object.fromEntries(vals.map(([a, v]) => [a, 1 + vals.filter(([, w]) => w > v).length]));
}

/** Whether a team has played too few games for its rating to have settled. */
export const provisional = (s: TeamStats) => s.W + s.L < PROVISIONAL;

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
/** The US Eastern calendar day a game belongs to, as YYYY-MM-DD. */
export const dayKey = (iso: string) => dayFmt.format(new Date(iso));
export const addDays = (key: string, n: number) => new Date(Date.parse(key + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

export function compute(data: SeasonData): Season {
  const abbrs = Object.keys(data.teams);
  const fresh = () => Object.fromEntries(abbrs.map((a) => [a, START]));
  let r = fresh();
  let home = toElo(startFit(abbrs, PARAMS)).home;
  const log: Record<Abbr, TeamGame[]> = Object.fromEntries(abbrs.map((a) => [a, []]));
  const results: Result[] = [];
  const endOfDay = new Map<string, Omit<Snapshot, "day">>();
  let rank = ranksOf(r);

  for (const { day, games, after } of fitSeason(data, PARAMS)) {
    const next = toElo(after);
    const nextRank = ranksOf(next.r);
    for (const game of games) {
      const result: Result = {
        game, day,
        p: winProb(gap(game, r, home)),
        pre: { h: r[game.home], a: r[game.away] },
        post: { h: next.r[game.home], a: next.r[game.away] },
        rankPre: { h: rank[game.home], a: rank[game.away] },
        rankPost: { h: nextRank[game.home], a: nextRank[game.away] },
      };
      results.push(result);
      log[game.home].push({ result, side: "h" });
      log[game.away].push({ result, side: "a" });
    }
    r = next.r;
    home = next.home;
    rank = nextRank;
    endOfDay.set(day, { r, rank });
  }

  // One snapshot per calendar day from the day before opening night to the latest game day.
  const series: Snapshot[] = [];
  if (results.length) {
    const first = results[0].day;
    const last = results[results.length - 1].day;
    let cur = { r: fresh(), rank: ranksOf(fresh()) };
    series.push({ day: addDays(first, -1), ...cur });
    for (let d = first; d <= last; d = addDays(d, 1)) {
      cur = endOfDay.get(d) ?? cur;
      series.push({ day: d, ...cur });
    }
  }
  const asOf = series.at(-1)?.day ?? null;

  const target = asOf ? addDays(asOf, -7) : null;
  const weekAgo = target && target >= series[1].day ? [...series].reverse().find((x) => x.day <= target) ?? null : null;

  const stats = Object.fromEntries(
    abbrs.map((a) => {
      const s: TeamStats = { W: 0, L: 0, hi: START, lo: START };
      for (const { result, side } of log[a]) {
        const g = result.game;
        const mine = side === "h" ? g.hs! : g.as!;
        const theirs = side === "h" ? g.as! : g.hs!;
        s[mine > theirs ? "W" : "L"]++;
      }
      for (const d of series) {
        s.hi = Math.max(s.hi, d.r[a]);
        s.lo = Math.min(s.lo, d.r[a]);
      }
      return [a, s];
    }),
  );

  const order = [...abbrs].sort((x, y) => r[y] - r[x] || data.teams[x].name.localeCompare(data.teams[y].name));
  return {
    data, abbrs, r, home, rank, log, results, series, weekAgo, stats, order,
    upcoming: data.games.filter((g) => !g.final),
  };
}

/** A per-game change as the reader sees it: the gap between the two displayed (rounded) ratings. */
export const shownChange = (pre: number, post: number) => Math.round(post) - Math.round(pre);
