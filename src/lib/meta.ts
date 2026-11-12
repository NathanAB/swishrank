// What a page says about itself to a search engine or a link preview: the site's name, and each page's title
// and description, built from the season model the page shows. Ranks, records and ratings come from the
// helpers the tables use, so a description never disagrees with the page under it.
import type { Abbr } from "./elo.ts";
import { longDay, matchup, pct, rating, record } from "./format.ts";
import type { GameView } from "./game.ts";
import type { SeasonView } from "./season.ts";
import { place, standings, standingsRecord, type Conference } from "./teams.ts";

/** The site's name: the wordmark, every document title and every share image. */
export const SITE_NAME = "SwishRank";

/** A share image's size in px: the 1.91:1 that link previews show. */
export const SHARE_SIZE = { width: 1200, height: 630 } as const;

type Shown = Pick<SeasonView, "model" | "current" | "label">;

/** "a", "a and b", "a, b and c" */
const list = (items: readonly string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** A season home's document title, led by the words people search for. */
export const homeTitle = (season: Pick<SeasonView, "label">, conference?: Conference) =>
  conference ? `${season.label} ${conference} power rankings` : `NBA Elo ratings and power rankings ${season.label}`;

/** A season home's h1, and its share image's heading, which has room for one line at this length. */
export const homeHeading = (season: Pick<SeasonView, "label">, conference?: Conference) =>
  conference ? `${season.label} · ${conference}ern Conference` : `${season.label} NBA Elo ratings`;

/** Who tops the league's table, or one conference's: "The Timberwolves lead at 1606." */
export function leaders(season: Shown, conference?: Conference): string {
  const m = season.model;
  if (m.results.length === 0) return "Every team starts from its preseason odds.";
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
    ? `Elo ratings for ${teams}, fitted again after each day of games to every score this season.`
    : `How ${teams}' Elo ratings moved through ${season.label}.`;
  return `${lede} ${leaders(season, conference)}`;
}

/** The odds page's document title, led by the words people search for. */
export const oddsTitle = (season: Pick<SeasonView, "label">, conference?: Conference) =>
  conference ? `${season.label} ${conference} playoff odds` : `NBA playoff and title odds ${season.label}`;

/** "Every NBA team's projected record and its chances … The Spurs have the best title chance, at 25%." */
export function oddsDescription(season: Shown, title: Record<Abbr, number>, conference?: Conference): string {
  const { order } = standings(season.model, conference);
  const best = [...order].sort((a, b) => title[b] - title[a])[0];
  const who = conference ? `Every ${conference}ern Conference team's` : "Every NBA team's";
  const lead = best ? ` The ${season.model.data.teams[best].short} have the best title chance${conference ? ` in the ${conference}` : ""}, at ${Math.round(title[best])}%.` : "";
  return `${who} projected record and its chances to make the playoffs and win the title.${lead}`;
}

/** "The Celtics are 9th of 30 at 1032 with a 3–1 record." and what the page holds. */
export function teamDescription(season: Pick<SeasonView, "model" | "current">, abbr: Abbr): string {
  const m = season.model;
  const [W, L] = standingsRecord(m, abbr);
  const name = `The ${m.data.teams[abbr].short}`;
  const holds = season.current ? "Playoff and title odds, rating chart, rating history and next games." : "Rating chart and rating history.";
  if (W + L === 0) return `${name} have not played yet, so they are rated on their preseason odds. ${holds}`;
  return `${name} ${season.current ? "are" : "finished"} ${place(m, abbr)} of ${m.abbrs.length} at ${rating(m.r[abbr])} with a ${record(W, L)} record. ${holds}`;
}

/** "The Pacers beat the Thunder 117–114 on Friday, January 23, with a 5% chance." or the chances of a game to come. */
export function gameDescription(season: Pick<SeasonView, "model">, view: GameView): string {
  const short = (a: Abbr) => season.model.data.teams[a].short;
  const { away, home } = view;
  const when = longDay(view.day);
  const winner = [away, home].find((s) => s.line?.won);
  const loser = winner === away ? home : away;
  if (winner?.line && loser.line) {
    return `The ${short(winner.abbr)} beat the ${short(loser.abbr)} ${record(winner.line.score, loser.line.score)} on ${when}, with a ${pct(winner.chance)} chance. Win chances, rating changes and both teams' recent games.`;
  }
  return `${matchup(`The ${short(away.abbr)}`, `the ${short(home.abbr)}`, view.game.neutral)} on ${when}: ${pct(away.chance)} to ${pct(home.chance)} on today's ratings. Win chances and both teams' recent games.`;
}

/** The players page's document title, led by the words people search for. */
export const PLAYERS_TITLE = "Best NBA players by rating";

/** The how-it-works page's document title, led by the words people search for. */
export const ABOUT_TITLE = "How NBA Elo ratings work";

/** The track record page's document title, led by the words people search for. */
export const RECORD_TITLE = "NBA prediction accuracy and track record";

/** "How SwishRank's pre-game win chances score on 13,452 NBA games since 2015–16 …", with the figures the page shows. */
export const recordDescription = (since: string, games: string, won: string, logLoss: { model: string; vegas: string }) =>
  `How SwishRank's pre-game win chances score on ${games} NBA games since ${since}: the favorite won ${won}. On the games Vegas priced, the model's log loss is ${logLoss.model} and Vegas's ${logLoss.vegas}, where lower is better.`;

/** "Every NBA player's rating since 2015–16 … Nikola Jokic is No. 1 at 99, as he has been since Mar 2023." */
export const playersDescription = (since: string, lead: { name: string; rating: string; from: string }) =>
  `Every NBA player's rating since ${since}, in points over a full 48 minutes against an average player, and who was No. 1 when. ${lead.name} is No. 1 at ${lead.rating}, as he has been since ${lead.from}.`;
