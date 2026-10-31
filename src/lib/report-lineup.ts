// Version 3's lineups (docs/model-v3.md): the lineup a game is predicted with is version 2's, the players of the
// team's previous game, less everyone the day's injury report lists as out. The report is the first one the fetch
// saved that US Eastern day, and only a report saved before the day's first tip-off counts, so a game's lineup
// never reads news from after it began. A game on a day without such a report keeps version 2's lineup.
import { dayKey, type Abbr, type SeasonData } from "./elo.ts";
import { beforeTip, type InjuryArchive, type Report } from "./injuries.ts";
import type { Lineup, Sides } from "./players.ts";

/** The statuses that take a player out of a lineup. ESPN also lists "Day-To-Day", and most of those play. */
export const OUT_STATUSES: ReadonlySet<string> = new Set(["Out"]);

/** The athletes `report` lists as out for `team`. */
function outFor(team: Abbr, report: Report | undefined): Set<number> {
  const out = new Set<number>();
  for (const entry of report?.injuries ?? []) if (entry.team === team && OUT_STATUSES.has(entry.status)) out.add(entry.athlete);
  return out;
}

/**
 * `lineup` less every player `report` lists as out for `team`, the rest rescaled so the shares keep their total
 * (5, or 240 minutes). Empty stays empty; a lineup with everyone out is empty.
 */
export function withoutOut(lineup: Lineup, team: Abbr, report: Report | undefined): Lineup {
  const out = outFor(team, report);
  const kept = lineup.filter((p) => !out.has(p.athlete));
  if (kept.length === lineup.length) return lineup.map((p) => ({ ...p }));
  const total = lineup.reduce((s, p) => s + p.share, 0);
  const left = kept.reduce((s, p) => s + p.share, 0);
  return left > 0 ? kept.map((p) => ({ athlete: p.athlete, share: (p.share * total) / left })) : [];
}

/**
 * Version 3's lineups: every game in `previous` with its US Eastern day's report applied, from the reports fetched
 * before that day's first tip-off. A game whose day has no such report keeps its previous lineups.
 */
export function reportLineups(data: SeasonData, previous: ReadonlyMap<string, Sides<Lineup>>, archive: InjuryArchive | undefined): Map<string, Sides<Lineup>> {
  const days = archive ? beforeTip(archive, data.games).days : {};
  const byId = new Map(data.games.map((g) => [g.id, g]));
  const out = new Map<string, Sides<Lineup>>();
  for (const [id, sides] of previous) {
    const game = byId.get(id);
    const report = game ? days[dayKey(game.t)] : undefined;
    out.set(id, game
      ? { home: withoutOut(sides.home, game.home, report), away: withoutOut(sides.away, game.away, report) }
      : { home: sides.home.map((p) => ({ ...p })), away: sides.away.map((p) => ({ ...p })) });
  }
  return out;
}

/**
 * The lineups games to come are priced with: each team's `next` lineup less the players `report`, the latest
 * report fetched before the day's first tip-off, lists as out.
 */
export function reportNext(next: Readonly<Record<Abbr, Lineup>>, report: Report | undefined): Record<Abbr, Lineup> {
  return Object.fromEntries(Object.entries(next).map(([abbr, lineup]) => [abbr, withoutOut(lineup, abbr, report)]));
}
