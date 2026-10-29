// Players, for version 2 of the model (docs/model-v2.md): each player's box rating, which centres his value in
// the fit, and the lineup each game is predicted with. Both walk every season's box scores in date order,
// because a player's history crosses teams and seasons.
import { finalDays, type Abbr, type SeasonData } from "./elo.ts";

/** ESPN's athlete id. */
export type Athlete = number;
/** One player's game: [athlete, MIN, PTS, FGM, FGA, FTM, FTA, OREB, DREB, AST, STL, BLK, TO, PF]. */
export type BoxLine = [Athlete, number, number, number, number, number, number, number, number, number, number, number, number, number];
/** A season's box scores, from src/data/box/<season>.json: game id, then team, then the lines of every player who played. */
export type SeasonBox = { season: string; games: Record<string, Partial<Record<Abbr, BoxLine[]>>> };
/** A player in a lineup, with `share` his expected minutes / 48. */
export type Slot = { athlete: Athlete; share: number };
export type Lineup = Slot[];
export type Sides<T> = { home: T; away: T };
/** Each team's rotation, the lineup its shown rating counts, after each game day from its first game on. */
export type SeasonRotations = Map<string, Partial<Record<Abbr, Lineup>>>;
/** One season's games and box scores, the unit the walks below go through in order. */
export type SeasonPlayers = { data: SeasonData; box: SeasonBox };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isLine = (v: unknown): v is BoxLine => Array.isArray(v) && v.length === 14 && v.every((x) => typeof x === "number" && Number.isFinite(x)) && v[1] > 0;

export function parseBox(raw: unknown, id: string): SeasonBox {
  const where = `src/data/box/${id}.json`;
  if (!isRecord(raw) || raw.season !== id || !isRecord(raw.games)) throw new Error(`${where}: expected { season: "${id}", games }`);
  const games: SeasonBox["games"] = {};
  for (const [game, teams] of Object.entries(raw.games)) {
    if (!isRecord(teams)) throw new Error(`${where}: game ${game} is not a map of teams`);
    const sides: Partial<Record<Abbr, BoxLine[]>> = {};
    for (const [abbr, lines] of Object.entries(teams)) {
      if (!Array.isArray(lines) || !lines.every(isLine)) throw new Error(`${where}: game ${game} ${abbr} has a malformed line`);
      sides[abbr] = lines;
    }
    games[game] = sides;
  }
  return { season: id, games };
}

const GAME_SCORE = [1, 0.4, -0.7, 0.4, -0.4, 0.7, 0.3, 0.7, 1, 0.7, -1, -0.4];
/** Hollinger's Game Score: PTS + 0.4 FGM - 0.7 FGA - 0.4 (FTA - FTM) + 0.7 OREB + 0.3 DREB + STL + 0.7 AST + 0.7 BLK - 0.4 PF - TO. */
export const gameScore = (line: BoxLine) => GAME_SCORE.reduce((t, w, i) => t + w * line[i + 2], 0);

/** Per-36 Game Score of a player with no appearances: the 20th percentile among 2015-16 players with 500 minutes or more. */
export const REPLACEMENT = 8.49;
/** Minutes of replacement-level play every box rating starts from. */
export const PSEUDO_MINUTES = 400;

/** Each of a season's players' box rating, in `athletes` order: before its first game day, then after each game day. */
export type BoxRatings = { athletes: Athlete[]; start: Float64Array; after: Map<string, Float64Array> };

const epochDay = (day: string) => Date.parse(day) / 86_400_000;
const linesOf = (box: SeasonBox, id: string): BoxLine[][] => Object.values(box.games[id] ?? {}).flatMap((lines) => (lines ? [lines] : []));

/**
 * Every season's box ratings for `halfLife`. A rating is 36 * (G + REPLACEMENT * PSEUDO_MINUTES / 36) /
 * (M + PSEUDO_MINUTES), minus the minutes-weighted mean of every player seen so far, where G and M are his Game
 * Score and minutes over every earlier appearance, each weighted by 0.5^(days since / halfLife).
 */
