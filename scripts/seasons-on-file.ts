// Every season on file as the past-seasons test reads it (scripts/past-seasons.ts Season), for scripts/backtest-v5.ts
// and scripts/roster-check.ts. A file that is missing reads as undefined.
import { readFileSync } from "node:fs";
import type { SeasonData } from "../src/lib/elo.ts";
import type { Season } from "./past-seasons.ts";

const read = (url: URL): unknown => {
  try {
    return JSON.parse(readFileSync(url, "utf8"));
  } catch {
    return undefined;
  }
};
const data = (path: string) => read(new URL(`../src/data/${path}`, import.meta.url));

/** src/data/seasons.json: each season's id, and `end` once it is finished. */
export const listed = data("seasons.json") as { id: string; end?: string }[];

/** Every season of `listed`, in its order. */
export const seasons: Season[] = listed.map(({ id }) => ({
  data: data(`games/${id}.json`) as SeasonData,
  box: data(`box/${id}.json`),
  preseason: data(`preseason/${id}.json`),
  injuries: data(`injuries/${id}.json`),
  nbaReports: read(new URL(`nba-reports-at-tip/${id}.json`, import.meta.url)),
  stints: read(new URL(`stints/${id}.json`, import.meta.url)),
}));
