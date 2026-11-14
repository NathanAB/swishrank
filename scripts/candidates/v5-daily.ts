// Version 5 as the site runs it: scripts/candidates/v5-roster.ts with the on-court rating refitted after every game
// day, where the search refits it after every 7th. Every other setting is the one v5-roster.ts chooses for the earlier
// seasons, so the two differ in the refits alone. Scored against v5-roster.ts as well as version 4.
import { V5 } from "../../src/lib/v5.ts";
import type { Candidate } from "../past-seasons.ts";
import { chooseFill, withRoster } from "../roster-candidates.ts";
import version5Default, { describe, priced, type Settings, type version5 } from "./v5.ts";

const daily = (settings: Settings): Settings => ({ ...settings, onCourt: { ...settings.onCourt, refitEvery: 1 } });

/** `v5` with roster-based lineups and daily refits: its settings for the earlier seasons, at the fill chosen from them. */
export const version5Daily = (v5: ReturnType<typeof version5>): Candidate => ({
  name: "Version 5 with roster-based lineups, refitted every game day",
  choose: (earlier) => priced(earlier, daily(v5.settings(earlier)), { fill: chooseFill(earlier) }),
});

/** Candidate files this one is also scored against (scripts/backtest-v5.ts). */
export const against = ["v5-roster"];

/** The settings src/lib/v5.ts holds for the site, which `npm run backtest:v5` checks against the ones chosen from every finished season. */
export const frozen = withRoster(describe(V5), V5.roster);

export default version5Daily(version5Default);
