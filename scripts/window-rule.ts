// node scripts/window-rule.ts [v2]: the check behind dropping the two-week window rule, from docs/model-v3.md (version 3
// against version 2) and, with v2, from docs/model-v2.md's 2026-27 confirmation (version 2 against version 1).
// How often does the "worse in no judged two-week window" rule fail a model that is exactly as good as its baseline?
// Null comparisons from the real tuning games: in each (season, week) block, the two models' chances swap places at
// random, so neither is better, and the windows are judged as the plans judge them.
import { seedCentres, PARAMS, EARLY, type FitRule } from "../src/lib/elo.ts";
import { boxRatings, lineups } from "../src/lib/players.ts";
import { newcomers } from "../src/lib/rookies.ts";
import { trailingHomeEdges } from "../src/lib/home.ts";
import { fitSigma, fitWiden, loadBox, loadPreseason, loadSeason, modelRows, price, TUNING, V1, windows, worseJudgedV2, type Scored } from "./evaluate.ts";
const seasons = TUNING.map((id) => { const data = loadSeason(id); return { data, box: loadBox(id), pre: loadPreseason(data) }; });
const lp = lineups(seasons), br = boxRatings(seasons, 365), rk = newcomers(seasons), homes = trailingHomeEdges(seasons.map((s) => s.data), PARAMS);
const rows = (home: (s: string) => number, rookieNp?: number) => seasons.flatMap(({ data, box, pre }) => modelRows(data, { ...PARAMS, home: { kind: "fixed", value: home(data.season) }, players: { ...PARAMS.players, rookieNp } } as FitRule, { centres: seedCentres(PARAMS.seed, Object.keys(data.teams), { preseason: pre, last: {} }), players: { box, ratings: br.get(data.season)!, lineups: lp.get(data.season)!.previous, rookies: rk.get(data.season) } }));
const v2rows = price(rows(() => 0.622), PARAMS.sigma, EARLY.widen);
const r3 = rows((s) => homes.get(s)!.value, 40); const sg = fitSigma(r3);
const [v3, v2] = process.argv[2] === "v2"
  ? [v2rows, price(seasons.flatMap(({ data }) => modelRows(data, V1.params)), V1.params.sigma, V1.early.widen)]
  : [price(r3, sg, fitWiden(r3, sg)), v2rows];
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const SIMS = 400; let fails = 0; const judgedCount = windows(v3, v2, () => true).filter((d) => d.blocks > 2).length;
for (let i = 0; i < SIMS; i++) {
  const flip = new Map<string, boolean>();
  const a: Scored[] = [], b: Scored[] = [];
  v3.forEach((x, j) => { const key = `${x.season}:${Math.floor(x.day / 7)}`; if (!flip.has(key)) flip.set(key, rnd() < 0.5); const f = flip.get(key)!; a.push(f ? v2[j] : x); b.push(f ? x : v2[j]); });
  if (windows(a, b, () => true).some(worseJudgedV2)) fails++;
}
console.log(`${process.argv[2] === "v2" ? "version 2 against version 1" : "version 3 against version 2"}: judged windows on the tuning seasons: ${judgedCount}; a model exactly as good as its baseline fails the rule in ${fails} of ${SIMS} null comparisons (${((100 * fails) / SIMS).toFixed(0)}%)`);
