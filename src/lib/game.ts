// One game as its page shows it: the two teams side by side, away first, each with the figures its block shows
// and its last five games before this one. A played game shows the rating, place and record it left each team
// with and the chances it was played at; a game to come shows them as they stand, with today's chances.
import { dayKey, ranksOf, type Abbr, type Game, type Season } from "./elo.ts";
import { outcome, upset, type Line } from "./facts.ts";
import { fixture } from "./fixtures.ts";
import { placeLabel } from "./format.ts";
import { RECENT, recordOf, stage, teamGames, tied, type Stage, type TeamGame } from "./teams.ts";

export type GameSide = {
  abbr: Abbr;
  /** Away on the left of the page, home on the right. */
  side: "away" | "home";
  /** Win chance at tip-off for a played game; on today's ratings for one to come. */
  chance: number;
  /** The team's line of the result; null until the game is played. */
  line: Line | null;
  /** Won with under UPSET percent at tip-off. */
  upset: boolean;
  /** Rating after the game's day, or now. */
  rating: number;
  /** League place after the game's day, or now: "9th" or "tied 9th". */
  place: string;
  /** Wins and losses after the game, or now: in the standings for a regular-season game, in the postseason for one after it. */
  record: [number, number];
  /** Up to RECENT games before this one, oldest first. */
  previous: TeamGame[];
};

export type GameView = {
  game: Game;
  /** The game's US Eastern day. */
  day: string;
  played: boolean;
  stage: Stage;
  /** A playoff series' score after this game, "Knicks win 4–1"; null outside the playoffs. */
  series: string | null;
  away: GameSide;
  home: GameSide;
};

/** The playoff series' score once `game` is played, or before it for one to come, named by the leader. */
function seriesScore(model: Season, game: Game, short: (a: Abbr) => string): string | null {
  if (stage(game.note).phase !== "playoffs") return null;
  const won: Record<Abbr, number> = { [game.home]: 0, [game.away]: 0 };
  for (const g of model.data.games) {
    const pair = (g.home === game.home && g.away === game.away) || (g.home === game.away && g.away === game.home);
    if (!pair || !g.final || g.hs === null || g.as === null || g.t > game.t || stage(g.note).phase !== "playoffs") continue;
    won[g.hs > g.as ? g.home : g.away]++;
  }
  const [lead, trail] = [game.away, game.home].sort((x, y) => won[y] - won[x]);
  if (won[lead] === won[trail]) return `Series tied ${won[lead]}–${won[trail]}`;
  return `${short(lead)} ${won[lead] === 4 ? "win" : "lead"} ${won[lead]}–${won[trail]}`;
}

export function gameView(model: Season, game: Game): GameView {
  const day = dayKey(game.t);
  const result = model.results.find((r) => r.game.id === game.id) ?? null;
  const o = result && outcome(result);
  const after = o && model.series.find((s) => s.day === day);
  const ranks = after ? ranksOf(after.r) : model.rank;
  const pHome = result ? result.p : fixture(game, model).lines[1].chance;
  const postseason = stage(game.note).phase !== "regular";

  const side = (abbr: Abbr, s: GameSide["side"]): GameSide => {
    const games = teamGames(model, abbr);
    const line = o ? (s === "home" ? o.home : o.away) : null;
    return {
      abbr,
      side: s,
      chance: s === "home" ? pHome : 1 - pHome,
      line,
      upset: o !== null && line?.won === true && upset(o),
      rating: line ? line.rating : model.r[abbr],
      place: placeLabel(ranks[abbr], tied(ranks, abbr)),
      record: recordOf(games.filter((g) => g.result.day <= day && (postseason ? g.stage.phase !== "regular" : g.stage.standings))),
      previous: games.filter((g) => g.result.day < day).slice(-RECENT),
    };
  };

  return {
    game,
    day,
    played: o !== null,
    stage: stage(game.note),
    series: seriesScore(model, game, (a) => model.data.teams[a].short),
    away: side(game.away, "away"),
    home: side(game.home, "home"),
  };
}

/** The narrowest share a team's block takes, so the smaller block still holds its name and number. */
const FLOOR = 0.24;

/** A team block's share of the header's width: its share of the points once played, its win chance before. */
export function blockShare(view: GameView, side: GameSide): number {
  const { away, home } = view;
  const raw = side.line && away.line && home.line ? side.line.score / (away.line.score + home.line.score) : side.chance;
  return Math.min(1 - FLOOR, Math.max(FLOOR, raw));
}
