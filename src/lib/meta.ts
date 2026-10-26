// What a page says about itself to a search engine or a link preview: the site's name, and each page's title
// and description, built from the season model the page shows. Ranks, records and ratings come from the
// helpers the tables use, so a description never disagrees with the page under it.
import { START, type Abbr } from "./elo.ts";
import { rating, record } from "./format.ts";
import type { SeasonView } from "./season.ts";
import { place, standings, type Conference } from "./teams.ts";

/** The site's name: the wordmark, every document title and every share image. */
export const SITE_NAME = "SwishRank";

/** A share image's size in px: the 1.91:1 that link previews show. */
export const SHARE_SIZE = { width: 1200, height: 630 } as const;

type Shown = Pick<SeasonView, "model" | "current" | "label">;

/** "a", "a and b", "a, b and c" */
const list = (items: readonly string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** A season home's document title, led by the words people search for. */
export const homeTitle = (season: Pick<SeasonView, "label">, conference?: Conference) =>
  conference ? `${season.label} ${conference} power rankings` : `NBA power rankings ${season.label}`;

/** Who tops the league's table, or one conference's: "The Timberwolves lead at 1606." */
export function leaders(season: Shown, conference?: Conference): string {
  const m = season.model;
  if (m.results.length === 0) return `Every team starts at ${START}.`;
  const { order, rank } = standings(m, conference);
  const top = order.filter((a) => rank[a] === 1);
  const names = list(top.map((a) => `the ${m.data.teams[a].short}`));
  const where = conference ? ` in the ${conference}` : "";
  const verb = season.current ? (top.length > 1 ? "share the lead" : "lead") : top.length > 1 ? "finished tied for first" : "finished first";
  return `${names[0].toUpperCase()}${names.slice(1)} ${verb}${where} at ${rating(m.r[top[0]])}.`;
}

export function homeDescription(season: Shown, conference?: Conference): string {
  const count = standings(season.model, conference).order.length;
  const teams = conference ? `all ${count} ${conference}ern Conference teams` : `all ${count} NBA teams`;
  const lede = season.current
    ? `Elo ratings for ${teams}, fitted again every morning to every score this season.`
    : `How ${teams}' Elo ratings moved through ${season.label}.`;
  return `${lede} ${leaders(season, conference)}`;
}

/** "The Celtics are 9th of 30 at 1532 after 4 games (3–1)." and what the page holds. */
export function teamDescription(season: Pick<SeasonView, "model" | "current">, abbr: Abbr): string {
  const m = season.model;
  const { W, L } = m.stats[abbr];
  const name = `The ${m.data.teams[abbr].short}`;
  const holds = season.current ? "Rating chart, game log and next games." : "Rating chart and game log.";
  if (W + L === 0) return `${name} have not played yet; every team starts at ${START}. ${holds}`;
  const games = `${W + L} ${W + L === 1 ? "game" : "games"}`;
  return `${name} ${season.current ? "are" : "finished"} ${place(m, abbr)} of ${m.abbrs.length} at ${rating(m.r[abbr])} after ${games} (${record(W, L)}). ${holds}`;
}
