// ESPN's scoreboard events as this site's games, for scripts/fetch-season.mjs. Fixes to ESPN's data belong
// here, so a re-fetch keeps them.
import { dayKey, type Abbr, type Game, type Team } from "./elo.ts";
import type { BoxLine, SeasonBox } from "./players.ts";

/** The pauses between tries of one scoreboard request: ESPN now and then sends an empty body, twice in a row. */
export const RETRY_WAITS = [5_000, 20_000, 60_000];

/** One day's scoreboard events from `url`, tried again after each of `waits` when ESPN fails or sends no JSON. */
export const fetchEvents = async (url: string, waits = RETRY_WAITS, get: typeof fetch = fetch): Promise<EspnEvent[]> =>
  ((await fetchJson(url, waits, get)) as { events?: EspnEvent[] }).events ?? [];

/** JSON from `url`, tried again after each of `waits` when ESPN fails or sends no JSON, but not when it has no such page. */
export async function fetchJson(url: string, waits = RETRY_WAITS, get: typeof fetch = fetch): Promise<unknown> {
  for (let i = 0; ; i++) {
    let status = 0, failure: string;
    try {
      const res = await get(url);
      status = res.status;
      if (res.ok) return await res.json();
      failure = `HTTP ${status}`;
    } catch (err) {
      failure = (err as Error).message;
    }
    if (status === 404 || i === waits.length) throw new Error(`ESPN ${url}: ${failure}`);
    console.warn(`ESPN ${url}: ${failure}, trying again in ${waits[i] / 1000}s`);
    await new Promise((r) => setTimeout(r, waits[i]));
  }
}

type Competitor = {
  homeAway: "home" | "away";
  score?: string;
  team: { id: string; abbreviation: string; displayName: string; shortDisplayName: string; color: string; alternateColor: string };
};

/** The parts of one ESPN scoreboard event the site reads. */
export type EspnEvent = {
  id: string;
  date: string;
  season: { type: number };
  status: { type: { name: string; completed: boolean } };
  competitions: { neutralSite?: boolean; notes?: { headline?: string }[]; competitors: Competitor[] }[];
};

// ESPN season types: 2 regular season, 3 playoffs, 5 play-in. 1 (preseason) is skipped.
const COUNTED_SEASON_TYPES = new Set([2, 3, 5]);
const SKIPPED_STATUSES = new Set(["STATUS_POSTPONED", "STATUS_CANCELED", "STATUS_SUSPENDED"]);
// ESPN numbers the 30 franchises 1-30; All-Star teams and "TBD" Cup knockout slots fall outside that.
const isFranchise = (team: Competitor["team"]) => Number(team.id) >= 1 && Number(team.id) <= 30;

// ESPN flags only 3 games of 2019-20 as neutral, but everything from the restart on was in the Orlando bubble.
const inBubble = (season: string, t: string) => season === "2019-20" && dayKey(t) >= "2020-07-30";

const title = (word: string) => (word === "NBA" ? word : word[0] + word.slice(1).toLowerCase());
const ROUNDS: Record<string, string> = { "1ST ROUND": "1st Round", SEMIFINALS: "Semifinals", FINALS: "Finals" };

/**
 * ESPN's note in the form it has used since 2020-21 ("East 1st Round - Game 3", "NBA Finals - Game 1"), which
 * the playoff and conference logic reads. Older seasons write "EASTERN CONFERENCE 1ST ROUND - GAME 3" or
 * "EAST 1st ROUND - GAME 3", and shout other notes in capitals.
 */
export function canonicalNote(note: string): string {
  const text = note.trim().replaceAll("–", "-");
  const round = text.toUpperCase().match(/^(EAST|WEST)(?:ERN CONFERENCE)? (1ST ROUND|SEMIFINALS|FINALS) - GAME (\d+)$/);
  if (round) return `${title(round[1])} ${ROUNDS[round[2]]} - Game ${round[3]}`;
  const finals = text.toUpperCase().match(/^NBA FINALS - GAME (\d+)$/);
  if (finals) return `NBA Finals - Game ${finals[1]}`;
  const playIn = text.toUpperCase().match(/^(EAST|WEST) PLAY-IN - GAME (\d+)$/);
  if (playIn) return `NBA Play-In - ${title(playIn[1])} - Game ${playIn[2]}`;
  return text === text.toUpperCase() ? text.split(/\s+/).map(title).join(" ") : text;
}

