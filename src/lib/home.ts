// Version 3's home edge (docs/model-v3.md). Version 2 fixes the home edge at 0.622, measured over 2015-16 to
// 2018-19, when home teams won about 59% of their games; since 2020 they have won about 55%. Version 3 measures it
// again before each season from the seasons just before it, so it follows the league without being fitted to the
// season it prices.
import { b2bTerm, counted, secondNights, type FitRule, type SeasonData } from "./elo.ts";

/** How many seasons before a season its home edge reads, and the edge of a season with none before it. */
export type HomeTrail = { seasons: number; fallback: number };
/** Version 3's home edge: the last 3 seasons' mean, or version 2's 0.622 for a season with none before it. */
export const HOME_TRAIL: HomeTrail = { seasons: 3, fallback: 0.622 };
/** A season's home edge, the number of games it is the mean of, and the seasons those games came from, oldest first. */
export type HomeEdge = { value: number; games: number; from: string[] };

/**
 * Each season's home edge, in `rule`'s margin units: over the final, non-neutral games of the `trail.seasons` seasons
 * before it in `all` (ordered by season id), the mean of counted(home margin) less the back-to-back term, which the fit
 * takes out of every margin, so the edge is measured on the fit's footing. A season with none before it gets `fallback`.
 */
export function trailingHomeEdges(all: readonly SeasonData[], rule: FitRule, trail: HomeTrail = HOME_TRAIL): Map<string, HomeEdge> {
  const ordered = [...all].sort((x, y) => x.season.localeCompare(y.season));
  // Each season's own sum and count, so a season's edge pools the games of the seasons before it, not their means.
  const totals = ordered.map((data) => {
    const second = secondNights(data);
    let sum = 0, games = 0;
    for (const g of data.games) {
      if (!g.final || g.neutral || g.hs === null || g.as === null) continue;
      sum += counted(g.hs - g.as, rule.margin) - b2bTerm(rule, second.get(g.id)!);
      games++;
    }
    return { season: data.season, sum, games };
  });
  const out = new Map<string, HomeEdge>();
  ordered.forEach((data, i) => {
    const before = totals.slice(Math.max(0, i - trail.seasons), i).filter((t) => t.games > 0);
    const games = before.reduce((s, t) => s + t.games, 0);
    out.set(data.season, {
      value: games ? before.reduce((s, t) => s + t.sum, 0) / games : trail.fallback,
      games,
      from: before.map((t) => t.season),
    });
  });
  return out;
}
