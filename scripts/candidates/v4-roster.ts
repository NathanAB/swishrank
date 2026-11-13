// Version 4 with roster-based lineups (issue 70, src/lib/roster-lineups.ts): version 4's ratings, SIGMA and early
// widening, with each game's lineup built from the team's recent roster at rates learned from the seasons before it.
// The fill term is chosen from the earlier seasons (scripts/roster-candidates.ts chooseFill).
import type { Candidate } from "../past-seasons.ts";
import { chooseFill, version4With } from "../roster-candidates.ts";

const version4Roster: Candidate = {
  name: "Version 4 with roster-based lineups",
  choose: (earlier) => version4With(earlier, { fill: chooseFill(earlier) }),
};
export default version4Roster;
