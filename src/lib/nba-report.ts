// The NBA's official injury report (docs/model-v4.md): the league publishes it as a PDF through the day, and the
// fetch reads it with pdftotext -layout. This module turns that text into entries, matches each name to an ESPN
// athlete id, and keeps, for each game, the latest report saved before its tip-off, in
// src/data/nba-reports/<season>.json. Only names, teams and statuses are kept: the report's reasons are the
// league's prose, and the repository is public.
import { dayKey, type Abbr, type Game, type SeasonData } from "./elo.ts";
import type { Athlete } from "./players.ts";

export const NBA_STATUSES = ["Out", "Doubtful", "Questionable", "Probable", "Available"] as const;
export type NbaStatus = (typeof NBA_STATUSES)[number];
const STATUS = new Set<string>(NBA_STATUSES);

/** One player on a report: his game's US Eastern day, his team, his name as the report gives it ("Last, First"), his status. */
export type NbaEntry = { date: string; team: Abbr; name: string; status: NbaStatus };
/** A team on a report for a game day, and whether it had submitted its part. */
export type NbaTeam = { date: string; team: Abbr; submitted: boolean };
/**
 * A report: when it says it was published, as a US Eastern "YYYY-MM-DDTHH:MM", or null when the text has no title,
 * every team it lists and every player entry.
 */
export type NbaReport = { published: string | null; teams: NbaTeam[]; entries: NbaEntry[] };

/** A name for matching: no accents, case, dots, apostrophes, hyphens or suffixes such as "Jr." and "III". */
export const normName = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.'’]/g, "").replace(/-/g, " ")
    .split(/\s+/).filter((w) => w && !["jr", "sr", "ii", "iii", "iv", "v"].includes(w)).join(" ");

/** Every team's full name, and "LA Clippers"'s other spelling, to its abbreviation, as normName keys. */
export function teamNames(data: SeasonData): Map<string, Abbr> {
  const out = new Map<string, Abbr>();
  for (const [abbr, team] of Object.entries(data.teams)) out.set(normName(team.name), abbr);
  if (data.teams.LAC) for (const name of ["LA Clippers", "Los Angeles Clippers"]) out.set(normName(name), "LAC");
  return out;
}

const DATE = /^(\d\d)\/(\d\d)\/(\d{4})$/;
const TITLE = /Injury Report:\s*(\d\d)\/(\d\d)\/(\d\d)\s+(\d\d):(\d\d)\s*(AM|PM)/;
const NOT_A_NAME = /Injury|Illness|League|Protocol|Rest|Suspension|Personal|Health|Not With Team/;

/**
 * A report's text as pdftotext -layout gives it. Columns sit two or more spaces apart, and a game's date, matchup and
 * team are printed on its first line only, so each carries down to the lines after it. A player's line is the first
 * cell before the status cell shaped "Last, First"; lines without a status, such as a reason wrapped onto its own
 * line, are skipped. A team marked NOT YET SUBMITTED is listed and has no entries.
 */
export function parseReportText(text: string, teams: ReadonlyMap<string, Abbr>): NbaReport {
  const title = TITLE.exec(text);
  const published = title
    ? `20${title[3]}-${title[1]}-${title[2]}T${String((Number(title[4]) % 12) + (title[6] === "PM" ? 12 : 0)).padStart(2, "0")}:${title[5]}`
    : null;
  const listed = new Map<string, NbaTeam>();
  const entries: NbaEntry[] = [];
  let date = "", team = "";
  for (const line of text.split("\n")) {
    const cells = line.trim().split(/\s{2,}/).filter(Boolean);
    for (const c of cells) {
      const d = DATE.exec(c);
      // A new game day names its team again, so a team never carries over from the day before.
      if (d && `${d[3]}-${d[1]}-${d[2]}` !== date) { date = `${d[3]}-${d[1]}-${d[2]}`; team = ""; }
      const t = teams.get(normName(c));
      if (t && date) {
        team = t;
        if (!listed.has(`${date}|${t}`)) listed.set(`${date}|${t}`, { date, team: t, submitted: true });
      }
    }
    if (!date || !team) continue;
    if (/NOT YET SUBMITTED/.test(line)) { listed.get(`${date}|${team}`)!.submitted = false; continue; }
    const s = cells.findIndex((c) => STATUS.has(c));
    if (s < 0) continue;
    const name = cells.slice(0, s).find((c) => /^[^,]+,\s*[^,]+$/.test(c) && !teams.has(normName(c)) && !NOT_A_NAME.test(c));
    if (name) entries.push({ date, team, name: name.replace(/\s+/g, " "), status: cells[s] as NbaStatus });
  }
  return { published, teams: [...listed.values()], entries };
}

/**
 * A matcher for one team's players: "Last, First" to the one athlete whose name fits, trying the full name, then the
 * last name alone, then the last name with the first initial, then the first name with the last name's first word;
 * null when none or more than one fits.
 */
