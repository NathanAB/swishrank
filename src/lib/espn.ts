// ESPN's scoreboard events as this site's games, for scripts/fetch-season.mjs. Fixes to ESPN's data belong
// here, so a re-fetch keeps them.
import { dayKey, type Abbr, type Game, type Team } from "./elo.ts";

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
    const note = comp.notes?.find((n) => n.headline)?.headline;
    games.push({
      id: e.id,
      t: e.date,
      home: home.team.abbreviation,
      away: away.team.abbreviation,
      hs: final ? Number(home.score) : null,
      as: final ? Number(away.score) : null,
      final,
      neutral: Boolean(comp.neutralSite) || inBubble(season, e.date),
      note: note ? canonicalNote(note) : null,
    });
  }
  return games;
}
