// Vegas's chance for every final game, for reporting only: scripts/backtest-v2.ts scores version 2 against it and
// never chooses by it. ESPN stores each game's pre-game odds from several sportsbooks; docs/model-v2.md's data
// section says how they become one chance.
//
//   node scripts/vegas.ts 2025-26     adds the games scripts/vegas/<season>.json lacks
import { readFileSync, writeFileSync } from "node:fs";
import { phi } from "../src/lib/elo.ts";
import { loadSeason } from "./evaluate.ts";

/** One sportsbook's line: the home spread and both moneylines, any of which ESPN may leave out. */
export type Book = { name: string; spread: number | null; hml: number | null; aml: number | null };
/** A season's chances, from scripts/vegas/<season>.json: game id to the home side's chance. */
export type Vegas = { season: string; chances: Record<string, number> };

// In-game and opening lines, and model sites rather than books.
const NOT_BOOKS = /consensus|accuscore|numberfire|teamrankings|live|opening|betegy/i;
// A spread of s points makes the home side about Phi(-s / 13.15), the spread-to-chance scale the check below uses.
const SPREAD_SCALE = 13.15;
const implied = (ml: number) => (ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100));
const sane = (ml: number | null): ml is number => ml !== null && Math.abs(ml) >= 100 && Math.abs(ml) < 20000;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * The home side's chance: each pre-game book's moneylines with its cut removed by scaling the two to sum to 1,
 * less any book more than 0.2 of chance from its own spread, then the median. Null with no book left.
 */
export function chance(books: readonly Book[]): number | null {
  const ps = books.flatMap((b) => {
    if (NOT_BOOKS.test(b.name) || !sane(b.hml) || !sane(b.aml)) return [];
    const h = implied(b.hml), a = implied(b.aml), p = h / (h + a);
    return b.spread !== null && Math.abs(p - phi(-b.spread / SPREAD_SCALE)) > 0.2 ? [] : [p];
  });
  return ps.length ? median(ps) : null;
}

const file = (season: string) => new URL(`vegas/${season}.json`, import.meta.url);

export function loadVegas(season: string): Vegas {
  try {
    return JSON.parse(readFileSync(file(season), "utf8"));
  } catch {
    return { season, chances: {} };
  }
}

export const saveVegas = (v: Vegas) => writeFileSync(file(v.season), JSON.stringify(v) + "\n");

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
type CoreOdds = { items?: { provider?: { name?: string }; spread?: unknown; homeTeamOdds?: { moneyLine?: unknown }; awayTeamOdds?: { moneyLine?: unknown } }[] };
const ODDS = (id: string) => `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/${id}/competitions/${id}/odds`;

// A game ESPN has no odds for answers 404.
async function booksOf(id: string): Promise<Book[]> {
  const res = await fetch(ODDS(id));
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`ESPN odds for ${id}: HTTP ${res.status}`);
  const odds = (await res.json()) as CoreOdds;
  return (odds.items ?? []).map((it) => ({ name: String(it.provider?.name ?? "?"), spread: num(it.spread), hml: num(it.homeTeamOdds?.moneyLine), aml: num(it.awayTeamOdds?.moneyLine) }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const season of process.argv.slice(2)) {
    const v = loadVegas(season);
    const missing = loadSeason(season).games.filter((g) => g.final && !(g.id in v.chances)).map((g) => g.id);
    for (let i = 0; i < missing.length; i += 8) {
      await Promise.all(missing.slice(i, i + 8).map(async (id) => {
        const p = chance(await booksOf(id).catch(() => []));
        if (p !== null) v.chances[id] = p;
      }));
    }
    saveVegas(v);
    console.log(`${season}: ${Object.keys(v.chances).length} games with a line, ${missing.length} looked up`);
  }
}
