// The figures the about page uses to explain the model, worked out with elo.ts's own functions so the
// explanation cannot drift from the ratings it describes.
import { exchange, gap, HCA, K, shownChange, spreadPoints, START, winProb, type Game, type Result, type Season } from "./elo.ts";
import { outcome, type Line } from "./facts.ts";

/** One team's side of a game, taken apart in the order the exchange is worked out. */
export type Step = Line & {
  /** Rating before the game, unrounded. */
  before: number;
  /** Home-court points added for this game only. */
  edge: number;
  /** The result (a win scores 1, a loss 0) less the pre-game chance. */
  surprise: number;
  /** Rating points gained, negative when lost, unrounded. */
  moved: number;
};

export type Worked = {
  result: Result;
  home: Step;
  away: Step;
  winner: Step;
  loser: Step;
  /** Home-court-adjusted gap, home minus away. */
  gap: number;
  /** That gap in points on the spread. */
  spread: number;
  margin: number;
  /** The margin-of-victory multiplier this game's exchange used. */
  multiplier: number;
};

export function worked(result: Result): Worked {
  const o = outcome(result);
  const { game, pre, shift } = result;
  const step = (l: Line): Step => ({
    ...l,
    before: pre[l.side],
    edge: l.side === "h" && !game.neutral ? HCA : 0,
    surprise: (l.won ? 1 : 0) - l.chance,
    moved: l.side === "h" ? shift : -shift,
  });
  const home = step(o.home);
  const away = step(o.away);
  const [winner, loser] = o.winner.side === "h" ? [home, away] : [away, home];
  const g = gap(game, { [game.home]: pre.h, [game.away]: pre.a });
  return {
    result, home, away, winner, loser,
    gap: g,
    spread: spreadPoints(g),
    margin: winner.score - loser.score,
    // exchange() does not return its multiplier; points moved = K x multiplier x surprise gives it back.
    multiplier: winner.moved / (K * winner.surprise),
  };
}

/** The favourite's win chance and point spread for a rating gap. */
export const gapRow = (points: number) => ({ points, chance: winProb(points), spread: spreadPoints(points) });

/**
 * The points a winner gains by `margin` when both teams start at 1500, as the site shows them: at a
 * neutral site, and with home court for a home win and for a road win.
 */
export function winWorth(margin: number) {
  const gained = (diff: number, homeWins: boolean) => {
    const { shift } = exchange(diff, homeWins ? margin : 0, homeWins ? 0 : margin);
    return shownChange(START, START + Math.abs(shift));
  };
  return { margin, neutral: gained(0, true), home: gained(HCA, true), road: gained(HCA, false) };
}

export type Stage = "Regular season" | "NBA Cup final" | "Play-in" | "Playoffs";

// ESPN's game note names the stage. NBA Cup games before the final, games abroad and make-ups are
// regular season, so anything no rule claims is too. "Semifinals" alone is both a Cup round and a
// playoff round, hence the conference prefix.
const STAGES: readonly { stage: Exclude<Stage, "Regular season">; test: RegExp }[] = [
  { stage: "NBA Cup final", test: /^NBA Cup Championship/ },
  { stage: "Play-in", test: /^NBA Play-In/ },
  { stage: "Playoffs", test: /^(East|West) (1st Round|Semifinals|Finals) - |^NBA Finals - / },
];
const ORDER: readonly Stage[] = ["Regular season", "NBA Cup final", "Play-in", "Playoffs"];

export const stageOf = (game: Game): Stage => STAGES.find((s) => s.test.test(game.note ?? ""))?.stage ?? "Regular season";

/** The games a season counted, by stage in calendar order, leaving out stages it has no games in. */
export function stageCounts(model: Season): { stage: Stage; games: number }[] {
  const counts = new Map<Stage, number>();
  for (const r of model.results) {
    const stage = stageOf(r.game);
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  }
  return ORDER.flatMap((stage) => {
    const games = counts.get(stage) ?? 0;
    return games ? [{ stage, games }] : [];
  });
}
