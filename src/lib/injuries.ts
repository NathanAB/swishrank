// ESPN's injury report, archived once a day by the fetch into src/data/injuries/<season>.json. Nothing on the site
// reads it yet: it is kept for docs/model-v2.md's judgment of expected minutes (src/lib/rotation.ts) against the
// usual rotation. Only the structured fields are kept: the report's comments are third-party prose, and the
// repository is public.
import { dayKey, type Abbr, type Game } from "./elo.ts";
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
/** One day's report: when the fetch saved it, as an ISO time, and its entries. */
export type Report = { fetched: string; injuries: Injury[] };
/** A season's archive: the report as the first fetch of each US Eastern day saw it, by that day. */
export type InjuryArchive = { season: string; days: Record<string, Report> };

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
  for (const [day, report] of Object.entries(raw.days)) {
    const fetched = isRecord(report) ? text(report.fetched) : undefined;
    if (!isDay(day) || !isRecord(report) || !fetched || Number.isNaN(Date.parse(fetched)) || !Array.isArray(report.injuries)) {
      throw new Error(`${where}: ${day} is not a day with the time it was fetched and a list of injuries`);
    }
    days[day] = {
      fetched,
      injuries: report.injuries.map((e) => {
        const parsed = isRecord(e) ? injury(e) : null;
        if (!parsed) throw new Error(`${where}: ${day} has a malformed injury ${JSON.stringify(e).slice(0, 120)}`);
        return parsed;
      }),
    };
  }
  return { season: id, days };
}

/** The archive with `report` as `day`'s, unless the day already has one: the day's first fetch stands. */
export const withReport = (archive: InjuryArchive, day: string, report: Report): InjuryArchive =>
  day in archive.days
    ? archive
    : { season: archive.season, days: Object.fromEntries(Object.entries({ ...archive.days, [day]: report }).sort(([x], [y]) => x.localeCompare(y))) };

/**
 * The archive's reports fetched before their day's first tip-off, the only ones that say what was known before
 * its games. A report fetched later, by a retry or a run by hand, is left out. A day without games keeps its report.
 */
export function beforeTip(archive: InjuryArchive, games: readonly Pick<Game, "t">[]): InjuryArchive {
  const tip = new Map<string, number>();
  for (const { t } of games) tip.set(dayKey(t), Math.min(Date.parse(t), tip.get(dayKey(t)) ?? Infinity));
  return { season: archive.season, days: Object.fromEntries(Object.entries(archive.days).filter(([day, r]) => Date.parse(r.fetched) < (tip.get(day) ?? Infinity))) };
}
