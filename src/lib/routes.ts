// Every page on the site as a value, and the one place that turns a page into a URL. The current season
// lives at the root and every other season under its own id, so adding a season to seasons.json moves the
// old one under /<id>/ without code changes.

export type SeasonRef = { readonly id: string; readonly current: boolean };

export type Route =
  | { kind: "home"; season: SeasonRef }
  | { kind: "results"; season: SeasonRef; month?: string }
  | { kind: "fixtures" }
  | { kind: "teams"; season: SeasonRef }
  | { kind: "team"; season: SeasonRef; abbr: string }
  | { kind: "about" };

/** A team's URL segment: its abbreviation in lower case (OKC becomes okc). */
export const teamSlug = (abbr: string) => abbr.toLowerCase();

const prefix = (season: SeasonRef) => (season.current ? "" : `/${season.id}`);

/** The page's path below the site base, always with a trailing slash. */
export function routePath(route: Route): string {
  switch (route.kind) {
    case "home":
      return `${prefix(route.season)}/`;
    case "results":
      return `${prefix(route.season)}/results/${route.month ? `${route.month}/` : ""}`;
    case "fixtures":
      return "/fixtures/";
    case "teams":
      return `${prefix(route.season)}/teams/`;
    case "team":
      return `${prefix(route.season)}/teams/${teamSlug(route.abbr)}/`;
    case "about":
      return "/about/";
    default: {
      const _exhaustive: never = route;
      return _exhaustive;
    }
  }
}

/** A path under the site base, for files in public/ and for routePath(). */
export const withBase = (path: string) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`;

/** The link to a page, base included. Every internal link goes through this. */
export const href = (route: Route) => withBase(routePath(route));

/**
 * The page a reader lands on when they pick season `to` from `route`: the same page in that season.
 * Fixtures exist only for the current season, so another season gets its results; a month of results does
 * not carry over, and a team that `to` lacks falls back to that season's team list.
 */
export function switchTarget(route: Route, to: SeasonRef, hasTeam: (abbr: string) => boolean): Route {
  switch (route.kind) {
    case "home":
    case "about":
      return { kind: "home", season: to };
    case "results":
      return { kind: "results", season: to };
    case "fixtures":
      return to.current ? route : { kind: "results", season: to };
    case "teams":
      return { kind: "teams", season: to };
    case "team":
      return hasTeam(route.abbr) ? { kind: "team", season: to, abbr: route.abbr } : { kind: "teams", season: to };
    default: {
      const _exhaustive: never = route;
      return _exhaustive;
    }
  }
}
