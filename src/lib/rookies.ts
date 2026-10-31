// Version 3's rookies (docs/model-v3.md): the players the model knows nothing about. A player's box rating starts
// at replacement level and his value is held near it with 320 games, so a player new to the league barely moves
// with his team's results. Version 3 holds a rookie's value with fewer games, so his results move him sooner. A
// rookie is a player whose first line in the box scores on file is in that season; the first season on file has
// none, since every player is new to the files there, not to the league.
import type { Athlete, SeasonPlayers } from "./players.ts";

/** Each season's rookies, by season id. */
export function newcomers(seasons: readonly SeasonPlayers[]): Map<string, Set<Athlete>> {
  const seen = new Set<Athlete>();
  const out = new Map<string, Set<Athlete>>();
  [...seasons].sort((x, y) => x.data.season.localeCompare(y.data.season)).forEach(({ data, box }, i) => {
    const here = new Set<Athlete>();
    for (const sides of Object.values(box.games)) for (const lines of Object.values(sides)) for (const l of lines ?? []) here.add(l[0]);
    out.set(data.season, i === 0 ? new Set() : new Set([...here].filter((a) => !seen.has(a))));
    for (const a of here) seen.add(a);
  });
  return out;
}
