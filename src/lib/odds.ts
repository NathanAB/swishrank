// What the site shows of a season's odds (src/lib/project.ts): each team's projected record and its chances of a
// top-6 seed, the play-in, the playoffs, the Finals, the title and the first draft pick, and its title and playoff
// chances on every day of the season so far, for the title race and the week's changes.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Abbr } from "./elo.ts";
import { meanWins, simulate, type Projection, type Setup } from "./project.ts";

/** Seasons played out for the day's odds, and for each earlier day's. */
export const RUNS = 20_000;
export const HISTORY_RUNS = 2_000;

/** One team's odds, each chance in percent to a tenth; `seed` holds seeds 1 to 15 in its conference. */
export type TeamOdds = { wins: number; top6: number; playIn: number; playoffs: number; finals: number; title: number; firstPick: number; seed: number[] };
/** Every team's title and playoff chances at the end of a day. */
export type OddsDay = { day: string; title: Record<Abbr, number>; playoffs: Record<Abbr, number> };
/** A season's odds after its latest day, and its days so far, the latest's from the same odds. */
export type SeasonOdds = { day: string; teams: Record<Abbr, TeamOdds>; history: OddsDay[] };

const tenth = (count: number, runs: number) => Math.round((1000 * count) / runs) / 10;

/** A projection's odds for each team. */
export function teamOdds(p: Projection): Record<Abbr, TeamOdds> {
  return Object.fromEntries(Object.entries(p.teams).map(([abbr, o]) => [abbr, {
    wins: Math.round(meanWins(o.wins) * 10) / 10,
    top6: tenth(o.seed.slice(0, 6).reduce((s, x) => s + x, 0), p.runs),
    playIn: tenth(o.playIn, p.runs),
    playoffs: tenth(o.playoffs, p.runs),
    finals: tenth(o.finals, p.runs),
    title: tenth(o.title, p.runs),
    firstPick: tenth(o.pick[0], p.runs),
    seed: o.seed.map((c) => tenth(c, p.runs)),
  }]));
}

/** A day of the title race from a projection. */
export const oddsDay = (day: string, p: Projection): OddsDay => ({
  day,
  title: Object.fromEntries(Object.entries(p.teams).map(([a, o]) => [a, tenth(o.title, p.runs)])),
  playoffs: Object.fromEntries(Object.entries(p.teams).map(([a, o]) => [a, tenth(o.playoffs, p.runs)])),
});

/** A finished season's title race as src/data/odds/<season>.json keeps it: one list a team, a value a day. */
export type HistoryFile = { season: string; runs: number; days: string[]; title: Record<Abbr, number[]>; playoffs: Record<Abbr, number[]> };

export function toHistoryFile(season: string, runs: number, days: readonly OddsDay[]): HistoryFile {
  const abbrs = Object.keys(days[0]?.title ?? {}).sort();
  return {
    season, runs,
    days: days.map((d) => d.day),
    title: Object.fromEntries(abbrs.map((a) => [a, days.map((d) => d.title[a])])),
    playoffs: Object.fromEntries(abbrs.map((a) => [a, days.map((d) => d.playoffs[a])])),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isSeries = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every((x) => typeof x === "number");

/** A history file as read from JSON, as days; undefined when there is none. */
export function parseHistory(raw: unknown, id: string): OddsDay[] | undefined {
  if (raw === undefined) return undefined;
  const where = `src/data/odds/${id}.json`;
  if (!isRecord(raw) || raw.season !== id || !Array.isArray(raw.days) || !isRecord(raw.title) || !isRecord(raw.playoffs)) throw new Error(`${where}: expected { season: "${id}", days, title, playoffs }`);
  const days = raw.days.map(String);
  const { title, playoffs } = raw;
  for (const [a, v] of [...Object.entries(title), ...Object.entries(playoffs)]) if (!isSeries(v, days.length)) throw new Error(`${where}: ${a} needs one number a day`);
  return days.map((day, i) => ({
    day,
    title: Object.fromEntries(Object.entries(title).map(([a, v]) => [a, (v as number[])[i]])),
    playoffs: Object.fromEntries(Object.entries(playoffs).map(([a, v]) => [a, (v as number[])[i]])),
  }));
}

/**
 * Where a build keeps each day's odds for the next one, from SWISHRANK_CACHE, or nowhere when it is unset. A day's
 * odds are kept under a key made from the simulation's code and everything the day's setup holds, so a day whose
 * games, ratings or schedule change is played out again. Tests and the dev server leave it unset.
 */
const CACHE = process.env.SWISHRANK_CACHE ? join(process.env.SWISHRANK_CACHE, "odds") : null;
let code: string | undefined;
const codeHash = () => (code ??= createHash("sha256").update(readFileSync(join(process.cwd(), "src", "lib", "project.ts"))).digest("hex"));

/** One day's title race, from the cache when its key still matches, else played out and kept there. */
export function historyDay(season: string, setup: Setup, seed: number): OddsDay {
  const run = () => oddsDay(setup.today, simulate(setup, HISTORY_RUNS, seed));
  if (!CACHE) return run();
  const key = createHash("sha256").update(codeHash()).update(JSON.stringify(setup)).update(`${HISTORY_RUNS} ${seed}`).digest("hex");
  const file = join(CACHE, season, `${setup.today}.json`);
  try {
    const kept = JSON.parse(readFileSync(file, "utf8")) as { key: string; day: OddsDay };
    if (kept.key === key) return kept.day;
  } catch {
    // No file yet, or one this build cannot read: play the day out.
  }
  const day = run();
  try {
    mkdirSync(join(CACHE, season), { recursive: true });
    writeFileSync(file, JSON.stringify({ key, day }));
  } catch {
    // A build that cannot write the cache still has its odds.
  }
  return day;
}

/** A seed for a day, so each day's odds are the same every build. */
export const daySeed = (day: string) => Number(day.replaceAll("-", ""));
