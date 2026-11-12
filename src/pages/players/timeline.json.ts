// The players page's table and the teams it names (lib/season.ts playerChart), which the page's script fetches once
// the page has loaded to draw any other day or range. The page itself is drawn from the same table at build time.
import type { APIRoute } from "astro";
import { playerChart } from "../../lib/season.ts";

export const GET: APIRoute = () => new Response(JSON.stringify(playerChart()), { headers: { "Content-Type": "application/json" } });
