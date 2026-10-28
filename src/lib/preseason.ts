// Preseason win totals, version 2's team seeds (docs/model-v2.md): src/data/preseason/<season>.json, entered
// by hand before each opening night, with the page each season's totals came from.
import type { Abbr } from "./elo.ts";

/** Each team's over/under win total, set for a season of `games` games. */
export type Preseason = { season: string; games: number; totals: Record<Abbr, number>; source: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** `raw` as `id`'s totals, which must name every one of `abbrs` and nothing else. */
export function parsePreseason(raw: unknown, id: string, abbrs: readonly Abbr[]): Preseason {
  const where = `src/data/preseason/${id}.json`;
  if (!isRecord(raw) || raw.season !== id || typeof raw.games !== "number" || !isRecord(raw.totals) || typeof raw.source !== "string") {
    throw new Error(`${where}: expected { season: "${id}", games, totals, source }`);
  }
  const totals: Record<Abbr, number> = {};
  for (const [abbr, w] of Object.entries(raw.totals)) {
    if (typeof w !== "number" || w <= 0 || w >= raw.games) throw new Error(`${where}: ${abbr}'s total ${String(w)} is not a win count`);
    totals[abbr] = w;
  }
  const named = Object.keys(totals).sort().join(), teams = [...abbrs].sort().join();
  if (named !== teams) throw new Error(`${where}: totals name ${named}, the season's teams are ${teams}`);
  return { season: id, games: raw.games, totals, source: raw.source };
}
