// The injury report page's figures: how often a player the NBA's injury report lists plays that night, by status, by
// season, by team and by player. A game's report is the one src/data/nba-reports/ keeps for it (docs/model-v4.md), and
// a player played when the game's box score has a line for him, which it has only for players who logged minutes.
import type { Abbr, Game } from "./elo.ts";
import { NBA_STATUSES, type NbaArchive, type NbaStatus } from "./nba-report.ts";
import type { Athlete, SeasonBox } from "./players.ts";

/** One player on one game's report: his status, and whether he played for that team that night. */
export type Listing = { season: string; game: string; t: string; team: Abbr; athlete: Athlete; status: NbaStatus; played: boolean };

/** One season's files: its games, its archive of reports and its box scores. */
export type SeasonListings = { id: string; games: readonly Pick<Game, "id" | "t" | "home" | "away" | "final">[]; archive: NbaArchive; box: SeasonBox };

/**
 * Every player on the report of each final game with a box score, in the order the games tipped off. A side whose
 * report is null lists no one, and the names the report could not match to a player are left out.
 */
export function listingsOf({ id, games, archive, box }: SeasonListings): Listing[] {
  const out: Listing[] = [];
  for (const g of [...games].sort((x, y) => x.t.localeCompare(y.t))) {
    const report = archive.games[g.id], lines = box.games[g.id];
    if (!g.final || !report || !lines) continue;
    for (const [team, side] of [[g.home, report.home], [g.away, report.away]] as const) {
      const played = new Set((lines[team] ?? []).map((l) => l[0]));
      for (const [athlete, status] of Object.entries(side ?? {})) {
        out.push({ season: id, game: g.id, t: g.t, team, athlete: Number(athlete), status, played: played.has(Number(athlete)) });
      }
    }
  }
  return out;
}

/** How many times a status was given, and how many of those times the player played. */
export type Tally = { listed: number; played: number };

/** The share of a tally's listings in which the player played, from 0 to 1. */
export const share = (t: Tally) => t.played / t.listed;

const add = (t: Tally, l: Listing): Tally => ({ listed: t.listed + 1, played: t.played + (l.played ? 1 : 0) });
const byStatus = (ls: readonly Listing[]): Record<NbaStatus, Tally> => {
  const out = Object.fromEntries(NBA_STATUSES.map((s) => [s, { listed: 0, played: 0 }])) as Record<NbaStatus, Tally>;
  for (const l of ls) out[l.status] = add(out[l.status], l);
  return out;
};
const tallyOf = (ls: readonly Listing[]) => ls.reduce(add, { listed: 0, played: 0 });

/** Questionable listings a player needs for a row in the player table. */
export const MIN_QUESTIONABLE = 20;

/** A player in the table: the teams he was listed with, the one he was last listed with last. */
export type PlayerRow = { athlete: Athlete; teams: Abbr[]; questionable: Tally; probable: Tally };

export type InjuryRecord = {
  /** The oldest season with a report, by id. */
  since: string;
  /** Games whose report listed at least one player. */
  games: number;
  statuses: Record<NbaStatus, Tally>;
  /** Newest first, each with the tip-off of its first game with a listing. */
  seasons: { id: string; from: string; statuses: Record<NbaStatus, Tally> }[];
  /** Every team listed, by the share of its Questionable listings who played, highest first. */
  teams: { team: Abbr; questionable: Tally }[];
  /** Players with MIN_QUESTIONABLE or more Questionable listings, most listings first. */
  players: PlayerRow[];
};

const groups = <K>(ls: readonly Listing[], key: (l: Listing) => K): Map<K, Listing[]> => {
  const out = new Map<K, Listing[]>();
  for (const l of ls) {
    const k = key(l);
    const list = out.get(k);
    if (list) list.push(l);
    else out.set(k, [l]);
  }
  return out;
};

/** Every season's listings, given in the order the games tipped off, tallied by status, season, team and player. */
export function injuryRecordOf(listings: readonly Listing[]): InjuryRecord {
  const questionable = listings.filter((l) => l.status === "Questionable");
  const seasons = [...groups(listings, (l) => l.season)].sort(([x], [y]) => y.localeCompare(x));
  const teams = [...groups(questionable, (l) => l.team)]
    .map(([team, ls]) => ({ team, questionable: tallyOf(ls) }))
    .sort((x, y) => share(y.questionable) - share(x.questionable) || x.team.localeCompare(y.team));
  const players = [...groups(listings, (l) => l.athlete)]
    .map(([athlete, ls]): PlayerRow => {
      // The teams in order of his last listing with each, so the newest comes last.
      const last = new Map<Abbr, number>();
      ls.forEach((l, i) => last.set(l.team, i));
      const s = byStatus(ls);
      return { athlete, teams: [...last].sort(([, x], [, y]) => x - y).map(([t]) => t), questionable: s.Questionable, probable: s.Probable };
    })
    .filter((p) => p.questionable.listed >= MIN_QUESTIONABLE)
    .sort((x, y) => y.questionable.listed - x.questionable.listed || share(y.questionable) - share(x.questionable) || x.athlete - y.athlete);
  return {
    since: seasons.at(-1)?.[0] ?? "",
    games: new Set(listings.map((l) => l.game)).size,
    statuses: byStatus(listings),
    seasons: seasons.map(([id, ls]) => ({ id, from: ls[0].t, statuses: byStatus(ls) })),
    teams,
    players,
  };
}
