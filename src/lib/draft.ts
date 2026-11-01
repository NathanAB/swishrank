// Each player's draft, for version 4's top-three picks (docs/model-v4.md), kept in src/data/draft.json by athlete id:
// [year, round, overall pick], or 0 for a player ESPN lists as undrafted. A player missing from the file has not been
// looked up yet; the fetch looks up everyone in the box scores who is.
import type { Athlete } from "./players.ts";

export type Drafted = [year: number, round: number, pick: number];
export type DraftFile = Record<string, Drafted | 0>;

/** ESPN's athlete page's displayDraft, as in "2022: Rd 1, Pk 2 (OKC)", as [2022, 1, 2]; 0 when there is none. */
export function parseDraft(display: unknown): Drafted | 0 {
  if (typeof display !== "string" || !display) return 0;
  const m = /^(\d{4}): Rd (\d+), Pk (\d+)/.exec(display);
  if (!m) throw new Error(`unreadable draft "${display}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Whether `athlete` was drafted in the first round with one of the first `picks` picks, in the season's draft year
 * or up to `years` before it. A season's draft year is the year it starts: 2026 for 2026-27.
 */
export function topPick(draft: Readonly<DraftFile>, athlete: Athlete, season: string, picks = 3, years = 3): boolean {
  const d = draft[athlete];
  const year = Number(season.slice(0, 4));
  return Array.isArray(d) && d[1] === 1 && d[2] <= picks && d[0] <= year && d[0] >= year - years;
}
