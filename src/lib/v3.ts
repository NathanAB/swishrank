// Version 3's settings (docs/model-v3.md): version 2 with a home edge from the three seasons before, each game's
// lineup less the players that morning's injury report lists as out, and a rookie's value held with 40 games, not 320. The site does not read them: it runs
// version 2 until the plan's confirmation, after 2026-27's last game, or the owner switches it. `npm run
// backtest:v3` fails if SIGMA or the early widening here differ from what the plan fits on the tuning seasons.
import { HOME_TRAIL } from "./home.ts";
import { OUT_STATUSES } from "./report-lineup.ts";

export const V3 = {
  home: HOME_TRAIL,
  out: [...OUT_STATUSES],
  rookieNp: 40,
  sigma: 3.037,
  widen: 1.14,
};
