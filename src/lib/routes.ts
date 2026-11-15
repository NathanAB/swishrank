// Every page on the site as a value, and the one place that turns a page into a URL. The current season
// lives at the root and every other season under its own id, so adding a season to seasons.json moves the
// old one under /<id>/ without code changes.

import { dayKey, type Game } from "./elo.ts";
import { between } from "./format.ts";
import type { Conference } from "./teams.ts";

export type SeasonRef = { readonly id: string; readonly current: boolean };

export type Route =
  /** With `conference`, the table and chart cut to that conference; without it, the whole league. */
  | { kind: "home"; season: SeasonRef; conference?: Conference }
  /** `month` ("YYYY-MM") is that month's results alone; without it, the week ahead and the newest month. */
  | { kind: "games"; season: SeasonRef; month?: string }
  | { kind: "team"; season: SeasonRef; abbr: string }
  /** Every team's projected record and chances, for the whole league or one conference; the season in progress only. */
  | { kind: "odds"; season: SeasonRef; conference?: Conference }
  /** One game, played or to come: its day and its two teams name it, as no two teams meet twice in a day. */
  | { kind: "game"; season: SeasonRef; game: GameRef }
  /** Every season as a plain link to its home: the season menu's fallback without script. */
  | { kind: "seasons" }
  /** The best players in the league and how that changed, across every season: it has no season of its own. */
  | { kind: "players" }
  /** One player: his rating over his career, what it is made of, what he is worth to his team and his games. */
  | { kind: "player"; id: number; name: string }
  /** How every pre-game chance since the first season has scored: it has no season of its own. */
  | { kind: "record" }
  /** How often a player on the NBA's injury report plays, by status, player and team: it has no season of its own. */
  | { kind: "injury-report" }
  | { kind: "about" };

/** What a game's URL is made of. */
export type GameRef = Pick<Game, "t" | "home" | "away" | "neutral">;

/** A team's URL segment: its abbreviation in lower case (OKC becomes okc). */
export const teamSlug = (abbr: string) => abbr.toLowerCase();

/** A game's place under its season's games: its US Eastern day, then the two teams, 2026-01-23/ind-at-okc. */
export const gameSlug = (g: GameRef) => ({ day: dayKey(g.t), matchup: `${teamSlug(g.away)}-${between(g.neutral)}-${teamSlug(g.home)}` });

/** A player's URL segment: his name without accents, then his ESPN id, which tells apart two players of one name. */
export const playerSlug = (id: number, name: string) => `${slugify(name.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))}-${id}`;

/** A conference's URL segment: east or west. */
export const conferenceSlug = (conference: Conference) => conference.toLowerCase();

const prefix = (season: SeasonRef) => (season.current ? "" : `/${season.id}`);

/** The page's path below the site base, always with a trailing slash. */
export function routePath(route: Route): string {
  switch (route.kind) {
    case "home":
      return `${prefix(route.season)}/${route.conference ? `${conferenceSlug(route.conference)}/` : ""}`;
    case "games":
      return `${prefix(route.season)}/games/${route.month ? `${route.month}/` : ""}`;
    case "team":
      return `${prefix(route.season)}/teams/${teamSlug(route.abbr)}/`;
    case "odds":
      return `${prefix(route.season)}/odds/${route.conference ? `${conferenceSlug(route.conference)}/` : ""}`;
    case "game": {
      const { day, matchup } = gameSlug(route.game);
      return `${prefix(route.season)}/games/${day}/${matchup}/`;
    }
    case "seasons":
      return "/seasons/";
    case "players":
      return "/players/";
    case "player":
      return `/players/${playerSlug(route.id, route.name)}/`;
    case "record":
      return "/record/";
    case "injury-report":
      return "/injury-report/";
    case "about":
      return "/about/";
    default: {
      const _exhaustive: never = route;
      return _exhaustive;
    }
  }
}

/** A link preview's picture: a season's whole-league rating chart, or one team's line on it. */
export type ShareImage = { kind: "season"; season: SeasonRef } | { kind: "team"; season: SeasonRef; abbr: string };

/**
 * The picture a page shares. A page without a season of its own, or with no route at all such as the
 * not-found page, shares `current`'s, the season in progress.
 */