export function boxRatings(seasons: readonly SeasonPlayers[], halfLife: number): Map<string, BoxRatings> {
  const index = new Map<Athlete, number>();
  const G: number[] = [], M: number[] = [], last: number[] = [];
  const out = new Map<string, BoxRatings>();
  for (const { data, box } of seasons) {
    const days = finalDays(data);
    const athletes = [...new Set(Object.keys(box.games).flatMap((id) => linesOf(box, id).flatMap((lines) => lines.map((l) => l[0]))))];
    const snapshot = (now: number) => {
      const rel = new Float64Array(G.length);
      let sw = 0, sr = 0;
      for (let i = 0; i < G.length; i++) {
        const f = 0.5 ** ((now - last[i]) / halfLife), m = f * M[i];
        rel[i] = (36 * (f * G[i] + (REPLACEMENT * PSEUDO_MINUTES) / 36)) / (m + PSEUDO_MINUTES);
        sw += m; sr += m * rel[i];
      }
      const mean = sw ? sr / sw : REPLACEMENT;
      return Float64Array.from(athletes, (a) => {
        const i = index.get(a);
        return (i === undefined ? REPLACEMENT : rel[i]) - mean;
      });
    };
    const ratings: BoxRatings = { athletes, start: snapshot(days.length ? epochDay(days[0].day) : 0), after: new Map() };
    for (const { day, games } of days) {
      const now = epochDay(day);
      for (const g of games) for (const lines of linesOf(box, g.id)) for (const l of lines) {
        let i = index.get(l[0]);
        if (i === undefined) { i = G.length; index.set(l[0], i); G.push(0); M.push(0); last.push(now); }
        const f = 0.5 ** ((now - last[i]) / halfLife);
        G[i] = f * G[i] + gameScore(l); M[i] = f * M[i] + l[1]; last[i] = now;
      }
      ratings.after.set(day, snapshot(now));
    }
    out.set(data.season, ratings);
  }
  return out;
}

/** A season's lineups. `next` holds, after each game day, the lineup each team that played takes into its next game. */
export type Lineups = {
  previous: Map<string, Sides<Lineup>>;
  atTip: Map<string, Sides<Lineup>>;
  next: Map<string, Partial<Record<Abbr, Lineup>>>;
};

/** A lineup's minutes: everyone's expected minutes scaled so the team's total is 240. */
const MINUTES = 240;
/** Expected minutes a player needs to count in a lineup. */
const ROTATION = 10;
/** Appearances a player's expected minutes average over. */
const RECENT = 10;
/** Expected minutes of a player with no appearances. */
const UNKNOWN = 15;
/** A team's games its usual rotation reads. */
const USUAL = 10;
/** Games a player's minutes per game last season count for in his team's rotation until it has played USUAL games. */
const PRIOR = 1;

const mean = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
/** Players at their expected minutes, scaled so the team's total is 240, as shares of 48. */
export const scaled = (players: readonly { athlete: Athlete; min: number }[]): Lineup => {
  const total = players.reduce((s, p) => s + p.min, 0);
  return players.map((p) => ({ athlete: p.athlete, share: (p.min * MINUTES) / total / 48 }));
};

/**
 * Every season's lineups. A game's `previous` lineup is the players who played in the team's latest game this
 * season with lines; `atTip` is the players who played in the game itself, or `previous` for a side without lines.
 * Either keeps those whose expected minutes, the mean of their last 10 appearances on any team, are at least 10.
 * A team's first game has none.
 */
export function lineups(seasons: readonly SeasonPlayers[]): Map<string, Lineups> {
  const recent = new Map<Athlete, number[]>();
  const expected = (a: Athlete) => {
    const r = recent.get(a);
    return r ? mean(r) : UNKNOWN;
  };
  const lineup = (lines: readonly BoxLine[] | undefined): Lineup =>
    scaled((lines ?? []).map((l) => ({ athlete: l[0], min: expected(l[0]) })).filter((p) => p.min >= ROTATION));
  const out = new Map<string, Lineups>();
  for (const { data, box } of seasons) {
    const latest = new Map<Abbr, BoxLine[]>();
    const season: Lineups = { previous: new Map(), atTip: new Map(), next: new Map() };
    for (const { day, games } of finalDays(data)) {
      for (const g of games) {
        const lines = box.games[g.id] ?? {};
        const previous = { home: lineup(latest.get(g.home)), away: lineup(latest.get(g.away)) };
        season.previous.set(g.id, previous);
        season.atTip.set(g.id, { home: lines[g.home] ? lineup(lines[g.home]) : previous.home, away: lines[g.away] ? lineup(lines[g.away]) : previous.away });
      }
      const played: Abbr[] = [];
      for (const g of games) for (const [abbr, lines] of Object.entries(box.games[g.id] ?? {})) {
        if (!lines) continue;
        latest.set(abbr, lines);
        played.push(abbr);
        for (const l of lines) recent.set(l[0], [...(recent.get(l[0]) ?? []), l[1]].slice(-RECENT));
      }
      season.next.set(day, Object.fromEntries(played.map((abbr) => [abbr, lineup(latest.get(abbr))])));
    }
    out.set(data.season, season);
  }
  return out;
}

