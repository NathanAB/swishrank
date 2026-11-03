// Version 3's settings (docs/model-v3.md), as the site ran them from 2026-10-31 until it switched to version 4 on
// 2026-11-02: version 2 with a home edge from the three seasons before, each game's lineup less the players that
// morning's injury report lists as out, and a rookie's value held with 40 games instead of 320. They are frozen here
// so version 3's backtest and version 4's baseline stay checkable after src/lib/elo.ts moved on; `npm run
// backtest:v3` fails if they differ from what the plan fits.
import { HOME_TRAIL } from "./home.ts";

export const V3 = {
  home: HOME_TRAIL,
  out: ["Out"],
  rookieNp: 40,
  sigma: 3.037,
  widen: 1.14,
};