/** The season's counted games among one day's events; records each franchise's name and colours in `teams`. */
export function parse(season: string, events: readonly EspnEvent[], teams: Record<Abbr, Team>): Game[] {
  const games: Game[] = [];
  for (const e of events) {
    if (!COUNTED_SEASON_TYPES.has(e.season.type)) continue;
    const status = e.status.type;
    if (SKIPPED_STATUSES.has(status.name)) continue;
    const comp = e.competitions[0];
    if (!comp.competitors.every((c) => isFranchise(c.team))) continue;
    const side: Partial<Record<Competitor["homeAway"], Competitor>> = {};
    for (const c of comp.competitors) {
      teams[c.team.abbreviation] = { name: c.team.displayName, short: c.team.shortDisplayName, color: c.team.color, alternateColor: c.team.alternateColor };
      side[c.homeAway] = c;
    }
    const { home, away } = side;
    if (!home || !away) throw new Error(`ESPN event ${e.id} lacks a home or away side`);
    const final = Boolean(status.completed);
    // A final game without two whole scores is a fault in ESPN's feed: a blank would count as 0 and a missing
    // score would drop the game from the fit, so the fetch stops and the committed scores stay as they were.
    const score = (c: Competitor) => {
      if (!/^\d+$/.test(c.score ?? "")) throw new Error(`ESPN event ${e.id} is final without a whole score for ${c.team.abbreviation}`);
      return Number(c.score);
    };
    const note = comp.notes?.find((n) => n.headline)?.headline;
    games.push({
      id: e.id,
      t: e.date,
      home: home.team.abbreviation,
      away: away.team.abbreviation,
      hs: final ? score(home) : null,
      as: final ? score(away) : null,
      final,
      neutral: Boolean(comp.neutralSite) || inBubble(season, e.date),
      note: note ? canonicalNote(note) : null,
    });
  }
  return games;
}

/**
 * The games final in `before` that `after` no longer has as final. A final game never goes back, so any here
 * means ESPN sent a partial season, and writing it would drop those games from the ratings.
 */
export const lostFinals = (before: readonly Game[], after: readonly Game[]): string[] => {
  const final = new Set(after.filter((g) => g.final).map((g) => g.id));
  return before.filter((g) => g.final && !final.has(g.id)).map((g) => g.id);
};

type SummaryAthlete = { athlete?: { id?: string; displayName?: string }; didNotPlay?: boolean; stats?: string[] };
/** The parts of ESPN's game summary (site.api.espn.com .../summary?event=<id>) the box scores and names read. */
export type EspnSummary = { boxscore?: { players?: { team: { abbreviation: string }; statistics?: { labels?: string[]; athletes?: SummaryAthlete[] }[] }[] } };

// ESPN writes a blank stat as "--" or leaves it out; it counts as 0, as a whole number with a "+" does as itself.
const whole = (s: string | undefined) => {
  const n = parseInt(String(s ?? "").replace("+", ""), 10);
  return Number.isFinite(n) ? n : 0;
};
const madeOf = (s: string | undefined) => String(s ?? "").split("-").map(whole);

/**
 * A summary's box lines, by team: [athlete, MIN, PTS, FGM, FGA, FTM, FTA, OREB, DREB, AST, STL, BLK, TO, PF] for
 * every player with minutes. A team whose players have no stats, as in about 12% of 2015-16 to 2017-18, is left out.
 */
export function boxLines(summary: EspnSummary): SeasonBox["games"][string] {
  const out: SeasonBox["games"][string] = {};
  for (const team of summary.boxscore?.players ?? []) {
    const stats = team.statistics?.[0];
    const athletes = (stats?.athletes ?? []).filter((a) => !a.didNotPlay && a.stats?.length);
    if (!athletes.length) continue;
    const labels = stats?.labels ?? [];
    const col = (label: string) => {
      const i = labels.indexOf(label);
      if (i < 0) throw new Error(`ESPN box score for ${team.team.abbreviation} has no ${label} column`);
      return i;
    };
    const [min, pts, fg, ft, oreb, dreb, ast, stl, blk, to, pf] = ["MIN", "PTS", "FG", "FT", "OREB", "DREB", "AST", "STL", "BLK", "TO", "PF"].map(col);
    const lines: BoxLine[] = [];
    for (const { athlete, stats: s = [] } of athletes) {
      const minutes = whole(s[min]);
      if (minutes <= 0) continue;
      if (!/^\d+$/.test(athlete?.id ?? "")) throw new Error(`ESPN box score for ${team.team.abbreviation} has a player without an id`);
      const [fgm = 0, fga = 0] = madeOf(s[fg]);
      const [ftm = 0, fta = 0] = madeOf(s[ft]);
      lines.push([Number(athlete?.id), minutes, whole(s[pts]), fgm, fga, ftm, fta, whole(s[oreb]), whole(s[dreb]), whole(s[ast]), whole(s[stl]), whole(s[blk]), whole(s[to]), whole(s[pf])]);
    }
    if (lines.length) out[team.team.abbreviation] = lines;
  }
  return out;
}

/** Each player's name in a summary's box score, by athlete id, those who did not play included. */
export function playerNames(summary: EspnSummary): Record<string, string> {
  const names: Record<string, string> = {};
  for (const team of summary.boxscore?.players ?? []) {
    for (const { athlete } of team.statistics?.flatMap((s) => s.athletes ?? []) ?? []) {
      const id = athlete?.id, name = athlete?.displayName;
      if (id && /^\d+$/.test(id) && name) names[id] = name;
    }
  }
  return names;
}
