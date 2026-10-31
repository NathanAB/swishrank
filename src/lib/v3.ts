// Version 3's settings (docs/model-v3.md), as the site runs them since 2026-10-31: version 2 with a home edge from
// the three seasons before, each game's lineup less the players that morning's injury report lists as out, and a
// rookie's value held with 40 games instead of 320. SIGMA, the early widening and the rookie hold live in
// src/lib/elo.ts's PARAMS and EARLY; `npm run backtest:v3` fails if they differ from what the plan fits.
import { EARLY, PARAMS } from "./elo.ts";
import { HOME_TRAIL } from "./home.ts";
import { OUT_STATUSES } from "./report-lineup.ts";

export const V3 = {
  home: HOME_TRAIL,
  out: [...OUT_STATUSES],
  rookieNp: PARAMS.players.rookieNp,
  sigma: PARAMS.sigma,
  widen: EARLY.widen,
};
