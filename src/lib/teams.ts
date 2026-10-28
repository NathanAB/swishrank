// One team's season as the team pages show it, and the conference each team plays in. Every change is the
// displayed one (facts.ts outcome), so a team's log agrees with the league's lists.
import { addDays, dayKey, ranksOf, type Abbr, type Game, type Result, type Season, type Snapshot } from "./elo.ts";
import { outcome, upset, type Line } from "./facts.ts";
import { placeLabel } from "./format.ts";
import { WEEK } from "./fixtures.ts";

export type Conference = "East" | "West";

export const CONFERENCE_ORDER: readonly Conference[] = ["East", "West"];

/**
 * The two conferences, which seed the playoffs. The game data has no conference field, so this is the one
 * place it lives, under ESPN's abbreviations; teams.test.ts checks it against the data's Cup groups and
 * playoff rounds.
 */
export const CONFERENCES: Record<Conference, readonly Abbr[]> = {
  East: ["ATL", "BKN", "BOS", "CHA", "CHI", "CLE", "DET", "IND", "MIA", "MIL", "NY", "ORL", "PHI", "TOR", "WSH"],
  West: ["DAL", "DEN", "GS", "HOU", "LAC", "LAL", "MEM", "MIN", "NO", "OKC", "PHX", "POR", "SA", "SAC", "UTAH"],
};

/** A team's conference, or null for a team the map does not know yet (an expansion team). */
export const conferenceOf = (abbr: Abbr): Conference | null => CONFERENCE_ORDER.find((c) => CONFERENCES[c].includes(abbr)) ?? null;

/**
 * The league table, or one conference's part of it: its teams in rating order, ranked among themselves (1 to
 * 15 in a conference), the same standard competition ranks as the league's.
 */
export function standings(model: Season, conference?: Conference): { order: Abbr[]; rank: Record<Abbr, number> } {
  if (!conference) return { order: model.order, rank: model.rank };
  const order = model.order.filter((a) => conferenceOf(a) === conference);
  return { order, rank: ranksOf(Object.fromEntries(order.map((a) => [a, model.r[a]]))) };
}

/** Whether another team shares `abbr`'s rank in `ranks`. */
export const tied = (ranks: Record<Abbr, number>, abbr: Abbr) => Object.entries(ranks).some(([a, r]) => a !== abbr && r === ranks[abbr]);

/** A team's place in the league table: "9th", or "tied 9th" when another team shares its rank. */
export const place = (model: Season, abbr: Abbr) => placeLabel(model.rank[abbr], tied(model.rank, abbr));

export type Phase = "regular" | "play-in" | "playoffs";
/**
 * What kind of game it was, a short tag for it ("Finals game 3", "NBA Cup", "Berlin"), if any, and whether it
 * counts in the standings: every regular-season game but the NBA Cup final, as the league counts them.
 */
export type Stage = { phase: Phase; label: string | null; standings: boolean };

// ESPN's game notes, tried in order. "NBA Cup - Semifinals" is a regular-season game, so the conference
// rounds are matched on their whole prefix. The Cup was the In-Season Tournament in its first season, 2023-24.
const STAGES: readonly (readonly [RegExp, Phase, string, standings?: false])[] = [
  [/^NBA Finals - Game (\d+)$/, "playoffs", "Finals game $1"],
  [/^(East|West) Finals - Game (\d+)$/, "playoffs", "$1 finals game $2"],
  [/^(East|West) Semifinals - Game (\d+)$/, "playoffs", "$1 semis game $2"],
  [/^(East|West) 1st Round - Game (\d+)$/, "playoffs", "1st round game $2"],
  [/^NBA Play-In\b.*$/, "play-in", "Play-In"],
  [/^NBA (?:Cup|In-Season Tournament) Championship$/, "regular", "NBA Cup final", false],
  [/^NBA (?:Cup|In-Season Tournament) - Semifinals$/, "regular", "NBA Cup semifinal"],
  [/^NBA (?:Cup|In-Season Tournament) - Quarterfinals$/, "regular", "NBA Cup quarterfinal"],
  [/^NBA (?:Cup|In-Season Tournament) - Group Play$/, "regular", "NBA Cup"],
  [/^NBA (.+?) Games?(?: \d{4})?$/, "regular", "$1"],
];

export function stage(note: string | null): Stage {
  if (note === null) return { phase: "regular", label: null, standings: true };
  for (const [pattern, phase, label, standings] of STAGES) {
    if (pattern.test(note)) return { phase, label: note.replace(pattern, label), standings: phase === "regular" && standings !== false };
  }
  return { phase: "regular", label: note, standings: true };
}

