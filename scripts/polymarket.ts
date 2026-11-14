// Polymarket's chance for every final game, for reporting beside Vegas (scripts/vegas.ts): the home side's last
// traded price at or before ESPN's scheduled tip, from Polymarket's public read-only APIs.
//
//   node scripts/polymarket.ts 2025-26     adds the games scripts/polymarket/<season>.json lacks
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Abbr, Game, Team } from "../src/lib/elo.ts";
import { loadSeason } from "./evaluate.ts";

/** A season's prices, from scripts/polymarket/<season>.json: game id to the home side's chance, and to USD traded. */
export type Polymarket = { season: string; chances: Record<string, number>; volume: Record<string, number> };
/** One point of a token's price history: unix seconds and price. */
export type Point = { t: number; p: number };
export type Reject = "closed early" | "no recent price" | "stale extreme";

// Event slugs are nba-{away}-{home}-{ET date}; props, futures and older formats don't match.
const SLUG = /^nba-([a-z]{3})-([a-z]{3})-(\d{4}-\d{2}-\d{2})$/;
const HOUR = 3600;

export function parseSlug(slug: string): { away: string; home: string; date: string } | null {
  const m = SLUG.exec(slug);
  return m ? { away: m[1], home: m[2], date: m[3] } : null;
}

/** Polymarket's team abbreviation to ESPN's, by Polymarket's team name against ESPN's short name; All-Star sides drop out. */
export function abbrMap(poly: readonly { abbreviation: string; name: string }[], espn: Record<Abbr, Team>): Record<string, Abbr> {
  const byShort = new Map(Object.entries(espn).map(([abbr, t]) => [t.short, abbr]));
  return Object.fromEntries(poly.flatMap((t) => (byShort.has(t.name) ? [[t.abbreviation, byShort.get(t.name)!]] : [])));
}

export const lastAtOrBefore = (history: readonly Point[], cutoff: number): Point | null =>
  history.reduce<Point | null>((best, pt) => (pt.t <= cutoff && (!best || pt.t >= best.t) ? pt : best), null);

const DAY = 86400e3;

// Outcomes mostly carry the team's short name, but a few 2024-25 playoff markets wrote "Twolves" or "T-Wolves".
const norm = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^twolves$/, "timberwolves");
export const sameTeam = (outcome: string, short: string) => norm(outcome) === norm(short);

/**
 * Each game's event among those for the same two sides: the one dated the game's ET day, else one a day either
 * side (some slugs carry the UTC date), else the latest earlier one no game claimed (a postponed game's event
 * keeps its original date). Each pass runs over every game before the next, so a looser pass never takes an
 * event that a closer one would give another game.
 */
export function pairEvents<E extends { date: string; pair: string }>(games: readonly { id: string; date: string; pair: string }[], events: readonly E[]): Map<string, E> {
  const out = new Map<string, E>(), used = new Set<E>();
  for (const fits of [(d: number) => d === 0, (d: number) => Math.abs(d) === 1, (d: number) => d > 1]) {
    for (const g of games) {
      if (out.has(g.id)) continue;
      const e = events
        .filter((e) => !used.has(e) && e.pair === g.pair && fits((Date.parse(g.date) - Date.parse(e.date)) / DAY))
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (e) (out.set(g.id, e), used.add(e));
    }
  }
  return out;
}

/**
 * Why a price can't stand for the pre-game market, or null when it can. A market that closed within 2 hours of
 * the cutoff was decided before it (the tip moved earlier), so its last price is in-game or settled; a price
 * of 0.97 or more, or 0.03 or less, whose last trade is over 30 minutes old is a dead book, while a live one is a real
 * heavy favourite.
 */
export function reject(cutoff: number, closed: number | null, last: Point | null): Reject | null {
  if (closed !== null && closed < cutoff + 2 * HOUR) return "closed early";
  if (!last || last.t < cutoff - 6 * HOUR) return "no recent price";
  if ((last.p >= 0.97 || last.p <= 0.03) && last.t < cutoff - 30 * 60) return "stale extreme";
  return null;
}

const file = (season: string) => new URL(`polymarket/${season}.json`, import.meta.url);

export function loadPolymarket(season: string): Polymarket {
  try {
    return { volume: {}, ...JSON.parse(readFileSync(file(season), "utf8")) };
  } catch {
    return { season, chances: {}, volume: {} };
  }
}

const savePolymarket = (pm: Polymarket) => {
  mkdirSync(new URL("polymarket/", import.meta.url), { recursive: true });
  writeFileSync(file(pm.season), JSON.stringify(pm) + "\n");
};

const GAMMA = "https://gamma-api.polymarket.com", CLOB = "https://clob.polymarket.com", DATA = "https://data-api.polymarket.com";
// Series 2 is "nba" (through 2024-25), 10345 "nba-2026" (2025-26 on).
const seriesOf = (season: string) => (season <= "2024-25" ? 2 : 10345);
const etDate = (iso: string | number) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
// Gamma writes times as "2025-01-21 03:41:07+00".
const secs = (s: string | null | undefined) => (s ? Date.parse(s.replace(" ", "T").replace(/\+00$/, "Z")) / 1000 : null);

