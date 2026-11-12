// The seasons the site shows, loaded and rated once per build. seasons.json lists them; the one without
// "end" is current and lives at the site root. Each season's games come from src/data/games/<id>.json, and the
// model also reads its box scores and preseason win totals from src/data/box/ and src/data/preseason/, ESPN's and
// the NBA's injury reports from src/data/injuries/ and src/data/nba-reports/, and the draft from src/data/draft.json.
import draft from "../data/draft.json" with { type: "json" };
import list from "../data/seasons.json" with { type: "json" };
import type { DraftFile } from "./draft.ts";
import { compute, dayKey, type Abbr, type Game, type ModelInputs, type Season, type SeasonData, type Team } from "./elo.ts";
import { seasonLabel } from "./format.ts";
import { modelInputs } from "./inputs.ts";
import { playerName } from "./names.ts";
import type { ChartData, TeamLook } from "./player-chart.ts";
import { buildTimeline } from "./player-timeline.ts";
import { months } from "./results.ts";
import { conferenceSlug, gameSlug, href, switchTarget, teamSlug, type Route, type SeasonRef } from "./routes.ts";
import { CONFERENCE_ORDER } from "./teams.ts";
import { coloursOf, lineColor } from "./tint.ts";

export type SeasonView = SeasonRef & {
  /** "2026–27" */
  label: string;
  /** First day of the season, YYYY-MM-DD, from seasons.json. */
  start: string;
  /** Last day for a finished season; null for the current one. */
  end: string | null;
  /** A line on what set the season apart, such as the 2019-20 bubble, from seasons.json; null for most. */
  note: string | null;
  /** compute()'s model: ratings, ranks, results, logs, stats, daily series, upcoming games. */
  model: Season;
};

/** When this build ran, which is when the scores were last pulled. */
export const BUILT_AT = new Date();
/** The US Eastern day the build ran on. */
export const TODAY = dayKey(BUILT_AT.toISOString());

const GAME_FILES = import.meta.glob<unknown>("../data/games/*.json", { eager: true, import: "default" });
const BOX_FILES = import.meta.glob<unknown>("../data/box/*.json", { eager: true, import: "default" });
const PRESEASON_FILES = import.meta.glob<unknown>("../data/preseason/*.json", { eager: true, import: "default" });
const INJURY_FILES = import.meta.glob<unknown>("../data/injuries/*.json", { eager: true, import: "default" });
const NBA_REPORT_FILES = import.meta.glob<unknown>("../data/nba-reports/*.json", { eager: true, import: "default" });

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

type Entry = { id: string; start: string; end: string | null; note: string | null };

function parseList(raw: readonly { id: string; start: string; end?: string; note?: string }[]): { current: Entry; all: Entry[] } {
  const all = raw.map((s) => ({ id: s.id, start: s.start, end: s.end ?? null, note: s.note ?? null })).sort((a, b) => b.start.localeCompare(a.start));
  const [current, ...others] = all.filter((s) => s.end === null);
  if (!current || others.length) throw new Error(`src/data/seasons.json: exactly one season must have no "end"`);
  return { current, all };
}

const ENTRIES = parseList(list);
const cache = new Map<string, SeasonView>();

/** A season's file from `dir`, or undefined when it has none. */
const file = (files: Record<string, unknown>, dir: string, id: string): unknown => files[`../data/${dir}/${id}.json`];
const seasonData = (id: string) => {
  const raw = file(GAME_FILES, "games", id);
  if (raw === undefined) throw new Error(`src/data/games/${id}.json is missing for season ${id}`);
  return parseSeasonData(raw, id);
};

// A season without box scores rates its teams alone, one without preseason totals seeds them from the season before,
// and one without injury reports prices its games with the previous game's lineups.
let inputs: Map<string, ModelInputs> | undefined;
const allInputs = () =>
  (inputs ??= modelInputs(
    ENTRIES.all.map(({ id }) => ({
      data: seasonData(id), box: file(BOX_FILES, "box", id), preseason: file(PRESEASON_FILES, "preseason", id),
      injuries: file(INJURY_FILES, "injuries", id), nbaReports: file(NBA_REPORT_FILES, "nba-reports", id),
    })),
    draft as unknown as DraftFile,
  ));

/** A season's model inputs, as compute() read them. */
export const seasonInputs = (id: string) => allInputs().get(id);

function load(entry: Entry): SeasonView {
  const hit = cache.get(entry.id);
  if (hit) return hit;
  const data = seasonData(entry.id);
  const teams = entry === ENTRIES.current ? data.teams : coloursOf(data.teams, load(ENTRIES.current).model.data.teams);
  const view: SeasonView = {
    id: entry.id,
    current: entry.end === null,
    label: seasonLabel(entry.id),
    start: entry.start,
    end: entry.end,
    note: entry.note,
    model: compute({ ...data, teams }, allInputs().get(entry.id)),
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

const hadOldPages = (season: SeasonView) => season.current || season.id === "2025-26";

/** getStaticPaths for a moved page: one redirect per season that had the page. */
export const movedSeasonPaths = () => seasonPaths().filter((p) => hadOldPages(p.props.season));

/** getStaticPaths for a moved month of results: one redirect per month of a season that had them. */
export const movedMonthPaths = () => monthPaths().filter((p) => hadOldPages(p.props.season));

/** getStaticPaths for src/pages/[...season]/teams/[team].astro: one page per team per season. */
export const teamPaths = () =>
  allSeasons().flatMap((season) =>
    season.model.abbrs.map((abbr) => ({ params: { season: seasonParam(season), team: teamSlug(abbr) }, props: { season, abbr } })),
  );

/** getStaticPaths for src/pages/[...season]/games/[day]/[matchup].astro: one page per game, played or to come. */
export const gamePaths = () =>
  allSeasons().flatMap((season) =>
    season.model.data.games.map((game) => {
      return { params: { season: seasonParam(season), ...gameSlug(game) }, props: { season, game } };
    }),
  );

/** The season a page shows; the about, seasons and players pages have none. */
export const routeSeason = (route: Route): SeasonView | null =>
  "season" in route ? (allSeasons().find((s) => s.id === route.season.id) ?? null) : null;

/** The season menu for a page: one link per season, newest first, to the same page in that season. */
export const seasonSwitch = (route: Route) =>
  allSeasons().map((season) => ({
    season,
    href: href(switchTarget(route, season, (abbr) => abbr in season.model.data.teams)),
    active: routeSeason(route)?.id === season.id,
  }));

export const team = (season: SeasonView, abbr: Abbr): Team => season.model.data.teams[abbr];

let players: ChartData | undefined;
/**
 * The players page's table (lib/player-timeline.ts), with each team it names in its newest season's short name and
 * line colour, built once per build for the page, its league-lines file and the copy its script fetches.
 */
export const playerChart = (): ChartData =>
  (players ??= (() => {
    const seasons = allSeasons();
    const teams: Record<Abbr, TeamLook> = {};
    for (const s of seasons) for (const [a, t] of Object.entries(s.model.data.teams)) teams[a] ??= { short: t.short, tint: lineColor(t) };
    const table = buildTimeline(seasons.map((s) => ({ id: s.id, label: s.label, current: s.current, data: s.model.data, inputs: seasonInputs(s.id) ?? {} })), playerName);
    return { ...table, teams };
  })());

/** What a list of games still to play says when it has none. */
export const noGamesAhead = (season: SeasonView) =>
  season.current ? "No games in the next seven days." : `The ${season.label} season is over.`;
