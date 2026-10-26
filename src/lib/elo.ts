// Season-only Elo for NBA teams, after FiveThirtyEight's NBA model: every team starts the season at 1500,
// K = 20, home court is worth 100 points, and a margin-of-victory multiplier scales each exchange.

export const K = 20;
export const HCA = 100;
export const START = 1500;
export const TZ = "America/New_York";

export type Abbr = string;
export type Team = { name: string; short: string };
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

type Pair = { h: number; a: number };
export type Result = { game: Game; day: string; p: number; shift: number; pre: Pair; post: Pair; rankPre: Pair; rankPost: Pair };
export type Snapshot = { day: string; r: Record<Abbr, number>; rank: Record<Abbr, number> };
export type TeamGame = { result: Result; side: "h" | "a" };
export type TeamStats = { W: number; L: number; hi: number; lo: number };

export type Season = {
  data: SeasonData;
  abbrs: Abbr[];
  r: Record<Abbr, number>;
  rank: Record<Abbr, number>;
  results: Result[];
  log: Record<Abbr, TeamGame[]>;
  series: Snapshot[];
  asOf: string | null;
  weekAgo: Snapshot | null;
  stats: Record<Abbr, TeamStats>;
  order: Abbr[];
  upcoming: Game[];
};

export const winProb = (diff: number) => 1 / (1 + 10 ** (-diff / 400));

/** Home-court-adjusted rating gap, home minus away. */
export const gap = (game: Game, r: Record<Abbr, number>) => r[game.home] + (game.neutral ? 0 : HCA) - r[game.away];

/** Rating points moved to the home team by one final game (negative when the home team loses them). */
export function exchange(diff: number, homeScore: number, awayScore: number) {
  const p = winProb(diff);
  const homeWon = homeScore > awayScore;
  const mult = (Math.abs(homeScore - awayScore) + 3) ** 0.8 / (7.5 + 0.006 * (homeWon ? diff : -diff));
  return { p, shift: K * mult * ((homeWon ? 1 : 0) - p) };
}

/** Standard competition ranks on displayed (rounded) ratings: equal ratings share a rank, the next rank skips. */
export function ranksOf(ratings: Record<Abbr, number>) {
  const vals = Object.entries(ratings).map(([a, v]) => [a, Math.round(v)] as const);
  return Object.fromEntries(vals.map(([a, v]) => [a, 1 + vals.filter(([, w]) => w > v).length]));
}

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
/** The US Eastern calendar day a game belongs to, as YYYY-MM-DD. */
export const dayKey = (iso: string) => dayFmt.format(new Date(iso));
export const addDays = (key: string, n: number) => new Date(Date.parse(key + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

export function compute(data: SeasonData): Season {
  const abbrs = Object.keys(data.teams);
  const fresh = () => Object.fromEntries(abbrs.map((a) => [a, START]));
  const r = fresh();
  const log: Record<Abbr, TeamGame[]> = Object.fromEntries(abbrs.map((a) => [a, []]));
  const results: Result[] = [];
  const endOfDay = new Map<string, Omit<Snapshot, "day">>();
  let rank = ranksOf(r);

  for (const game of data.games) {
    if (!game.final || game.hs === null || game.as === null) continue;
    const { p, shift } = exchange(gap(game, r), game.hs, game.as);
    const pre = { h: r[game.home], a: r[game.away] };
    const rankPre = { h: rank[game.home], a: rank[game.away] };
    r[game.home] += shift;
    r[game.away] -= shift;
    rank = ranksOf(r);
    const result: Result = { game, day: dayKey(game.t), p, shift, pre, post: { h: r[game.home], a: r[game.away] }, rankPre, rankPost: { h: rank[game.home], a: rank[game.away] } };
    results.push(result);
    log[game.home].push({ result, side: "h" });
    log[game.away].push({ result, side: "a" });
    endOfDay.set(result.day, { r: { ...r }, rank });
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
        s.hi = Math.max(s.hi, result.post[side]);
        s.lo = Math.min(s.lo, result.post[side]);
      }
      return [a, s];
    }),
  );

  const order = [...abbrs].sort((x, y) => r[y] - r[x] || data.teams[x].name.localeCompare(data.teams[y].name));
  return {
    data, abbrs, r, rank, log, results, series, asOf, weekAgo, stats, order,
    upcoming: data.games.filter((g) => !g.final),
  };
}

/** A per-game change as the reader sees it: the gap between the two displayed (rounded) ratings. */
export const shownChange = (pre: number, post: number) => Math.round(post) - Math.round(pre);
