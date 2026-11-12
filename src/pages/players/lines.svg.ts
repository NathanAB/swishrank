// Every kept player's rating line since the first full ranking, in grey, for the players page to draw behind the
// day's top five through <use>. Inline, its few hundred lines would add some 100 KB to the page; as a file the
// browser caches it. lib/player-chart.ts linesFile draws it on the same frame as the page's own lines.
import type { APIRoute } from "astro";
import { linesFile } from "../../lib/player-chart.ts";
import { playerChart } from "../../lib/season.ts";

export const GET: APIRoute = () => new Response(linesFile(playerChart()), { headers: { "Content-Type": "image/svg+xml" } });