export function nameMatcher(players: Iterable<readonly [Athlete, string]>): (name: string) => Athlete | null {
  const byName = new Map<string, Athlete[]>();
  for (const [a, n] of players) {
    const key = normName(n);
    const list = byName.get(key) ?? [];
    if (!list.includes(a)) list.push(a);
    byName.set(key, list);
  }
  const one = (found: [string, Athlete[]][]) => (found.length === 1 && found[0][1].length === 1 ? found[0][1][0] : null);
  return (name) => {
    const [last, first = ""] = name.split(/,\s*/);
    const full = byName.get(normName(`${first} ${last}`));
    if (full?.length === 1) return full[0];
    const ln = normName(last), fn = normName(first);
    const byLast = [...byName].filter(([n]) => n === ln || n.endsWith(` ${ln}`));
    return one(byLast) ?? one(byLast.filter(([n]) => n[0] === fn[0])) ?? one([...byName].filter(([n]) => n.startsWith(`${fn} `) && n.includes(ln.split(" ")[0])));
  };
}

/** Each team's players in a season: everyone with a box line for it, with his name from players.json. */
export function rosters(box: { games: Record<string, Partial<Record<Abbr, readonly (readonly number[])[]>>> }, names: Readonly<Record<string, string>>): Map<Abbr, Map<Athlete, string>> {
  const out = new Map<Abbr, Map<Athlete, string>>();
  for (const sides of Object.values(box.games)) for (const [abbr, lines] of Object.entries(sides)) for (const l of lines ?? []) {
    const name = names[l[0]];
    if (name) (out.get(abbr) ?? out.set(abbr, new Map()).get(abbr)!).set(l[0], name);
  }
  return out;
}

/** One side's statuses, by athlete id. */
export type SideReport = Record<string, NbaStatus>;
/**
 * A game's report: when the report was published (US Eastern), when the fetch saved it if it was saved live, each
 * side's statuses, null for a side the report did not cover or had not submitted, and the names it could not match.
 */
export type GameReport = { published: string; fetched?: string; home: SideReport | null; away: SideReport | null; unmatched?: string[] };
/** A season's archive: each game's report, by game id. */
export type NbaArchive = { season: string; games: Record<string, GameReport> };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isSide = (v: unknown): v is SideReport | null => v === null || (isRecord(v) && Object.entries(v).every(([k, s]) => /^\d+$/.test(k) && typeof s === "string" && STATUS.has(s)));

/** `raw` as `id`'s archive, from src/data/nba-reports/<id>.json. The fetch wrote it, so anything malformed throws. */
export function parseNbaArchive(raw: unknown, id: string): NbaArchive {
  const where = `src/data/nba-reports/${id}.json`;
  if (!isRecord(raw) || raw.season !== id || !isRecord(raw.games)) throw new Error(`${where}: expected { season: "${id}", games }`);
  for (const [game, r] of Object.entries(raw.games)) {
    if (!isRecord(r) || typeof r.published !== "string" || !isSide(r.home) || !isSide(r.away)) throw new Error(`${where}: game ${game} is malformed`);
  }
  return raw as NbaArchive;
}

/** A game's two sides from `report`: each side's matched statuses, null for a side the report does not list as submitted, or null for the game when neither is. */
export function gameSides(game: Pick<Game, "t" | "home" | "away">, report: NbaReport, match: (team: Abbr, name: string) => Athlete | null): Omit<GameReport, "published" | "fetched"> | null {
  const date = dayKey(game.t);
  const listed = new Map(report.teams.filter((t) => t.date === date).map((t) => [t.team, t.submitted]));
  if (!listed.has(game.home) && !listed.has(game.away)) return null;
  const unmatched: string[] = [];
  const side = (abbr: Abbr): SideReport | null => {
    if (!listed.get(abbr)) return null;
    const out: SideReport = {};
    for (const e of report.entries) {
      if (e.date !== date || e.team !== abbr) continue;
      const a = match(abbr, e.name);
      if (a === null) unmatched.push(`${abbr} ${e.name}`);
      else out[a] = e.status;
    }
    return out;
  };
  const home = side(game.home), away = side(game.away);
  if (!home && !away) return null;
  return unmatched.length ? { home, away, unmatched } : { home, away };
}

/**
 * `archive` with `report` set on every game it covers whose tip-off is after `now`, an ISO time: a later report
 * replaces an earlier one until the game begins, and never after. A report that says the same about a game keeps the
 * earlier one's times, so a run with nothing new changes nothing. Returns the new archive and how many games changed.
 */
export function withNbaReport(archive: NbaArchive, data: SeasonData, report: NbaReport, match: (team: Abbr, name: string) => Athlete | null, now: string): { archive: NbaArchive; changed: number } {
  if (!report.published) return { archive, changed: 0 };
  const games = { ...archive.games };
  let changed = 0;
  for (const g of data.games) {
    if (Date.parse(g.t) <= Date.parse(now)) continue;
    const sides = gameSides(g, report, match);
    if (!sides) continue;
    const next: GameReport = { published: report.published, fetched: now, ...sides };
    const before = games[g.id];
    const said = (r: GameReport) => JSON.stringify([r.home, r.away, r.unmatched ?? []]);
    if (before && said(before) === said(next)) continue;
    games[g.id] = next;
    changed++;
  }
  return { archive: { season: archive.season, games: Object.fromEntries(Object.entries(games).sort(([x], [y]) => x.localeCompare(y))) }, changed };
}
