// Version 3's rookies (docs/model-v3.md): the players the model knows nothing about. A player's box rating starts
// at replacement level and his value is held near it with 320 games, so a player new to the league barely moves
// with his team's results. Version 3 holds a rookie's value with fewer games, so his results move him sooner. A
// rookie is a player whose first line in the box scores on file is in that season. The first season on file has
// none, since every player is new to the files there, not to the league. Nor does a player whose first line is for
// a team that had player lines in fewer than half its games the season before: ESPN has none for CHI and NO in
// 2015-16 to 2017-18, so their veterans' first lines on file come in 2018-19.
import { finalDays } from "./elo.ts";
import type { Athlete, SeasonPlayers } from "./players.ts";

/** The teams of a season with player lines in fewer than half their final games. */
function unlined({ data, box }: SeasonPlayers): Set<string> {
  const games = new Map<string, number>(), lined = new Map<string, number>();
  for (const { games: day } of finalDays(data)) for (const g of day) for (const abbr of [g.home, g.away]) {
    games.set(abbr, (games.get(abbr) ?? 0) + 1);
    if (box.games[g.id]?.[abbr]?.length) lined.set(abbr, (lined.get(abbr) ?? 0) + 1);
  }
  return new Set([...games].filter(([abbr, n]) => 2 * (lined.get(abbr) ?? 0) < n).map(([abbr]) => abbr));
}

/** Each season's rookies, by season id. */
export function newcomers(seasons: readonly SeasonPlayers[]): Map<string, Set<Athlete>> {
  const seen = new Set<Athlete>();
  const out = new Map<string, Set<Athlete>>();
  let dark = new Set<string>();
  [...seasons].sort((x, y) => x.data.season.localeCompare(y.data.season)).forEach((season, i) => {
    const firstTeam = new Map<Athlete, string>();
    for (const { games } of finalDays(season.data)) for (const g of games) {
      for (const [abbr, lines] of Object.entries(season.box.games[g.id] ?? {})) for (const l of lines ?? []) if (!firstTeam.has(l[0])) firstTeam.set(l[0], abbr);
    }
    const rookies = new Set<Athlete>();
    if (i > 0) for (const [a, abbr] of firstTeam) if (!seen.has(a) && !dark.has(abbr)) rookies.add(a);
    out.set(season.data.season, rookies);
    for (const a of firstTeam.keys()) seen.add(a);
    dark = unlined(season);
  });
  return out;
}
