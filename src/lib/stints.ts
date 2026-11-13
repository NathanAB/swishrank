// Who was on the floor, and the score while they were, rebuilt from ESPN's play-by-play: the record the on-court
// rating (GLOSSARY.md) is fitted from, kept in scripts/stints/<season>.json by scripts/stints.ts and the morning
// refresh. The rebuild is the version 5 prototype's (branch prototype/model-v5, scripts/research/pbp/stints.py).
import { boxLines, playerNames, type EspnSummary } from "./espn.ts";
import type { Game } from "./elo.ts";
import type { Athlete, SeasonBox } from "./players.ts";

/**
 * Ten players' time on the floor together: each side's athletes, sorted ascending, the seconds, each side's points,
 * and each side's three-point shots, attempted then made. The on-court rating takes three-point luck out of a
 * stint's score with the last four.
 */
export type Stint = [
  home: Athlete[], away: Athlete[], seconds: number, homePoints: number, awayPoints: number,
  homeThreesAttempted: number, homeThreesMade: number, awayThreesAttempted: number, awayThreesMade: number,
];
/** Three-point shots by side: home attempted, home made, away attempted, away made. */
export type Threes = [homeAttempted: number, homeMade: number, awayAttempted: number, awayMade: number];
/** A season's play-by-play record, from scripts/stints/<season>.json: each final game's stints in game order. */
export type SeasonStints = { season: string; games: Record<string, Stint[]> };

type Side = "home" | "away";
const SIDES: readonly Side[] = ["home", "away"];
type Player = { side: Side; starter: boolean; minutes: number | null };
type Roster = Map<Athlete, Player>;
/**
 * What a play does to who is on the floor. A substitution with fewer than two athletes swaps no one and counts as
 * naming them. A technical, ejection, delay or coach's play can name a player on the bench, so it is ignored.
 */
type Action = { kind: "substitution"; athletes: Athlete[] } | { kind: "named"; athletes: Athlete[] } | { kind: "ignored" };
type Play = { period: number; clock: number; homeScore: number | null; awayScore: number | null; action: Action; three: { side: Side; made: boolean } | null };
type Feed = { roster: Roster; plays: Play[]; periods: number; final: Record<Side, number> };

const IGNORED = ["Technical", "Ejection", "Delay", "Coach"];
const ignored = (type: string) => IGNORED.some((w) => type.includes(w)) && !type.includes("Free Throw") && !type.includes("3-Seconds");
const NUMBER = /^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/;
const isWhole = (text: unknown): text is string => typeof text === "string" && /^\d+$/.test(text);
/** ESPN's athlete id as the record holds it, or null for anything parseStints would reject, so no record is written that cannot be read back. */
const athleteOf = (id: unknown): Athlete | null => (isWhole(id) && Number(id) > 0 && Number.isSafeInteger(Number(id)) ? Number(id) : null);
/**
 * How far the feed's last score may be from the final score, on either side. A scoring change after the game that
 * never reached the feed leaves it 1 to 6 points off in about 1% of games, and those keep the feed's points. The
 * feeds further off, by 22 to 50 points in three games of 2015-16 and 2017-18, have lost whole stretches of scoring.
 */
const MOST_POINTS_OFF = 10;

/** Seconds left in the period from ESPN's clock, "11:32" or, in a period's last minute, "45.3". */
function clockSeconds(text: unknown): number {
  const m = typeof text === "string" ? text.match(/^(\d+):(\d+(?:\.\d+)?)$|^(\d+(?:\.\d+)?)$/) : null;
  if (!m) throw new Error("a play without a readable clock");
  return m[3] !== undefined ? Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
}

const competitor = (summary: EspnSummary, side: Side) => summary.header?.competitions?.[0]?.competitors?.find((c) => c.homeAway === side);

/**
 * Whether a play is a three-point attempt, and if so whether it went in. A missed heave is none: the box score has
 * left it out since 2025-26, when the feed began to mark heaves. ESPN's points attempted decide where the feed has
 * them. 2021-22's has none, so there a make is a three by its score value, and a miss by its text, which says
 * "three point" for nine threes in ten and gives the distance for most of the rest. From 23 feet a shot counts as a
 * three, the cut that leaves 2021-22's attempts closest to its box scores: 0.8% under, half a shot off a team a game.
 */
function threeOf(p: NonNullable<EspnSummary["plays"]>[number]): { made: boolean } | null {
  if (!p.shootingPlay) return null;
  const made = Boolean(p.scoringPlay);
  if (!made && (p.type?.text ?? "").includes("Heave")) return null;
  if (p.pointsAttempted === 2 || p.pointsAttempted === 3) return p.pointsAttempted === 3 ? { made } : null;
  if (made) return p.scoreValue === 3 ? { made } : null;
  const text = (p.text ?? "").toLowerCase();
  return text.includes("three point") || Number(text.match(/(\d+)-foot/)?.[1]) >= 23 ? { made } : null;
}

