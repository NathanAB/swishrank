// What the sitemap says about each page beyond its URL.

// A finished season's pages, under /<id>/, and the pages that only change with the code.
const FIXED = /^\/(\d{4}-\d{2}|about|seasons)\//;

/**
 * When a page last changed, for the sitemap's lastmod. Every page of the season in progress is rebuilt from
 * the day's scores, so it changed at this build. A finished season's pages do not change between builds, and
 * a date Google finds untrue it stops reading (https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap),
 * so those carry none.
 */
export const lastmod = (pathname: string, builtAt: Date): string | undefined => (FIXED.test(pathname) ? undefined : builtAt.toISOString());
