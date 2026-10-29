// ESPN's scoreboard events as this site's games, for scripts/fetch-season.mjs. Fixes to ESPN's data belong
// here, so a re-fetch keeps them.
import { dayKey, type Abbr, type Game, type Team } from "./elo.ts";

/** The pauses between tries of one scoreboard request: ESPN now and then sends an empty body, twice in a row. */
export const RETRY_WAITS = [5_000, 20_000, 60_000];

/** One day's scoreboard events from `url`, tried again after each of `waits` when ESPN fails or sends no JSON. */
export async function fetchEvents(url: string, waits = RETRY_WAITS, get: typeof fetch = fetch): Promise<EspnEvent[]> {
  for (let i = 0; ; i++) {
    try {
      const res = await get(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return ((await res.json()) as { events?: EspnEvent[] }).events ?? [];
    } catch (err) {
      if (i === waits.length) throw new Error(`ESPN ${url}: ${(err as Error).message}`);
      console.warn(`ESPN ${url}: ${(err as Error).message}, trying again in ${waits[i] / 1000}s`);
      await new Promise((r) => setTimeout(r, waits[i]));
    }
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

type Correction = Partial<Pick<Game, "t" | "neutral">> & { source: string };
/**
 * Facts ESPN's scoreboard gets wrong, by ESPN event id, each with the NBA record that shows the right one. A `t`
 * is the first period's start in the NBA's play-by-play, which prints the arena's local time.
 */
const CORRECTIONS: Record<string, Correction> = {
  // ESPN stores these four at early-morning Eastern times, which would file each a day late.
  "401161490": { t: "2020-02-24T02:11Z", source: "https://statsdmz.nba.com/pdfs/20200223/20200223_DETPOR_book.pdf" },
  "401161528": { t: "2020-02-29T03:41Z", source: "https://statsdmz.nba.com/pdfs/20200228/20200228_DENLAC_book.pdf" },
  "401161530": { t: "2020-03-01T00:42Z", source: "https://statsdmz.nba.com/pdfs/20200229/20200229_PORATL_book.pdf" },
  "401161536": { t: "2020-03-01T02:10Z", source: "https://statsdmz.nba.com/pdfs/20200229/20200229_GSWPHX_book.pdf" },
  // The 2023-24 Cup semifinals were at T-Mobile Arena, Las Vegas, which ESPN stores as home games.
  "401607494": { neutral: true, source: "https://statsdmz.nba.com/pdfs/20231207/20231207_INDMIL_book.pdf" },
  "401607493": { neutral: true, source: "https://statsdmz.nba.com/pdfs/20231207/20231207_NOPLAL.pdf" },
};

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
    const fix: Correction | undefined = CORRECTIONS[e.id];
    const t = fix?.t ?? e.date;
    games.push({
      id: e.id,
      t,
      home: home.team.abbreviation,
      away: away.team.abbreviation,
      hs: final ? score(home) : null,
      as: final ? score(away) : null,
      final,
      neutral: fix?.neutral ?? (Boolean(comp.neutralSite) || inBubble(season, t)),
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
