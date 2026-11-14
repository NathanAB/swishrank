// Version 5 as a candidate (docs/model-v5.md): version 4 with each player's value pulled toward his on-court rating as
// well as his box rating (src/lib/on-court.ts). Its new settings are chosen on the seasons before the one scored: the
// on-court rating's ridge, half-life and box prior from SEARCH.rules and its weight from SEARCH.weights, each
// combination with SIGMA and the early widening fitted by maximum likelihood, and the one with the lowest log loss on
// those seasons wins. Every other setting is version 4's.
import { readFileSync } from "node:fs";
import type { DraftFile } from "../../src/lib/draft.ts";
import { seasonRule } from "../../src/lib/elo.ts";
import { modelInputs, withOnCourt, type OnCourt } from "../../src/lib/inputs.ts";
import { onCourtWalk, type OnCourtRule, type OnCourtWalk } from "../../src/lib/on-court.ts";
import type { RosterRule } from "../../src/lib/roster-lineups.ts";
import { parseStints } from "../../src/lib/stints.ts";
import { V4 } from "../../src/lib/v4.ts";
import { V5 } from "../../src/lib/v5.ts";
import { fitSigma, fitWiden, logLoss, modelRows, price, type Row } from "../evaluate.ts";
import type { Candidate, Chosen, Season } from "../past-seasons.ts";
import { pricedWith, withRoster } from "../roster-candidates.ts";

const draft = JSON.parse(readFileSync(new URL("../../src/data/draft.json", import.meta.url), "utf8")) as DraftFile;

/** Version 5's settings beyond version 4's. */
export type Settings = { onCourt: OnCourt; sigma: number; widen: number };
/** What a search tries: every rule with every weight. */
export type Search = { rules: readonly OnCourtRule[]; weights: readonly number[] };

/**
 * The search. Its ranges come from the research (branch prototype/model-v5, scripts/research/README.md), which saw
 * every season; which point of it a season is scored with comes from the seasons before that one alone.
 */
export const SEARCH: Search = {
  rules: [1500, 3000, 6000].flatMap((ridge) => [365, 730, 1460].flatMap((halfLife) => [0, 0.5, 1].map((boxPrior) => ({ ridge, halfLife, boxPrior })))),
  weights: Array.from({ length: 16 }, (_, i) => i / 50),
};

/**
 * The weight each rule's seasons are fitted at. The fit is linear in the players' prior centres, and a game's expected
 * margin is linear in the fit, so the margin at any other weight lies on the line through this fit's and version 4's.
 */
const PROBE = 0.1;

export const describe = ({ onCourt, sigma, widen }: Settings) =>
  onCourt.weight
    ? `on-court rating with ridge ${onCourt.ridge}, half-life ${onCourt.halfLife} days and box prior ${onCourt.boxPrior}, at weight ${onCourt.weight.toFixed(2)}; SIGMA ${sigma}, early widening ${widen}`
    : `no on-court rating; SIGMA ${sigma}, early widening ${widen}`;

/** Seasons a search has fitted, oldest first: version 4's rows for each, and each rule's walk with its rows at PROBE. */
type Searched = { seasons: Season[]; base: Row[][]; rules: { walk: OnCourtWalk; probe: Row[][] }[] };

/**
 * Fits `earlier` for every rule of `search`, keeping what it has fitted: a season's rows read nothing after it, so a
 * longer list of the same seasons only adds the new ones. A list that departs from the kept one starts again.
 */
