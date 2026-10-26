// A season's final games as the games pages show them: one page per US Eastern calendar month, each
// day's games together. Every month has its own URL that never changes, and the games index shows the newest
// month as well, so the page a reader reaches from the nav always holds the latest games.
import type { Result, Season } from "./elo.ts";
import type { Route, SeasonRef } from "./routes.ts";

/** One game day: its US Eastern day key and its games in tip-off order. */
export type Day = { day: string; results: Result[] };

/** One calendar month of results: its "YYYY-MM" key and its game days, newest first. */
export type Month = { key: string; days: Day[] };

/** The months that have final games, oldest first, which is the order the month switch shows them. */
export function months(model: Season): Month[] {
  const days = new Map<string, Result[]>();
  for (const r of model.results) days.set(r.day, [...(days.get(r.day) ?? []), r]);
  const out = new Map<string, Month>();
  for (const day of [...days.keys()].sort().reverse()) {
    const key = day.slice(0, 7);
    const month = out.get(key) ?? { key, days: [] };
    month.days.push({ day, results: days.get(day) ?? [] });
    out.set(key, month);
  }
  return [...out.values()].reverse();
}

/** Every game in a month, newest day first. */
export const gamesIn = (month: Month) => month.days.flatMap((d) => d.results);

/** Where a month's page lives: under its key, the newest month included, so a shared link keeps its month. */
export const monthRoute = (season: SeasonRef, key: string): Route => ({ kind: "games", season, month: key });
