// Which version of the model the site publishes. src/lib/elo.ts PARAMS and EARLY read its SIGMA and early widening,
// and src/lib/inputs.ts siteInputs() its on-court and roster settings, so switching the site to another version is
// this one line, plus the How it works page that src/lib/model-copy.test.ts holds to it. Each version's own record
// stays frozen where it is: V3 in src/lib/v3.ts, V4 in src/lib/v4.ts, V5 in src/lib/v5.ts.
import type { OnCourt } from "./inputs.ts";
import type { RosterRule } from "./roster-lineups.ts";
import { V5 } from "./v5.ts";

/** What the site prices with: a version's SIGMA and early widening, and the on-court and roster settings its inputs read, if any. */
export type SiteVersion = { readonly sigma: number; readonly widen: number; readonly onCourt?: OnCourt; readonly roster?: RosterRule };

/** The version the site publishes: version 5 (docs/model-v5.md, The switch). */
export const SITE: SiteVersion = V5;
