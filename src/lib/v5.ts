// Version 5's settings (docs/model-v5.md): version 4, with each player's value pulled toward his on-court rating as
// well as his box rating (src/lib/on-court.ts). scripts/candidates/v5.ts chooses them from every finished season on
// file, and `npm run backtest:v5` fails when they differ from what it chooses. The site runs version 4 until
// SITE_ON_COURT points at them.
import type { OnCourt } from "./inputs.ts";
import type { RosterRule } from "./roster-lineups.ts";

export const V5 = {
  /** The on-court rating's ridge, half-life in days and box prior, and what the fit's player centre counts of it. */
  onCourt: { ridge: 1500, halfLife: 365, boxPrior: 0.5, weight: 0.12 } satisfies OnCourt,
  sigma: 3.194,
  widen: 1.21,
  /** Roster-based lineups (src/lib/roster-lineups.ts), rates learned from every earlier season with NBA reports, at the fill scripts/roster-candidates.ts chooseFill() chooses from every finished season; scripts/candidates/v5-roster.ts's `frozen` checks it. */
  roster: { fill: -0.45 } satisfies RosterRule,
};

/**
 * What the site's player values read of the on-court rating: nothing while it runs version 4. Set to V5.onCourt, the
 * site's seasons read scripts/stints/ (src/lib/season.ts) and its How it works page describes the on-court rating;
 * SIGMA and the early widening move with src/lib/elo.ts PARAMS and EARLY (issue 71).
 */
export const SITE_ON_COURT: OnCourt | undefined = undefined;

/**
 * How the site's lineups are built: version 4's while it runs version 4. Set to V5.roster, the site's games are priced
 * from each team's recent roster at rates learned from the earlier seasons (src/lib/season.ts). No page describes
 * them yet: src/lib/model-copy.test.ts fails until the How it works page is reread against the switch (issue 71).
 */
export const SITE_ROSTER: RosterRule | undefined = undefined;
