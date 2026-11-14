// What the roster-lineup candidates share (scripts/candidates/v4-roster.ts and v5-roster.ts, issue 70): the fill term
// chosen from the earlier seasons, the settings string, and the calls of a fit with roster-based lineups. It lives
// outside scripts/candidates/ so the loaders do not take it for a candidate.
import { readFileSync } from "node:fs";
import type { DraftFile } from "../src/lib/draft.ts";
import { fitModel, seasonRule } from "../src/lib/elo.ts";
import { modelInputs, type OnCourt } from "../src/lib/inputs.ts";
import type { RosterRule } from "../src/lib/roster-lineups.ts";
import { V4 } from "../src/lib/v4.ts";
import { logLoss, modelRows, price, type Row } from "./evaluate.ts";
import { callsOf, type Chosen, type Season } from "./past-seasons.ts";

const draft = JSON.parse(readFileSync(new URL("../src/data/draft.json", import.meta.url), "utf8")) as DraftFile;

/** The fills a roster candidate chooses from, in margin units per 48 missing minutes; of two that tie, the earlier. */
export const FILLS = [0, -0.15, -0.3, -0.45, -0.6, -0.75] as const;

/** A version's settings string with its roster lineups named. */
export const withRoster = (settings: string, roster: RosterRule) => `${settings}; roster lineups at fill ${roster.fill}`;

/** The calls of a fit with these inputs, pricing the season after `earlier`. */
export const pricedWith = (earlier: readonly Season[], run: { settings: string; onCourt?: OnCourt; roster?: RosterRule; sigma: number; widen: number }): Chosen => ({
  settings: run.settings,
  price: (season) => {
    const inputs = modelInputs([...earlier, season], draft, run.onCourt, run.roster).get(season.data.season)!;
    return callsOf(season.data, fitModel(season.data, inputs), run.sigma, run.widen);
  },
});

/** Version 4's ratings, SIGMA and early widening with roster-based lineups under `roster`, pricing the season after `earlier`. */
export const version4With = (earlier: readonly Season[], roster: RosterRule): Chosen =>
  pricedWith(earlier, { settings: withRoster(`version 4's: SIGMA ${V4.sigma}, early widening ${V4.widen}`, roster), roster, sigma: V4.sigma, widen: V4.widen });

/** Whether `earlier[i]` is priced from roster lineups: some season before it has an NBA report archive. */
const rosterPriced = (earlier: readonly Season[], i: number) => earlier.slice(0, i).some((s) => s.nbaReports !== undefined);

/**
 * The fill with the lowest log loss over the roster-priced seasons of `earlier`, each priced with version 4's ratings,
 * version 4's SIGMA and early widening; V4.fill when none is roster-priced. A season's rows read nothing after it, so
 * it keeps them by season and fill across calls, and starts again when handed a list that departs from the kept one.
 */
function fillChooser(): (earlier: readonly Season[]) => number {
  let kept: { seasons: Season[]; rows: Row[][][] } = { seasons: [], rows: [] };
  return (earlier) => {
    if (!earlier.every((s, i) => i >= kept.seasons.length || s === kept.seasons[i])) kept = { seasons: [], rows: [] };
    if (kept.seasons.length < earlier.length) {
      const fresh = earlier.map((_, i) => i).filter((i) => i >= kept.seasons.length && rosterPriced(earlier, i));
      const inputs = fresh.length ? FILLS.map((fill) => modelInputs(earlier, draft, undefined, { fill })) : [];
      for (let i = kept.seasons.length; i < earlier.length; i++) {
        const { data } = earlier[i];
        kept.rows.push(fresh.includes(i) ? inputs.map((byFill) => { const own = byFill.get(data.season)!; return modelRows(data, seasonRule(own), own); }) : []);
        kept.seasons.push(earlier[i]);
      }
    }
    const rows = kept.rows.slice(0, earlier.length);
    if (!rows.some((r) => r.length)) return V4.fill;
    const losses = FILLS.map((_, f) => logLoss(price(rows.flatMap((r) => r[f] ?? []), V4.sigma, V4.widen)));
    return FILLS[losses.indexOf(Math.min(...losses))];
  };
}

/** The fill a roster candidate runs with on the season after `earlier`: see fillChooser(). */
export const chooseFill = fillChooser();