function sideIds(summary: EspnSummary): Record<Side, string> {
  const home = competitor(summary, "home")?.team?.id, away = competitor(summary, "away")?.team?.id;
  if (!home || !away) throw new Error("no home or away team id");
  return { home, away };
}

function finalScore(summary: EspnSummary): Record<Side, number> {
  const home = competitor(summary, "home")?.score, away = competitor(summary, "away")?.score;
  if (!isWhole(home) || !isWhole(away)) throw new Error("no final score");
  return { home: Number(home), away: Number(away) };
}

/** The box score's players with an id and stats, each with his side, whether he started, and his MIN. */
function rosterOf(summary: EspnSummary, ids: Record<Side, string>): Roster {
  const roster: Roster = new Map();
  for (const team of summary.boxscore?.players ?? []) {
    const side = SIDES.find((s) => ids[s] === team.team.id);
    if (!side) continue;
    for (const group of team.statistics ?? []) {
      const iMin = (group.labels ?? []).indexOf("MIN");
      for (const a of group.athletes ?? []) {
        const athlete = athleteOf(a.athlete?.id);
        if (!a.stats?.length || athlete === null) continue;
        const min = iMin < 0 ? undefined : a.stats[iMin];
        roster.set(athlete, { side, starter: Boolean(a.starter), minutes: min !== undefined && NUMBER.test(min) ? Number(min) : null });
      }
    }
  }
  return roster;
}

function feedOf(summary: EspnSummary): Feed {
  const ids = sideIds(summary);
  const final = finalScore(summary);
  const roster = rosterOf(summary, ids);
  for (const side of SIDES) {
    if ([...roster.values()].filter((p) => p.side === side).length < 5) throw new Error("fewer than five players in the box score for a side");
  }
  if (!summary.plays?.length) throw new Error("no play-by-play");
  const score = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const plays = summary.plays.map((p): Play => {
    const period = p.period?.number;
    if (typeof period !== "number" || !Number.isInteger(period) || period < 1) throw new Error("a play without a period number");
    const clock = clockSeconds(p.clock?.displayValue);
    const athletes = (p.participants ?? []).flatMap((x) => {
      if (!x.athlete) return [];
      const athlete = athleteOf(x.athlete.id);
      if (athlete === null) throw new Error("a play names an athlete without an id");
      return [athlete];
    });
    const type = p.type?.text ?? "";
    const action: Action = type === "Substitution" ? { kind: "substitution", athletes } : ignored(type) ? { kind: "ignored" } : { kind: "named", athletes };
    const shot = threeOf(p), shooter = shot && SIDES.find((s) => ids[s] === p.team?.id);
    const three = shot && shooter ? { side: shooter, made: shot.made } : null;
    return { period, clock, homeScore: score(p.homeScore), awayScore: score(p.awayScore), action, three };
  });
  const periods = Math.max(...plays.map((p) => p.period));
  const seen = new Set(plays.map((p) => p.period));
  if (periods < 4 || seen.size !== periods) throw new Error("periods are not 1 to n with n at least 4");
  return { roster, plays, periods, final };
}