/** One of a team's games in its usual rotation's window: each player's minutes, or null when ESPN has no box score for its side. */
type Minutes = ReadonlyMap<Athlete, number> | null;

/**
 * Every season's usual rotations, the lineups the site shows each team's rating with, for each team after each
 * day it plays or loses a player. A team's rotation is everyone who played in its last 10 games this season and
 * has not played for another team since, each at his minutes per team game over those of them with box scores,
 * a game he missed counting 0. It is empty when none has one, and while fewer than half the team's games this
 * season have one: the fit then had few of its players to separate, so its team part already holds them. Until
 * the team has played 10, his minutes per game last season, on any team, count as one more game.
 */
export function usualRotations(seasons: readonly SeasonPlayers[]): Map<string, SeasonRotations> {
  const out = new Map<string, SeasonRotations>();
  let lastSeason = new Map<Athlete, number>();
  for (const { data, box } of seasons) {
    const windows = new Map<Abbr, Minutes[]>();
    const played = new Map<Abbr, number>();
    const boxed = new Map<Abbr, number>();
    const thisSeason = new Map<Athlete, { minutes: number; games: number }>();
    const teamOf = new Map<Athlete, Abbr>();
    const rotation = (abbr: Abbr): Lineup => {
      if (2 * (boxed.get(abbr) ?? 0) < played.get(abbr)!) return [];
      const games = windows.get(abbr)!.filter((g) => g !== null);
      const prior = played.get(abbr)! < USUAL ? PRIOR : 0;
      return scaled([...new Set(games.flatMap((g) => [...g.keys()]))].map((athlete) => {
        const minutes = games.reduce((s, g) => s + (g.get(athlete) ?? 0), 0);
        const last = lastSeason.get(athlete);
        return { athlete, min: last === undefined ? minutes / games.length : (minutes + prior * last) / (games.length + prior) };
      }));
    };
    const season: SeasonRotations = new Map();
    for (const { day, games } of finalDays(data)) {
      const teams = new Set<Abbr>();
      for (const g of games) for (const abbr of [g.home, g.away]) {
        const lines = box.games[g.id]?.[abbr];
        windows.set(abbr, [...(windows.get(abbr) ?? []), lines ? new Map(lines.map((l) => [l[0], l[1]])) : null].slice(-USUAL));
        played.set(abbr, (played.get(abbr) ?? 0) + 1);
        if (lines) boxed.set(abbr, (boxed.get(abbr) ?? 0) + 1);
        teams.add(abbr);
        for (const l of lines ?? []) {
          const so = thisSeason.get(l[0]) ?? { minutes: 0, games: 0 };
          thisSeason.set(l[0], { minutes: so.minutes + l[1], games: so.games + 1 });
          const left = teamOf.get(l[0]);
          teamOf.set(l[0], abbr);
          if (left === undefined || left === abbr) continue;
          const window = windows.get(left)!;
          if (!window.some((w) => w?.has(l[0]))) continue;
          windows.set(left, window.map((w) => w && new Map([...w].filter(([athlete]) => athlete !== l[0]))));
          teams.add(left);
        }
      }
      season.set(day, Object.fromEntries([...teams].map((abbr) => [abbr, rotation(abbr)])));
    }
    out.set(data.season, season);
    lastSeason = new Map([...thisSeason].map(([athlete, { minutes, games }]) => [athlete, minutes / games]));
  }
  return out;
}