/** The last day of the regular season, once the play-in or the playoffs has a game, played or scheduled; null before. */
export function regularSeasonEnd(model: Season): string | null {
  const postseason = [...model.results.map((r) => r.game), ...model.upcoming].some((g) => stage(g.note).phase !== "regular");
  const days = model.results.filter((r) => stage(r.game.note).phase === "regular").map((r) => r.day);
  return postseason && days.length ? days.reduce((a, b) => (b > a ? b : a)) : null;
}

/**
 * The day each team's run ended, at its last game, or null while it goes on. A team is out once it loses a
 * fourth playoff game to one opponent, or once all sixteen playoff teams have a playoff game, played or
 * scheduled, and it is not one of them: that takes in every team the regular season or the play-in ended, and
 * in 2019-20 the eight left out of the bubble. The same rule serves a finished season and one in progress.
 */
export function runEnds(model: Season): Record<Abbr, string | null> {
  const last: Record<Abbr, string> = {};
  for (const r of model.results) for (const a of [r.game.home, r.game.away]) if (!(a in last) || r.day > last[a]) last[a] = r.day;
  const out = new Set<Abbr>();
  const losses = new Map<string, number>();
  for (const r of model.results) {
    if (stage(r.game.note).phase !== "playoffs") continue;
    const { winner, loser } = outcome(r);
    const key = `${loser.abbr} ${winner.abbr}`;
    losses.set(key, (losses.get(key) ?? 0) + 1);
    if (losses.get(key) === 4) out.add(loser.abbr);
  }
  const playoffGames = [...model.results.map((r) => r.game), ...model.upcoming].filter((g) => stage(g.note).phase === "playoffs");
  const field = new Set(playoffGames.flatMap((g) => [g.home, g.away]));
  if (field.size >= 16) for (const a of model.abbrs) if (!field.has(a)) out.add(a);
  return Object.fromEntries(model.abbrs.map((a) => [a, out.has(a) ? (last[a] ?? null) : null]));
}

export type Venue = "home" | "away" | "neutral";

/** How a game's line names the opponent's venue: "at" away, "vs" at home or on neutral ground. */
export const venueWord = (venue: Venue) => (venue === "away" ? "at" : "vs");

/** One of the team's final games from its side: `us` is the team, `them` the opponent; `upset`, won as one. */
export type TeamGame = { result: Result; us: Line; them: Line; venue: Venue; stage: Stage; upset: boolean };

export function teamGames(model: Season, abbr: Abbr): TeamGame[] {
  return model.log[abbr].map(({ result, side }) => {
    const o = outcome(result);
    return {
      result,
      us: side === "h" ? o.home : o.away,
      them: side === "h" ? o.away : o.home,
      venue: result.game.neutral ? "neutral" : side === "h" ? "home" : "away",
      stage: stage(result.game.note),
      upset: (side === "h" ? o.home : o.away).won && upset(o),
    };
  });
}

/** How many games make a team's recent form. */
export const RECENT = 5;

/** Wins and losses in `games`. */
export function recordOf(games: readonly TeamGame[]): [number, number] {
  const won = games.filter((g) => g.us.won).length;
  return [won, games.length - won];
}

/** A team's record in the standings, the one the league table shows: its regular-season games bar the NBA Cup final. */
export const standingsRecord = (model: Season, abbr: Abbr) => recordOf(teamGames(model, abbr).filter((g) => g.stage.standings));

/** How many games a team's page lists ahead. */
export const NEXT_GAMES = 5;

/** The team's next NEXT_GAMES games from `today` on, however far ahead, in tip-off order. */
export const nextGames = (model: Season, abbr: Abbr, today: string): Game[] =>
  model.upcoming
    .filter((g) => (g.home === abbr || g.away === abbr) && dayKey(g.t) >= today)
    .sort((x, y) => x.t.localeCompare(y.t))
    .slice(0, NEXT_GAMES);

/**
 * The ratings a week (WEEK days) before the season's latest day, for how far a team moved since. Null until the
 * season has played a week, since before opening night every team sits level at 1000, and once its latest day
 * is more than a week before `today`, since then no team has moved this week.
 */
export function weekAgo(model: Season, today: string): Snapshot | null {
  const i = model.series.length - 1 - WEEK;
  return i >= 1 && model.series[i + WEEK].day >= addDays(today, -WEEK) ? model.series[i] : null;
}
