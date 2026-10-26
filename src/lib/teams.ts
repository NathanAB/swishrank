// One team's season as the team pages show it. Every change is the displayed one (facts.ts outcome), so a
// team's log agrees with the league's lists.
import { addDays, dayKey, type Abbr, type Game, type Result, type Season } from "./elo.ts";
import { outcome, type Line } from "./facts.ts";
import { WEEK } from "./fixtures.ts";

export type Phase = "regular" | "play-in" | "playoffs";
/** What kind of game it was, and a short tag for it ("Finals game 3", "Cup", "Berlin"), if any. */
export type Stage = { phase: Phase; label: string | null };

// ESPN's game notes, tried in order. "NBA Cup - Semifinals" is a regular-season game, so the conference
// rounds are matched on their whole prefix.
const STAGES: readonly (readonly [RegExp, Phase, string])[] = [
  [/^NBA Finals - Game (\d+)$/, "playoffs", "Finals game $1"],
  [/^(East|West) Finals - Game (\d+)$/, "playoffs", "$1 finals game $2"],
  [/^(East|West) Semifinals - Game (\d+)$/, "playoffs", "$1 semis game $2"],
  [/^(East|West) 1st Round - Game (\d+)$/, "playoffs", "1st round game $2"],
  [/^NBA Play-In\b.*$/, "play-in", "Play-In"],
  [/^NBA Cup Championship$/, "regular", "Cup final"],
  [/^NBA Cup - Semifinals$/, "regular", "Cup semifinal"],
  [/^NBA Cup - Quarterfinals$/, "regular", "Cup quarterfinal"],
  [/^NBA Cup - Group Play$/, "regular", "Cup"],
  [/^NBA (.+) Game \d{4}$/, "regular", "$1"],
];

export function stage(note: string | null): Stage {
  if (note === null) return { phase: "regular", label: null };
  for (const [pattern, phase, label] of STAGES) if (pattern.test(note)) return { phase, label: note.replace(pattern, label) };
  return { phase: "regular", label: note };
}

export type Venue = "home" | "away" | "neutral";

/** One of the team's final games from its side: `us` is the team, `them` the opponent. */
export type TeamGame = { result: Result; us: Line; them: Line; venue: Venue; stage: Stage };

export function teamGames(model: Season, abbr: Abbr): TeamGame[] {
  return model.log[abbr].map(({ result, side }) => {
    const o = outcome(result);
    return {
      result,
      us: side === "h" ? o.home : o.away,
      them: side === "h" ? o.away : o.home,
      venue: result.game.neutral ? "neutral" : side === "h" ? "home" : "away",
      stage: stage(result.game.note),
    };
  });
}

/** The team's games in the week ahead (the games page's WEEK from `today`), in tip-off order. */
export const nextGames = (model: Season, abbr: Abbr, today: string): Game[] => {
  const end = addDays(today, WEEK);
  return model.upcoming
    .filter((g) => (g.home === abbr || g.away === abbr) && dayKey(g.t) >= today && dayKey(g.t) < end)
    .sort((x, y) => x.t.localeCompare(y.t));
};
