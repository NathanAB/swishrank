// Facts the pages show, derived from compute()'s season model. Every per-game change here is the
// displayed one (shownChange), so a list, a table and a sentence that show the same game agree.
import { shownChange, type Abbr, type Result, type Season } from "./elo.ts";

export type Side = "h" | "a";

/** One team's side of a final game, as the reader sees it. */
export type Line = {
  abbr: Abbr;
  side: Side;
  score: number;
  /** Pre-game win chance, 0 to 1. */
  chance: number;
  /** Rating change as displayed: the gap between the rounded ratings before and after. */
  change: number;
  /** Rating after the game, unrounded. */
  rating: number;
  won: boolean;
};

export type Outcome = { result: Result; home: Line; away: Line; winner: Line; loser: Line };

export function outcome(result: Result): Outcome {
  const { game, p, pre, post } = result;
  const homeScore = game.hs;
  const awayScore = game.as;
  // compute() only makes results from scored finals; elo.ts's Game type cannot say so.
  if (homeScore === null || awayScore === null) throw new Error(`Game ${game.id} has a result but no score`);
  const homeWon = homeScore > awayScore;
  const line = (side: Side): Line => ({
    abbr: side === "h" ? game.home : game.away,
    side,
    score: side === "h" ? homeScore : awayScore,
    chance: side === "h" ? p : 1 - p,
    change: shownChange(pre[side], post[side]),
    rating: post[side],
    won: side === "h" ? homeWon : !homeWon,
  });
  const home = line("h");
  const away = line("a");
  return { result, home, away, winner: homeWon ? home : away, loser: homeWon ? away : home };
}

/** The points the winner took, as displayed. */
const swing = (result: Result) => outcome(result).winner.change;

/** Biggest swing first; games with equal swings keep the order they came in. */
export const bySwing = (results: readonly Result[]) => [...results].sort((x, y) => swing(y) - swing(x));

export const gamesOn = (model: Season, day: string) => model.results.filter((r) => r.day === day);

/** Each team's displayed rating change on one day; teams that did not play are absent. */
export function dayChanges(model: Season, day: string): Map<Abbr, number> {
  const out = new Map<Abbr, number>();
  for (const r of gamesOn(model, day)) {
    const o = outcome(r);
    out.set(o.home.abbr, (out.get(o.home.abbr) ?? 0) + o.home.change);
    out.set(o.away.abbr, (out.get(o.away.abbr) ?? 0) + o.away.change);
  }
  return out;
}

/** Teams that share first place on the displayed ratings, in table order. */
export const leaders = (model: Season) => model.order.filter((a) => model.rank[a] === 1);

/** The widest gap between neighbours in the table, on the displayed ratings. */
export function widestGap(model: Season): { points: number; upper: Abbr; lower: Abbr } | null {
  let best: { points: number; upper: Abbr; lower: Abbr } | null = null;
  for (let i = 1; i < model.order.length; i++) {
    const upper = model.order[i - 1];
    const lower = model.order[i];
    const points = Math.round(model.r[upper]) - Math.round(model.r[lower]);
    if (!best || points > best.points) best = { points, upper, lower };
  }
  return best;
}

export type Finals = { champion: Abbr; runnerUp: Abbr; wins: number; losses: number; games: Result[] };

const isFinals = (r: Result) => r.game.note?.startsWith("NBA Finals") ?? false;

/** The NBA Finals once a team has won four games of it; null before then. */
export function finals(model: Season): Finals | null {
  const games = model.results.filter(isFinals);
  const wins = new Map<Abbr, number>();
  for (const r of games) {
    const w = outcome(r).winner.abbr;
    wins.set(w, (wins.get(w) ?? 0) + 1);
  }
  const champion = [...wins].find(([, n]) => n >= 4)?.[0];
  if (!champion || !games.length) return null;
  const first = games[0].game;
  const runnerUp = first.home === champion ? first.away : first.home;
  return { champion, runnerUp, wins: wins.get(champion) ?? 0, losses: wins.get(runnerUp) ?? 0, games };
}

/** The first day of the playoffs proper (play-in games come before it), if they have started. */
export const playoffsStart = (model: Season) => model.results.find((r) => /1st Round/.test(r.game.note ?? ""))?.day ?? null;