export function shareImage(route: Route | undefined, current: SeasonRef): ShareImage {
  if (!route) return { kind: "season", season: current };
  switch (route.kind) {
    case "team":
      return { kind: "team", season: route.season, abbr: route.abbr };
    case "home":
    case "games":
    case "game":
    case "odds":
      return { kind: "season", season: route.season };
    case "seasons":
    case "players":
    case "player":
    case "record":
    case "injury-report":
    case "about":
      return { kind: "season", season: current };
    default: {
      const _exhaustive: never = route;
      return _exhaustive;
    }
  }
}

/** A share image's file name without .png, the param of src/pages/share/[image].png.ts: 2025-26 or 2025-26-okc. */
export function shareName(image: ShareImage): string {
  switch (image.kind) {
    case "season":
      return image.season.id;
    case "team":
      return `${image.season.id}-${teamSlug(image.abbr)}`;
    default: {
      const _exhaustive: never = image;
      return _exhaustive;
    }
  }
}

/** A share image's path below the site base. */
export const sharePath = (image: ShareImage) => `/share/${shareName(image)}.png`;

/** A path under the site base, for files in public/ and for routePath(). */
export const withBase = (path: string) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`;

/** The link to a page, base included. Every internal link goes through this. */
export const href = (route: Route) => withBase(routePath(route));

/**
 * The page a reader lands on when they pick season `to` from `route`: the same page in that season. A
 * conference carries over, a month of games or a game does not, a team that `to` lacks falls back to that
 * season's home, and so do the odds in a season that is over.
 */
export function switchTarget(route: Route, to: SeasonRef, hasTeam: (abbr: string) => boolean): Route {
  switch (route.kind) {
    case "home":
      return { ...route, season: to };
    case "seasons":
    case "players":
    case "player":
    case "record":
    case "injury-report":
    case "about":
      return { kind: "home", season: to };
    case "games":
    case "game":
      return { kind: "games", season: to };
    case "team":
      return hasTeam(route.abbr) ? { kind: "team", season: to, abbr: route.abbr } : { kind: "home", season: to };
    case "odds":
      return to.current ? { ...route, season: to } : { kind: "home", season: to, conference: route.conference };
    default: {
      const _exhaustive: never = route;
      return _exhaustive;
    }
  }
}

/** A name as a URL segment would spell it: "Trail Blazers" and "trail%20blazers" both become trail-blazers. */
export const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** What guessPath knows of the site: the current season's id, each team name's slug, and each month's season. */
export type Guesses = {
  current: string;
  /** A team's nickname, full name or code, slugified, to its slug. */
  aliases: Record<string, string>;
  /** A month with games, YYYY-MM, to its season's id. */
  months: Record<string, string>;
};

/**
 * The page a path with no page most likely meant, or null when there is no better guess: the not-found page
 * sends the reader there. Case is ignored, a season may be written with the en dash the site shows, the
 * current season's id is dropped since that season lives at the root, a team may be named by any of its
 * aliases, and a month of games, or a game by its day, goes under the season that month belongs to, so a game's
 * link shared during its season still finds it once the next season takes the root. A guess is its own guess,
 * so a guess that has no page either stops there.
 */
export function guessPath(path: string, { current, aliases, months }: Guesses): string | null {
  let parts: string[];
  try {
    parts = path.split("/").filter(Boolean).map((p) => decodeURIComponent(p).toLowerCase().replace(/[–—]/g, "-"));
  } catch {
    return null;
  }
  if (parts[0] === current) parts.shift();
  const t = parts.indexOf("teams");
  if (t >= 0 && parts[t + 1]) parts[t + 1] = aliases[slugify(parts[t + 1])] ?? parts[t + 1];
  const g = parts.indexOf("games");
  const owner = g >= 0 && parts[g + 1] ? months[parts[g + 1].slice(0, 7)] : undefined;
  if (owner) parts = [...(owner === current ? [] : [owner]), ...parts.slice(g)];
  const guess = `/${parts.map(encodeURIComponent).join("/")}${parts.length ? "/" : ""}`;
  return guess === path ? null : guess;
}
