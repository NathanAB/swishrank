// ESPN's injury report, archived once a day by the fetch into src/data/injuries/<season>.json, for the expected
// minutes behind each team's shown rating (src/lib/rotation.ts). Only the structured fields are kept: the
// report's comments are third-party prose, and the repository is public.
import type { Abbr } from "./elo.ts";
import type { Athlete } from "./players.ts";

/** One player on the report. `returnDate` is ESPN's projected return, a US Eastern day. */
export type Injury = {
  athlete: Athlete;
  team: Abbr;
  status: string;
  date: string;
  returnDate?: string;
  type?: string;
  location?: string;
  detail?: string;
  side?: string;
};
/** A season's archive: the report as the first fetch of each US Eastern day saw it, by that day. */
export type InjuryArchive = { season: string; days: Record<string, Injury[]> };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const text = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const DESCRIBED = ["type", "location", "detail", "side"] as const;

/** An entry with the fields the archive keeps, or null when one the model reads is missing or malformed. */
function injury(fields: Record<string, unknown>): Injury | null {
  const { athlete, returnDate } = fields;
  const team = text(fields.team), status = text(fields.status), date = text(fields.date);
  if (typeof athlete !== "number" || !Number.isInteger(athlete) || athlete <= 0) return null;
  if (!team || !status || !date || Number.isNaN(Date.parse(date))) return null;
  if (returnDate !== undefined && !isDay(returnDate)) return null;
  const out: Injury = { athlete, team, status, date };
  if (returnDate !== undefined) out.returnDate = returnDate;
  for (const key of DESCRIBED) {
    const value = text(fields[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** ESPN gives an athlete's id only inside his links, as in https://www.espn.com/nba/player/_/id/4433255/chet-holmgren. */
function athleteId(athlete: Record<string, unknown>): number | undefined {
  for (const link of Array.isArray(athlete.links) ? athlete.links : []) {
    const id = isRecord(link) && typeof link.href === "string" ? /\/id\/(\d+)\//.exec(link.href)?.[1] : undefined;
    if (id) return Number(id);
  }
  return undefined;
}

/**
 * ESPN's report (site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries): the season it is for, as
 * "2026-27", and every entry the archive can keep. An entry without an athlete id, a team, a status or a date,
 * or with a return date that is not a day, is dropped and counted.
 */
export function parseFeed(raw: unknown): { season: string | undefined; injuries: Injury[]; dropped: number } {
  const season = isRecord(raw) && isRecord(raw.season) ? text(raw.season.displayName) : undefined;
  const injuries: Injury[] = [];
  let dropped = 0;
  for (const team of isRecord(raw) && Array.isArray(raw.injuries) ? raw.injuries : []) {
    for (const entry of isRecord(team) && Array.isArray(team.injuries) ? team.injuries : []) {
      const athlete = isRecord(entry) && isRecord(entry.athlete) ? entry.athlete : {};
      const details = isRecord(entry) && isRecord(entry.details) ? entry.details : {};
      const parsed = isRecord(entry)
        ? injury({
            ...Object.fromEntries(DESCRIBED.map((key) => [key, details[key]])),
            athlete: athleteId(athlete),
            team: isRecord(athlete.team) ? athlete.team.abbreviation : undefined,
            status: entry.status,
            date: entry.date,
            returnDate: details.returnDate,
          })
        : null;
      if (parsed) injuries.push(parsed);
      else dropped++;
    }
  }
  return { season, injuries, dropped };
}

/** `raw` as `id`'s archive, from src/data/injuries/<id>.json. The fetch wrote it, so anything malformed throws. */
export function parseArchive(raw: unknown, id: string): InjuryArchive {
  const where = `src/data/injuries/${id}.json`;
  if (!isRecord(raw) || raw.season !== id || !isRecord(raw.days)) throw new Error(`${where}: expected { season: "${id}", days }`);
  const days: InjuryArchive["days"] = {};
  for (const [day, entries] of Object.entries(raw.days)) {
    if (!isDay(day) || !Array.isArray(entries)) throw new Error(`${where}: ${day} is not a day with a list of injuries`);
    days[day] = entries.map((e) => {
      const parsed = isRecord(e) ? injury(e) : null;
      if (!parsed) throw new Error(`${where}: ${day} has a malformed injury ${JSON.stringify(e).slice(0, 120)}`);
      return parsed;
    });
  }
  return { season: id, days };
}

/** The archive with `injuries` as `day`'s report, unless the day already has one: the day's first fetch stands. */
export const withReport = (archive: InjuryArchive, day: string, injuries: Injury[]): InjuryArchive =>
  day in archive.days
    ? archive
    : { season: archive.season, days: Object.fromEntries(Object.entries({ ...archive.days, [day]: injuries }).sort(([x], [y]) => x.localeCompare(y))) };
