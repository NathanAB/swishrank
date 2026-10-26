// Every page on the site as a value, and the one place that turns a page into a URL. The current season
// lives at the root and every other season under its own id, so adding a season to seasons.json moves the
// old one under /<id>/ without code changes.

import type { Conference } from "./teams.ts";

export type SeasonRef = { readonly id: string; readonly current: boolean };

export type Route =
  /** With `conference`, the table and chart cut to that conference; without it, the whole league. */
  | { kind: "home"; season: SeasonRef; conference?: Conference }
  /** `month` ("YYYY-MM") is that month's results alone; without it, the week ahead and the newest month. */
  | { kind: "games"; season: SeasonRef; month?: string }
  | { kind: "team"; season: SeasonRef; abbr: string }
  /** Every season as a plain link to its home: the season menu's fallback without script. */
  | { kind: "seasons" }
  | { kind: "about" };

/** A team's URL segment: its abbreviation in lower case (OKC becomes okc). */
export const teamSlug = (abbr: string) => abbr.toLowerCase();

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
    case "seasons":
      return "/seasons/";
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
      return { kind: "season", season: route.season };
    case "seasons":
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
 * conference carries over, a month of games does not, and a team that `to` lacks falls back to that season's
 * home.
 */
export function switchTarget(route: Route, to: SeasonRef, hasTeam: (abbr: string) => boolean): Route {
  switch (route.kind) {
    case "home":
      return { ...route, season: to };
    case "seasons":
    case "about":
      return { kind: "home", season: to };
    case "games":
      return { kind: "games", season: to };
    case "team":
      return hasTeam(route.abbr) ? { kind: "team", season: to, abbr: route.abbr } : { kind: "home", season: to };
    default: {
      const _exhaustive: never = route;
      return _exhaustive;
    }
  }
}
