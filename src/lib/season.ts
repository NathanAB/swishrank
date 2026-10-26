// The seasons the site shows, loaded and rated once per build. seasons.json lists them; the one without
// "end" is current and lives at the site root. Each season's games come from src/data/games/<id>.json.
import list from "../data/seasons.json" with { type: "json" };
import { compute, dayKey, type Abbr, type Game, type Season, type SeasonData, type Team } from "./elo.ts";
import { seasonLabel } from "./format.ts";
import { months } from "./results.ts";
import { conferenceSlug, href, switchTarget, teamSlug, type Route, type SeasonRef } from "./routes.ts";
import { CONFERENCE_ORDER } from "./teams.ts";

export type SeasonView = SeasonRef & {
  /** "2026–27" */
  label: string;
  /** First day of the season, YYYY-MM-DD, from seasons.json. */
  start: string;
  /** Last day for a finished season; null for the current one. */
  end: string | null;
  /** compute()'s model: ratings, ranks, results, logs, stats, daily series, upcoming games. */
  model: Season;
};

/** When this build ran, which is when the scores were last pulled. */
export const BUILT_AT = new Date();
/** The US Eastern day the build ran on. */
export const TODAY = dayKey(BUILT_AT.toISOString());

const GAME_FILES = import.meta.glob<unknown>("../data/games/*.json", { eager: true, import: "default" });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNumOrNull = (v: unknown): v is number | null => v === null || typeof v === "number";
const isTextOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";
const isHex = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{6}$/i.test(v);

function parseTeam(v: unknown, where: string): Team {
  if (isRecord(v) && typeof v.name === "string" && typeof v.short === "string" && isHex(v.color) && isHex(v.alternateColor)) {
    return { name: v.name, short: v.short, color: v.color, alternateColor: v.alternateColor };
  }
  throw new Error(`${where}: a team needs a name, a short name and two hex colours`);
}

function parseGame(v: unknown, where: string): Game {
  if (
    isRecord(v) &&
    typeof v.id === "string" && typeof v.t === "string" && typeof v.home === "string" && typeof v.away === "string" &&
    isNumOrNull(v.hs) && isNumOrNull(v.as) && typeof v.final === "boolean" && typeof v.neutral === "boolean" &&
    isTextOrNull(v.note)
  ) {
    return { id: v.id, t: v.t, home: v.home, away: v.away, hs: v.hs, as: v.as, final: v.final, neutral: v.neutral, note: v.note };
  }
  throw new Error(`${where}: malformed game ${JSON.stringify(v).slice(0, 120)}`);
}

function parseSeasonData(raw: unknown, id: string): SeasonData {
  const where = `src/data/games/${id}.json`;
  if (!isRecord(raw) || raw.season !== id || !isRecord(raw.teams) || !Array.isArray(raw.games)) {
    throw new Error(`${where}: expected { season: "${id}", teams, games }`);
  }
  const teams = Object.fromEntries(Object.entries(raw.teams).map(([abbr, t]) => [abbr, parseTeam(t, `${where} ${abbr}`)]));
  const games = raw.games.map((g) => parseGame(g, where));
  for (const g of games) {
    if (!teams[g.home] || !teams[g.away]) throw new Error(`${where}: game ${g.id} names a team missing from teams`);
  }
  return { season: id, teams, games };
}

type Entry = { id: string; start: string; end: string | null };

function parseList(raw: readonly { id: string; start: string; end?: string }[]): { current: Entry; all: Entry[] } {
  const all = raw.map((s) => ({ id: s.id, start: s.start, end: s.end ?? null })).sort((a, b) => b.start.localeCompare(a.start));
  const [current, ...others] = all.filter((s) => s.end === null);
  if (!current || others.length) throw new Error(`src/data/seasons.json: exactly one season must have no "end"`);
  return { current, all };
}

const ENTRIES = parseList(list);
const cache = new Map<string, SeasonView>();

function load(entry: Entry): SeasonView {
  const hit = cache.get(entry.id);
  if (hit) return hit;
  const raw = GAME_FILES[`../data/games/${entry.id}.json`];
  if (raw === undefined) throw new Error(`src/data/games/${entry.id}.json is missing for season ${entry.id}`);
  const view: SeasonView = {
    id: entry.id,
    current: entry.end === null,
    label: seasonLabel(entry.id),
    start: entry.start,
    end: entry.end,
    model: compute(parseSeasonData(raw, entry.id)),
  };
  cache.set(entry.id, view);
  return view;
}

/** Every season, newest first, each rated once per build. */
export const allSeasons = (): SeasonView[] => ENTRIES.all.map(load);

/** The season in progress: the one without "end" in seasons.json. */
export const currentSeason = (): SeasonView => load(ENTRIES.current);

/** The URL param for a season in a [...season] route: undefined for the current season, else its id. */
const seasonParam = (season: SeasonRef) => (season.current ? undefined : season.id);

/** getStaticPaths for a page under src/pages/[...season]/: one page per season. */
export const seasonPaths = () => allSeasons().map((season) => ({ params: { season: seasonParam(season) }, props: { season } }));

/** getStaticPaths for src/pages/[...season]/[conference].astro: one home per conference per season. */
export const conferencePaths = () =>
  allSeasons().flatMap((season) =>
    CONFERENCE_ORDER.map((conference) => ({ params: { season: seasonParam(season), conference: conferenceSlug(conference) }, props: { season, conference } })),
  );

/** getStaticPaths for a page per month of games: one per month with a final game, per season. */
export const monthPaths = () =>
  allSeasons().flatMap((season) =>
    months(season.model).map((month) => ({ params: { season: seasonParam(season), month: month.key }, props: { season, month: month.key } })),
  );

/** getStaticPaths for src/pages/[...season]/teams/[team].astro: one page per team per season. */
export const teamPaths = () =>
  allSeasons().flatMap((season) =>
    season.model.abbrs.map((abbr) => ({ params: { season: seasonParam(season), team: teamSlug(abbr) }, props: { season, abbr } })),
  );

/** The season a page shows; the about and seasons pages have none. */
export const routeSeason = (route: Route): SeasonView | null =>
  route.kind === "about" || route.kind === "seasons" ? null : (allSeasons().find((s) => s.id === route.season.id) ?? null);

/** The season menu for a page: one link per season, newest first, to the same page in that season. */
export const seasonSwitch = (route: Route) =>
  allSeasons().map((season) => ({
    season,
    href: href(switchTarget(route, season, (abbr) => abbr in season.model.data.teams)),
    active: routeSeason(route)?.id === season.id,
  }));

export const team = (season: SeasonView, abbr: Abbr): Team => season.model.data.teams[abbr];

/** What a list of games still to play says when it has none. */
export const noGamesAhead = (season: SeasonView) =>
  season.current ? "No games in the next seven days." : `The ${season.label} season is over.`;
