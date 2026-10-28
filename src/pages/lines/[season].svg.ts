// Every team's daily rating line for one season, drawn once for the season's pages that show only some teams in
// front of the rest (a team's page, a game's page) through <use>. Inline, thirty lines would add about 90 KB to
// each of a season's 1,300 game pages; as one file each page reuses it from the cache. lib/chart.ts seasonPlot
// draws it, on the same scale as the pages' own lines.
import type { APIRoute } from "astro";
import { seasonPlot } from "../../lib/chart.ts";
import { allSeasons, type SeasonView } from "../../lib/season.ts";

export function getStaticPaths() {
  return allSeasons().map((season) => ({ params: { season: season.id }, props: { season } }));
}

type Props = { season: SeasonView };

export const GET: APIRoute<Props> = ({ props }) =>
  new Response(seasonPlot(props.season.model).leagueLines(), { headers: { "Content-Type": "image/svg+xml" } });