function searcher(search: Search): (earlier: readonly Season[]) => Searched {
  const fresh = (): Searched => ({ seasons: [], base: [], rules: search.rules.map((rule) => ({ walk: onCourtWalk(rule), probe: [] })) });
  let kept = fresh();
  return (earlier) => {
    if (!earlier.every((s, i) => i >= kept.seasons.length || s === kept.seasons[i])) kept = fresh();
    if (kept.seasons.length >= earlier.length) return kept;
    const inputs = modelInputs(earlier, draft);
    for (const season of earlier.slice(kept.seasons.length)) {
      const { data } = season;
      const own = inputs.get(data.season);
      if (!own?.players) throw new Error(`version 5: season ${data.season} has no model inputs`);
      const { players } = own;
      const rule = seasonRule(own);
      const stints = season.stints === undefined ? undefined : parseStints(season.stints, data.season);
      kept.base.push(modelRows(data, rule, own));
      for (const r of kept.rules) {
        const ratings = withOnCourt(players.ratings, r.walk.next({ data, stints }, players.ratings), PROBE);
        r.probe.push(modelRows(data, rule, { ...own, players: { ...players, ratings } }));
      }
      kept.seasons.push(season);
    }
    return kept;
  };
}

const round = (x: number, places: number) => Number(x.toFixed(places));

/** One combination of a search with its log loss on the seasons searched. */
export type Score = { settings: Settings; loss: number };

/** Every combination of `search`, in its order, scored on the first `n` seasons of `searched`. */
function scores(search: Search, searched: Searched, n: number): Score[] {
  const base = searched.base.slice(0, n).flat();
  return searched.rules.flatMap(({ probe }, at) => {
    const probed = probe.slice(0, n).flat();
    return search.weights.map((weight): Score => {
      const rows = base.map((r, i) => ({ ...r, e: r.e + (weight / PROBE) * (probed[i].e - r.e) }));
      const sigma = round(fitSigma(rows), 3);
      const widen = round(fitWiden(rows, sigma), 2);
      return { settings: { onCourt: { ...search.rules[at], weight }, sigma, widen }, loss: logLoss(price(rows, sigma, widen)) };
    });
  });
}

/** Version 5 with `settings`, pricing the season after `earlier`, with roster-based lineups under `roster` when given. */
export const priced = (earlier: readonly Season[], settings: Settings, roster?: RosterRule): Chosen =>
  pricedWith(earlier, { settings: roster ? withRoster(describe(settings), roster) : describe(settings), onCourt: settings.onCourt.weight ? settings.onCourt : undefined, roster, sigma: settings.sigma, widen: settings.widen });

/**
 * Version 5 choosing its settings by `search`: of its combinations, the one with the lowest log loss on the earlier
 * seasons, and the earlier in the search's order of two that tie. `scores` is what it chooses from, and `settings` what
 * it chose, kept by list of seasons so another candidate reusing the choice does not score the search again. With no
 * earlier season there is nothing to choose from, and it is version 4: no on-court rating, and version 4's SIGMA and
 * widening.
 */
export function version5(search: Search): Candidate & { scores(earlier: readonly Season[]): Score[]; settings(earlier: readonly Season[]): Settings } {
  const fitted = searcher(search);
  const scored = (earlier: readonly Season[]) => scores(search, fitted(earlier), earlier.length);
  const best = (list: readonly Score[]) => list.reduce((found, s) => (s.loss < found.loss ? s : found)).settings;
  const chosen: { earlier: readonly Season[]; settings: Settings }[] = [];
  const settings = (earlier: readonly Season[]): Settings => {
    const hit = chosen.find((c) => c.earlier.length === earlier.length && c.earlier.every((s, i) => s === earlier[i]));
    if (hit) return hit.settings;
    const found = earlier.length ? best(scored(earlier)) : { onCourt: { ...search.rules[0], weight: 0 }, sigma: V4.sigma, widen: V4.widen };
    chosen.push({ earlier: [...earlier], settings: found });
    return found;
  };
  return { name: "Version 5", scores: scored, settings, choose: (earlier) => priced(earlier, settings(earlier)) };
}

/** The settings src/lib/v5.ts holds for the site, which `npm run backtest:v5` checks against the ones chosen from every finished season. */
export const frozen = describe(V5);

export default version5(SEARCH);
