// Version 5 with roster-based lineups (issue 70, src/lib/roster-lineups.ts): version 5's own choice of on-court
// settings, SIGMA and early widening for the earlier seasons, as scripts/candidates/v5.ts chooses them, with each game's
// lineup built from the team's recent roster at the fill scripts/roster-candidates.ts chooses. It reuses v5.ts's
// candidate, so its search is fitted once in a run. Scored against version 5 as well as version 4.
import type { Candidate } from "../past-seasons.ts";
import { chooseFill } from "../roster-candidates.ts";
import version5Default, { priced, type version5 } from "./v5.ts";

/** `v5` with roster-based lineups: its settings for the earlier seasons, at the fill chosen from them. */
export const version5Roster = (v5: ReturnType<typeof version5>): Candidate => ({
  name: "Version 5 with roster-based lineups",
  choose: (earlier) => priced(earlier, v5.settings(earlier), { fill: chooseFill(earlier) }),
});

/** Candidate files this one is also scored against (scripts/backtest-v5.ts). */
export const against = ["v5"];

export default version5Roster(version5Default);
