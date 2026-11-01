// The rest of the regular season for the odds. The games file holds two weeks ahead, so the team pages and the games
// page list only what is near; the fetch also saves every regular-season game scheduled past them in
// src/data/schedule/<season>.json. Before the NBA Cup's group stage ends, each team still has two games the league
// has not scheduled, and a season can lose a game to a postponement, so the odds fill whatever a team lacks of its
// 82 with stand-in games, picked the way the league's schedule formula would pick them.
import { addDays, b2bTerm, dayKey, ELO_PER_SIGMA, PARAMS, secondNights, type Abbr, type Game, type SeasonData } from "./elo.ts";
import { divisionOf, type Fixture } from "./project.ts";
import { conferenceOf, stage } from "./teams.ts";

/** A season's regular-season games scheduled past the games file. */
export type Schedule = { season: string; games: Game[] };

/** Games in a regular season. */
export const SEASON_GAMES = 82;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A schedule file as read from JSON, its games checked as the games file's are; undefined when there is none. */
export function parseSchedule(raw: unknown, id: string): Schedule | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || raw.season !== id || !Array.isArray(raw.games)) throw new Error(`src/data/schedule/${id}.json: expected { season: "${id}", games }`);
  const games = raw.games.map((g) => {
    if (isRecord(g) && typeof g.id === "string" && typeof g.t === "string" && typeof g.home === "string" && typeof g.away === "string" && typeof g.neutral === "boolean") {
      return { id: g.id, t: g.t, home: g.home, away: g.away, hs: null, as: null, final: false, neutral: g.neutral, note: typeof g.note === "string" ? g.note : null };
    }
    throw new Error(`src/data/schedule/${id}.json: malformed game ${JSON.stringify(g).slice(0, 120)}`);
  });
  return { season: id, games };
}

/**
 * The schedule's games the games file does not hold, as fixtures, each with its home court and back-to-back in Elo
 * points: the back-to-back read over both files together, so a game the day after the file's last counts it.
 */
export function scheduledFixtures(data: SeasonData, schedule: Schedule | undefined, home: number): Fixture[] {
  if (!schedule) return [];
  const known = new Set(data.games.map((g) => g.id));
  const extra = schedule.games.filter((g) => !known.has(g.id) && g.home in data.teams && g.away in data.teams && stage(g.note).standings);
  const second = secondNights({ ...data, games: [...data.games, ...extra] });
  const scale = ELO_PER_SIGMA / PARAMS.sigma;
  return extra.map((g) => ({ id: g.id, day: dayKey(g.t), home: g.home, away: g.away, edge: (g.neutral ? 0 : home) + b2bTerm(PARAMS, second.get(g.id)!) * scale }));
}

/** How many games two teams play in a season by the league's formula: 4 in a division, 3.6 on average in a conference, 2 across. */
const formula = (a: Abbr, b: Abbr) => (divisionOf(a) === divisionOf(b) ? 4 : conferenceOf(a) === conferenceOf(b) ? 3.6 : 2);

/**
 * Stand-in games that bring every team to SEASON_GAMES, given the games it already has, played or scheduled. The team
 * furthest short goes first, against the team still short that its formula count is furthest from, at home if it has
 * fewer home games. Each lands on a day spread evenly from the day after `after` to `end`.
 */
export function fillSeason(abbrs: Abbr[], games: readonly { home: Abbr; away: Abbr }[], home: number, after: string, end: string): Fixture[] {
  const need = new Map(abbrs.map((a) => [a, SEASON_GAMES]));
  const hosted = new Map(abbrs.map((a) => [a, 0]));
  const met = new Map<string, number>();
  const pair = (a: Abbr, b: Abbr) => (a < b ? `${a} ${b}` : `${b} ${a}`);
  for (const g of games) {
    if (!need.has(g.home) || !need.has(g.away)) continue;
    need.set(g.home, need.get(g.home)! - 1);
    need.set(g.away, need.get(g.away)! - 1);
    hosted.set(g.home, hosted.get(g.home)! + 1);
    met.set(pair(g.home, g.away), (met.get(pair(g.home, g.away)) ?? 0) + 1);
  }
  const added: { home: Abbr; away: Abbr }[] = [];
  for (;;) {
    const short = abbrs.filter((a) => need.get(a)! > 0).sort((x, y) => need.get(y)! - need.get(x)! || x.localeCompare(y));
    const [a] = short;
    const b = short.slice(1).sort((x, y) => (formula(a, y) - (met.get(pair(a, y)) ?? 0)) - (formula(a, x) - (met.get(pair(a, x)) ?? 0)) || need.get(y)! - need.get(x)! || x.localeCompare(y))[0];
    if (!a || !b) break;
    const [h, v] = hosted.get(a)! <= hosted.get(b)! ? [a, b] : [b, a];
    added.push({ home: h, away: v });
    need.set(a, need.get(a)! - 1);
    need.set(b, need.get(b)! - 1);
    hosted.set(h, hosted.get(h)! + 1);
    met.set(pair(a, b), (met.get(pair(a, b)) ?? 0) + 1);
  }
  const span = Math.max(1, Math.round((Date.parse(end) - Date.parse(after)) / 86_400_000));
  return added.map((g, i) => ({ id: `fill-${i}`, day: addDays(after, 1 + Math.floor(((i + 0.5) / added.length) * span)), home: g.home, away: g.away, edge: home, synthetic: true }));
}