type Segment = { home: Athlete[]; away: Athlete[]; seconds: number; homePoints: number; awayPoints: number; threes: Threes };
const sameFive = (a: readonly Athlete[], b: readonly Athlete[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The game's stints, from ESPN's play-by-play. Period-start fives are not in the feed: a player whose first mention
 * in a period is anything but entering as a substitute was on the floor at its start. Short of five, the five who
 * ended the last period (and are not seen entering) fill in, then the most-minutes players not seen entering; over
 * five, the most-minutes five stay. The feed misses substitutions, so a player named in a play while off the floor
 * takes the place of the teammate on the floor mentioned least recently. Throws when the play-by-play is missing,
 * malformed, cut short or far from the final score.
 */
export function stints(summary: EspnSummary): Stint[] {
  const { roster, plays, periods, final } = feedOf(summary);
  const minutes = (a: Athlete) => roster.get(a)?.minutes ?? 0;
  const byMinutes = (athletes: Iterable<Athlete>) => [...athletes].sort((a, b) => minutes(b) - minutes(a));
  const on: Record<Side, Set<Athlete>> = { home: new Set(), away: new Set() };
  const segments: Segment[] = [];
  let homeScore = 0, awayScore = 0;
  for (let period = 1; period <= periods; period++) {
    const length = period <= 4 ? 720 : 300;
    const inPeriod = plays.filter((p) => p.period === period);
    const first = new Map<Athlete, "in" | "start">();
    const mention = (a: Athlete, how: "in" | "start") => first.has(a) || first.set(a, how);
    for (const { action } of inPeriod) {
      if (action.kind === "substitution" && action.athletes.length >= 2) {
        mention(action.athletes[0], "in");
        mention(action.athletes[1], "start");
      } else if (action.kind !== "ignored") {
        for (const a of action.athletes) mention(a, "start");
      }
    }
    for (const side of SIDES) {
      const ended = [...on[side]];
      if (period === 1) {
        const starters = [...roster].filter(([, p]) => p.side === side && p.starter).map(([a]) => a);
        if (starters.length === 5) {
          on[side] = new Set(starters);
          continue;
        }
      }
      let start = [...first].filter(([a, how]) => how === "start" && roster.get(a)?.side === side).map(([a]) => a);
      if (start.length < 5) {
        const team = [...roster].filter(([, p]) => p.side === side).map(([a]) => a);
        for (const a of [...byMinutes(ended), ...byMinutes(team)]) {
          if (start.length < 5 && !first.has(a) && !start.includes(a)) start.push(a);
        }
      } else if (start.length > 5) {
        start = byMinutes(start).slice(0, 5);
      }
      on[side] = new Set(start);
    }

    const open = (): Segment => ({ home: [...on.home].sort((a, b) => a - b), away: [...on.away].sort((a, b) => a - b), seconds: 0, homePoints: 0, awayPoints: 0, threes: [0, 0, 0, 0] });
    let current = open();
    segments.push(current);
    let elapsed = 0;
    const seen = new Map<Athlete, number>();
    const leastRecent = (athletes: Iterable<Athlete>) => {
      let pick: Athlete | undefined, when = Infinity;
      for (const a of athletes) {
        const n = seen.get(a) ?? -1;
        if (n < when) (pick = a), (when = n);
      }
      return pick;
    };
    // A play next to a substitution at the same clock is often out of order, so it repairs no one he is part of.
    const subbed = new Set(inPeriod.flatMap((p) => (p.action.kind === "substitution" ? p.action.athletes.map((a) => `${p.clock}:${a}`) : [])));
    inPeriod.forEach((play, n) => {
      const t = Math.min(length, Math.max(elapsed, length - play.clock));
      current.seconds += t - elapsed;
      elapsed = t;
      const h = play.homeScore ?? homeScore, a = play.awayScore ?? awayScore;
      current.homePoints += h - homeScore;
      current.awayPoints += a - awayScore;
      homeScore = h;
      awayScore = a;
      if (play.three) {
        const attempted = play.three.side === "home" ? 0 : 2;
        current.threes[attempted]++;
        if (play.three.made) current.threes[attempted + 1]++;
      }
      const { action } = play;
      let changed = false;
      if (action.kind === "substitution" && action.athletes.length >= 2) {
        const [enters, leaves] = action.athletes;
        const side = roster.get(enters)?.side ?? roster.get(leaves)?.side;
        if (!side) return;
        const five = on[side];
        five.delete(leaves);
        five.add(enters);
        seen.set(enters, n);
        if (five.size > 5) five.delete(leastRecent([...five].filter((x) => x !== enters)) ?? enters);
        changed = true;
      } else if (action.kind !== "ignored") {
        for (const x of action.athletes) {
          const side = roster.get(x)?.side;
          if (side && !on[side].has(x) && !subbed.has(`${play.clock}:${x}`)) {
            if (on[side].size >= 5) on[side].delete(leastRecent(on[side]) ?? x);
            on[side].add(x);
            changed = true;
          }
          seen.set(x, n);
        }
      }
      if (changed) {
        current = open();
        segments.push(current);
      }
    });
    current.seconds += length - elapsed;
  }

  const last = plays[plays.length - 1];
  if (last.clock !== 0) throw new Error("the feed stops before the end of the game");
  if (homeScore === awayScore) throw new Error("the feed's last score is tied");
  if (Math.abs(homeScore - final.home) > MOST_POINTS_OFF || Math.abs(awayScore - final.away) > MOST_POINTS_OFF) {
    throw new Error(`the feed's last score, ${homeScore}-${awayScore}, is far from the final score, ${final.home}-${final.away}`);
  }

  const merged: Segment[] = [];
  for (const s of segments) {
    const prev = merged[merged.length - 1];
    if (prev && sameFive(prev.home, s.home) && sameFive(prev.away, s.away)) {
      prev.seconds += s.seconds;
      prev.homePoints += s.homePoints;
      prev.awayPoints += s.awayPoints;
      prev.threes = [prev.threes[0] + s.threes[0], prev.threes[1] + s.threes[1], prev.threes[2] + s.threes[2], prev.threes[3] + s.threes[3]];
    } else if (s.seconds > 0 || s.homePoints || s.awayPoints || s.threes[0] || s.threes[2]) {
      merged.push({ ...s });
    }
  }
  return merged.map((s) => [s.home, s.away, Math.round(s.seconds * 10) / 10, s.homePoints, s.awayPoints, ...s.threes]);
}

/**
 * The largest gap, in minutes, between a player's minutes in `game` and his MIN in the summary's box score, over
 * the players with a MIN who played by either count; null when the box score has no minutes.
 */
export function minutesGap(game: readonly Stint[], summary: EspnSummary): number | null {
  const seconds = new Map<Athlete, number>();
  for (const [home, away, s] of game) for (const a of [...home, ...away]) seconds.set(a, (seconds.get(a) ?? 0) + s);
  const gaps = [...rosterOf(summary, sideIds(summary))].flatMap(([a, p]) =>
    p.minutes !== null && (p.minutes > 0 || seconds.has(a)) ? [Math.abs((seconds.get(a) ?? 0) / 60 - p.minutes)] : [],
  );
  return gaps.length ? Math.max(...gaps) : null;
}

/** A game's three-point shots by side, summed over its stints. */
export const threes = (game: readonly Stint[]): Threes =>
  game.reduce<Threes>((t, s) => [t[0] + s[5], t[1] + s[6], t[2] + s[7], t[3] + s[8]], [0, 0, 0, 0]);

/**
 * Each side's three-point shots in the summary's box score, its players' 3PT lines added up; null when a side has
 * none, as in the box scores of 2015-16 to 2017-18 that ESPN left blank, since no team goes a game without a three.
 */
export function boxThrees(summary: EspnSummary): Threes | null {
  const ids = sideIds(summary);
  const total: Threes = [0, 0, 0, 0];
  for (const team of summary.boxscore?.players ?? []) {
    const side = SIDES.find((s) => ids[s] === team.team.id);
    if (!side) continue;
    for (const group of team.statistics ?? []) {
      const column = (group.labels ?? []).indexOf("3PT");
      for (const a of group.athletes ?? []) {
        const line = column < 0 ? null : a.stats?.[column]?.match(/^(\d+)-(\d+)$/);
        if (!line) continue;
        total[side === "home" ? 0 : 2] += Number(line[2]);
        total[side === "home" ? 1 : 3] += Number(line[1]);
      }
    }
  }
  return total[0] && total[2] ? total : null;
}

/** A game's points by side, summed over its stints. */
const points = (game: readonly Stint[]): [home: number, away: number] =>
  game.reduce<[number, number]>(([h, a], s) => [h + s[3], a + s[4]], [0, 0]);

/**
 * The final games whose summary the refresh should read: those without a box score, without a record, or whose
 * record's points miss the final score, since ESPN's feed now and then catches up on a scoring change after the game.
 */
export const needsSummary = (finals: readonly Game[], box: SeasonBox, record: SeasonStints): Game[] =>
  finals.filter((g) => {
    const game = record.games[g.id];
    if (!box.games[g.id] || !game) return true;
    const [h, a] = points(game);
    return h !== g.hs || a !== g.as;
  });

export type Outcome<T> = { ok: true; value: T } | { ok: false; reason: string };
const attempt = <T>(f: () => T): Outcome<T> => {
  try {
    return { ok: true, value: f() };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
};

/** What the refresh saves from one game's summary. The box score and the record each fail on their own. */
export const fromSummary = (summary: EspnSummary) => ({
  names: playerNames(summary),
  box: attempt(() => boxLines(summary)),
  stints: attempt(() => stints(summary)),
});

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isAthletes = (v: unknown): v is Athlete[] => Array.isArray(v) && v.every((x) => Number.isSafeInteger(x) && x > 0);
const isStint = (v: unknown): v is Stint => Array.isArray(v) && v.length === 9 && isAthletes(v[0]) && isAthletes(v[1]) && v.slice(2).every(isCount);

export function parseStints(raw: unknown, season: string): SeasonStints {
  const where = `scripts/stints/${season}.json`;
  if (!isRecord(raw) || raw.season !== season || !isRecord(raw.games)) throw new Error(`${where}: expected { season: "${season}", games }`);
  const games: SeasonStints["games"] = {};
  for (const [game, list] of Object.entries(raw.games)) {
    if (!Array.isArray(list) || !list.every(isStint)) throw new Error(`${where}: game ${game} has a malformed stint`);
    games[game] = list;
  }
  return { season, games };
}

/** The record as its file holds it, one game a line, in `order` (the games file's), then any other game by id. */
export function formatStints(record: SeasonStints, order: readonly string[]): string {
  const ids = [...new Set([...order, ...Object.keys(record.games)])].filter((id) => record.games[id]);
  const lines = ids.map((id) => `\n${JSON.stringify(id)}:${JSON.stringify(record.games[id])}`);
  return `{"season":${JSON.stringify(record.season)},"games":{${lines.join(",")}\n}}\n`;
}
