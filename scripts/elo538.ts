// The backtest's baseline: the site's Elo before the re-fit, src/lib/elo.ts at commit 7659991, after
// FiveThirtyEight's NBA Elo. Every team starts at 1500, K = 20, home court is worth 100 points except at a
// neutral site, and a margin-of-victory multiplier scales each exchange, applied game by game.
import type { SeasonData } from "../src/lib/elo.ts";

const K = 20;
const HCA = 100;
const START = 1500;

const winProb = (diff: number) => 1 / (1 + 10 ** (-diff / 400));

/** The home side's pre-game win chance for every final game, in the data's order. */
export function eloChances(data: SeasonData): { id: string; p: number }[] {
  const r: Record<string, number> = Object.fromEntries(Object.keys(data.teams).map((a) => [a, START]));
  const out: { id: string; p: number }[] = [];
  for (const game of data.games) {
    if (!game.final || game.hs === null || game.as === null) continue;
    const diff = r[game.home] + (game.neutral ? 0 : HCA) - r[game.away];
    const p = winProb(diff);
    const homeWon = game.hs > game.as;
    const mult = (Math.abs(game.hs - game.as) + 3) ** 0.8 / (7.5 + 0.006 * (homeWon ? diff : -diff));
    const shift = K * mult * ((homeWon ? 1 : 0) - p);
    r[game.home] += shift;
    r[game.away] -= shift;
    out.push({ id: game.id, p });
  }
  return out;
}