let active = 0;
const queue: (() => void)[] = [];
// At most 8 requests in flight, with backoff on 429, 5xx and network errors.
async function get<T>(url: string): Promise<T> {
  if (active >= 8) await new Promise<void>((go) => queue.push(go));
  active++;
  try {
    for (let i = 0; ; i++) {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (generic research client)" } }).catch(() => null);
      if (res?.ok) return (await res.json()) as T;
      if (i >= 5 || (res && res.status !== 429 && res.status < 500)) throw new Error(`${url}: ${res ? `HTTP ${res.status}` : "network error"}`);
      await new Promise((s) => setTimeout(s, 1000 * 2 ** i));
    }
  } finally {
    active--;
    queue.shift()?.();
  }
}

type Market = { slug: string; sportsMarketType?: string; outcomes: string; clobTokenIds: string; closedTime?: string; volumeNum?: number; conditionId: string };
type Event = { id: string; slug: string; markets?: Market[] };

async function events(series: number, from: string, to: string): Promise<Event[]> {
  // A game event's endDate is usually tip time, but some sit days later (2024-25 playoffs, a week), so the window runs wide.
  const min = new Date(Date.parse(from) - 2 * DAY).toISOString(), max = new Date(Date.parse(to) + 14 * DAY).toISOString();
  const out: Event[] = [];
  let cursor: string | undefined;
  do {
    const page = await get<{ events: Event[]; next_cursor?: string }>(
      `${GAMMA}/events/keyset?series_id=${series}&closed=any&limit=100&end_date_min=${min}&end_date_max=${max}` + (cursor ? `&after_cursor=${encodeURIComponent(cursor)}` : ""),
    );
    out.push(...page.events);
    cursor = page.next_cursor;
  } while (cursor);
  return out;
}

// The game's market has the event's slug, though some 2024-25 ones carry ESPN-style abbreviations instead;
// sportsMarketType is sometimes mislabeled, so it is only the fallback.
const moneyline = (e: Event) => e.markets?.find((m) => m.slug === e.slug) ?? e.markets?.find((m) => m.sportsMarketType === "moneyline");

// Gamma leaves volume off some markets; the data API's taker volume fills them.
async function volumeOf(e: Event, m: Market): Promise<number | null> {
  if (typeof m.volumeNum === "number") return m.volumeNum;
  const lv = await get<{ data?: { conditions?: { condition_id: string; taker_volume?: number }[] } }>(`${DATA}/v2/live-volume?event_id=${e.id}`).catch(() => null);
  return lv?.data?.conditions?.find((c) => c.condition_id === m.conditionId)?.taker_volume ?? null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const polyTeams = await get<{ abbreviation: string; name: string; league: string }[]>(`${GAMMA}/teams?league=nba&limit=100`);
  for (const season of process.argv.slice(2)) {
    const data = loadSeason(season), pm = loadPolymarket(season);
    const toEspn = abbrMap(polyTeams, data.teams);
    const missing = data.games.filter((g) => g.final && !(g.id in pm.chances));
    const counts: Record<string, number> = {};
    const miss = (why: string) => (counts[why] = (counts[why] ?? 0) + 1);
    if (missing.length) {
      // Every final game takes part in pairing, so an event a played game owns never goes to a missing one.
      const games = data.games.filter((g) => g.final).map((g) => ({ ...g, date: etDate(g.t), pair: [g.away, g.home].sort().join(" ") }));
      const dates = games.map((g) => g.date).sort();
      const usable = (await events(seriesOf(season), dates[0], dates.at(-1)!)).flatMap((e) => {
        const s = parseSlug(e.slug), away = s && toEspn[s.away], home = s && toEspn[s.home], m = moneyline(e);
        return s && away && home && m ? [{ e, m, date: s.date, pair: [away, home].sort().join(" ") }] : [];
      });
      const paired = pairEvents(games, usable);
      await Promise.all(missing.map((g) => price(g).catch((err) => (console.error(err.message), miss("fetch error")))));
      async function price(g: Game) {
        const found = paired.get(g.id), at = `${g.id} ${etDate(g.t)} ${g.away}@${g.home}`;
        if (!found) return (console.error(`no event: ${at}`), miss("no event"));
        const { e, m } = found;
        const outcomes: string[] = JSON.parse(m.outcomes), tokens: string[] = JSON.parse(m.clobTokenIds);
        const hi = outcomes.findIndex((o) => sameTeam(o, data.teams[g.home].short));
        if (hi < 0 || !sameTeam(outcomes[1 - hi], data.teams[g.away].short)) return (console.error(`outcome mismatch: ${at} ${m.outcomes}`), miss("outcome mismatch"));
        const cutoff = Date.parse(g.t) / 1000;
        const { history } = await get<{ history: Point[] }>(`${CLOB}/prices-history?market=${tokens[hi]}&startTs=${cutoff - 6 * HOUR}&endTs=${cutoff}&fidelity=1`);
        const last = lastAtOrBefore(history, cutoff), why = reject(cutoff, secs(m.closedTime), last);
        if (why) return (console.error(`${why}: ${at} ${e.slug}`), miss(why));
        pm.chances[g.id] = last!.p;
        const vol = await volumeOf(e, m);
        if (vol !== null) pm.volume[g.id] = Math.round(vol);
      }
    }
    savePolymarket(pm);
    const finals = data.games.filter((g) => g.final).length, priced = Object.keys(pm.chances).length;
    console.log(`${season}: ${priced} of ${finals} final games priced (${((100 * priced) / finals).toFixed(1)}%), ${missing.length} looked up`, counts);
  }
}
