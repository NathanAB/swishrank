// Version 5's settings (docs/model-v5.md): version 4, with each player's value pulled toward his on-court rating as
// well as his box rating (src/lib/on-court.ts), and each game priced from its teams' rosters
// (src/lib/roster-lineups.ts). scripts/candidates/v5.ts chooses them from every finished season on file, all but how
// often the on-court rating is refitted: after every game day since 14 November 2026, where the search refits it after
// every 7th (docs/model-v5.md, Refitted every game day). `npm run backtest:v5` fails when they differ from what
// scripts/candidates/v5-daily.ts chooses. src/lib/site.ts says which version the site runs.
import type { OnCourt } from "./inputs.ts";
import type { RosterRule } from "./roster-lineups.ts";

export const V5 = {
  /** The on-court rating's ridge, half-life in days, box prior and game days between refits, and what the fit's player centre counts of it. */
  onCourt: { ridge: 1500, halfLife: 365, boxPrior: 0.5, refitEvery: 1, weight: 0.12 } satisfies OnCourt,
  sigma: 3.194,
  widen: 1.21,
  /** Roster-based lineups (src/lib/roster-lineups.ts), rates learned from every earlier season with NBA reports, at the fill scripts/roster-candidates.ts chooseFill() chooses from every finished season; scripts/candidates/v5-roster.ts's `frozen` checks it. */
  roster: { fill: -0.45 } satisfies RosterRule,
};
