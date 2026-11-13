// npm run backtest:projections: how well src/lib/project.ts's simulated seasons called the finished ones. At six
// points in each season, 14 to 150 days after its first game, the rest of the season is played out from the
// site's ratings that day, against its real schedule, and scored on what happened: each team's final wins, whether
// it made the playoffs (2019-20, with its bubble format, left out), whether it finished in the top 6 (play-in seasons),
// and the champion.
//
// The drift (tau, walk) is chosen on the tuning seasons, 2015-16 to 2022-23, by mean ranked probability score of
// final wins; then how much of it carries into the playoffs, by the log loss of reaching each playoff round. Both
// are reported on 2023-24 to 2025-26 beside three baselines: the same simulation without drift, the same with
// every team's preseason seed for a rating, and pace, each team's win share so far carried on.
//
//   node scripts/backtest-projections.ts            the grid and the report
//   node scripts/backtest-projections.ts --quick    a smaller grid, fewer runs
import { readFileSync, existsSync } from "node:fs";
import type { DraftFile } from "../src/lib/draft.ts";
import { compute, type Abbr, type Season, type SeasonData } from "../src/lib/elo.ts";
import { siteInputs } from "../src/lib/inputs.ts";
import { meanWins, setupAt, simulate, winsAt, type Drift, type Outlook, type Projection } from "../src/lib/project.ts";
import { stage } from "../src/lib/teams.ts";
import { TUNING } from "./evaluate.ts";

const quick = process.argv.includes("--quick");
const RUNS = quick ? 600 : 2000;
const CHECKPOINTS = [14, 30, 60, 90, 120, 150];
const TAUS = quick ? [0, 40, 80] : [0, 20, 40, 60, 80];
const WALKS = quick ? [0, 40] : [0, 20, 40, 60];
const CARRIES = [0, 0.5, 1];

const read = (path: string): unknown => {
  const url = new URL(`../src/data/${path}`, import.meta.url);
  return existsSync(url) ? JSON.parse(readFileSync(url, "utf8")) : undefined;
};
const list = read("seasons.json") as { id: string; end?: string }[];
const ids = list.map((s) => s.id).sort();
const files = ids.map((id) => ({ data: read(`games/${id}.json`) as SeasonData, box: read(`box/${id}.json`), preseason: read(`preseason/${id}.json`), injuries: read(`injuries/${id}.json`), nbaReports: read(`nba-reports/${id}.json`) }));
const inputs = siteInputs(files, read("draft.json") as DraftFile);
const finished = list.filter((s) => s.end).map((s) => s.id).sort();

type Truth = { wins: Record<Abbr, number>; playoffs: Set<Abbr> | null; top6: Set<Abbr> | null; champion: Abbr | null; rounds: { round2: Set<Abbr>; confFinals: Set<Abbr>; finals: Set<Abbr> } | null };

/** What happened: regular-season wins, the playoff field from the first round's games, the top 6 from the play-in's, and the Finals winner. */
function truth(model: Season): Truth {
  const wins: Record<Abbr, number> = Object.fromEntries(model.abbrs.map((a) => [a, 0]));
  const r1 = new Set<Abbr>(), playIn = new Set<Abbr>(), round2 = new Set<Abbr>(), confFinals = new Set<Abbr>(), finalists = new Set<Abbr>();
  const finals = new Map<Abbr, number>();
  for (const r of model.results) {
    const g = r.game, st = stage(g.note);
    const winner = g.hs! > g.as! ? g.home : g.away;
    if (st.standings) wins[winner]++;
    if (st.phase === "play-in") { playIn.add(g.home); playIn.add(g.away); }
    if (/1st Round/.test(g.note ?? "")) { r1.add(g.home); r1.add(g.away); }
    if (/^(East|West) Semifinals/.test(g.note ?? "")) { round2.add(g.home); round2.add(g.away); }
    if (/^(East|West) Finals/.test(g.note ?? "")) { confFinals.add(g.home); confFinals.add(g.away); }
    if (/^NBA Finals/.test(g.note ?? "")) { finals.set(winner, (finals.get(winner) ?? 0) + 1); finalists.add(g.home); finalists.add(g.away); }
  }
  const champion = [...finals].find(([, w]) => w === 4)?.[0] ?? null;
  const season = model.data.season;
  const bubble = season === "2019-20";
  return {
    wins,
    playoffs: bubble || r1.size !== 16 ? null : r1,
    top6: season >= "2020-21" && r1.size === 16 ? new Set([...r1].filter((a) => !playIn.has(a))) : null,
    champion: bubble ? null : champion,
    rounds: bubble ? null : { round2, confFinals, finals: finalists },
  };
}

/** The ranked probability score of `actual` under a distribution of counts over whole wins: lower is better. */
function rps(counts: readonly number[], actual: number): number {
  const total = counts.reduce((s, x) => s + x, 0);
  let acc = 0, score = 0;
  for (let k = 0; k < Math.max(counts.length, actual + 1); k++) {
    acc += counts[k] ?? 0;
    const f = acc / total;
    score += (f - (k >= actual ? 1 : 0)) ** 2;
  }
  return score;
}

const clamp = (p: number) => Math.min(1 - 1e-3, Math.max(1e-3, p));
const logLoss = (p: number, y: boolean) => -Math.log(y ? clamp(p) : 1 - clamp(p));

type Score = { rps: number; sq: number; cover: number; teams: number; poLL: number; poBrier: number; poN: number; t6LL: number; t6N: number; titleLL: number; titleN: number; roundLL: number; roundN: number };
const zero = (): Score => ({ rps: 0, sq: 0, cover: 0, teams: 0, poLL: 0, poBrier: 0, poN: 0, t6LL: 0, t6N: 0, titleLL: 0, titleN: 0, roundLL: 0, roundN: 0 });
const add = (a: Score, b: Score) => { for (const k of Object.keys(a) as (keyof Score)[]) a[k] += b[k]; };

/** Scores one projection against what happened. `dist` overrides the win distributions (pace). */
function score(p: Projection | null, abbrs: Abbr[], t: Truth, dist?: Record<Abbr, number[]>): Score {
  const s = zero();
  for (const a of abbrs) {
    const wins = dist?.[a] ?? p!.teams[a].wins;
    const actual = t.wins[a];
    s.rps += rps(wins, actual);
    s.sq += (meanWins(wins) - actual) ** 2;
    s.cover += winsAt(wins, 0.1) <= actual && actual <= winsAt(wins, 0.9) ? 1 : 0;
    s.teams++;
    if (!p) continue;
    if (t.playoffs) {
      const q = p.teams[a].playoffs / p.runs;
      s.poLL += logLoss(q, t.playoffs.has(a));
      s.poBrier += (q - (t.playoffs.has(a) ? 1 : 0)) ** 2;
      s.poN++;
    }
    if (t.rounds) {
      const o = p.teams[a];
      s.roundLL += logLoss(o.round2 / p.runs, t.rounds.round2.has(a)) + logLoss(o.confFinals / p.runs, t.rounds.confFinals.has(a)) + logLoss(o.finals / p.runs, t.rounds.finals.has(a)) + logLoss(o.title / p.runs, a === t.champion);
      s.roundN++;
    }
    if (t.top6) {
      const q = p.teams[a].seed.slice(0, 6).reduce((x, y) => x + y, 0) / p.runs;
      s.t6LL += logLoss(q, t.top6.has(a));
      s.t6N++;
    }
  }
  if (p && t.champion) {
    s.titleLL += -Math.log(Math.max(1e-3, p.teams[t.champion].title / p.runs));
    s.titleN++;
  }
  return s;
}

/** Pace: each team's win share so far, with one win and one loss added, carried over its games left, as a binomial. */
function pace(model: Season, day: string): Record<Abbr, number[]> {
  const setup = setupAt(model, day, { tau: 0, walk: 0 });
  const w: Record<Abbr, number> = {}, g: Record<Abbr, number> = {}, left: Record<Abbr, number> = {};
  for (const a of model.abbrs) { w[a] = 0; g[a] = 0; left[a] = 0; }
  for (const x of setup.played) { w[x.homeWon ? x.home : x.away]++; g[x.home]++; g[x.away]++; }
  for (const f of setup.fixtures) { left[f.home]++; left[f.away]++; }
  return Object.fromEntries(model.abbrs.map((a) => {
    const q = (w[a] + 1) / (g[a] + 2), n = left[a];
    const out = new Array(w[a] + n + 1).fill(0);
    let c = 1;
    for (let k = 0; k <= n; k++) {
      if (k > 0) c = (c * (n - k + 1)) / k;
      out[w[a] + k] = c * q ** k * (1 - q) ** (n - k) * 1e6;
    }
    return [a, out];
  }));
}

const models = new Map(finished.map((id) => {
  const f = files.find((x) => x.data.season === id)!;
  return [id, compute(f.data, inputs.get(id))] as const;
}));
const checkpointDay = (model: Season, offset: number) => {
  const first = model.results[0].day;
  return new Date(Date.parse(first + "T00:00:00Z") + offset * 86_400_000).toISOString().slice(0, 10);
};

type Method = { name: string; run: (model: Season, day: string) => Score };
const sim = (drift: Drift, outlook?: (m: Season, day: string) => Outlook) => (model: Season, day: string) => {
  const p = simulate(setupAt(model, day, drift, { outlook: outlook?.(model, day) }), RUNS, 20261101);
  return score(p, model.abbrs, truths.get(model.data.season)!);
};
const truths = new Map([...models].map(([id, m]) => [id, truth(m)]));
const preseason = (m: Season, day: string): Outlook => Object.fromEntries(m.abbrs.map((a) => [a, [{ day, rating: m.series[0].r[a] }]]));

function evaluate(method: Method, seasons: string[]) {
  const byCheckpoint = CHECKPOINTS.map(() => zero());
  const all = zero();
  for (const id of seasons) {
    const m = models.get(id)!;
    CHECKPOINTS.forEach((offset, k) => {
      const s = method.run(m, checkpointDay(m, offset));
      add(byCheckpoint[k], s);
      add(all, s);
    });
  }
  return { all, byCheckpoint };
}

const fmt = (x: number, d = 3) => x.toFixed(d);
const row = (name: string, s: Score) =>
  `| ${name} | ${fmt(s.rps / s.teams)} | ${fmt(Math.sqrt(s.sq / s.teams), 2)} | ${fmt((100 * s.cover) / s.teams, 0)}% | ${s.poN ? fmt(s.poLL / s.poN) : "–"} | ${s.poN ? fmt(s.poBrier / s.poN) : "–"} | ${s.t6N ? fmt(s.t6LL / s.t6N) : "–"} | ${s.roundN ? fmt(s.roundLL / s.roundN) : "–"} | ${s.titleN ? fmt(s.titleLL / s.titleN, 2) : "–"} |`;
const HEAD = "| | Wins RPS | Wins RMSE | In 80% range | Playoffs log loss | Playoffs Brier | Top 6 log loss | Rounds log loss | Champion log loss |\n|---|---|---|---|---|---|---|---|---|";

const tuning = finished.filter((id) => TUNING.includes(id));
const exploration = finished.filter((id) => !TUNING.includes(id));

console.log(`## Grid on the tuning seasons (${tuning[0]} to ${tuning.at(-1)}), ${RUNS} runs each\n`);
console.log(HEAD);
let best: { drift: Drift; rps: number } | null = null;
const t0 = Date.now();
for (const tau of TAUS) for (const walk of WALKS) {
  const { all } = evaluate({ name: "", run: sim({ tau, walk }) }, tuning);
  console.log(row(`tau ${tau}, walk ${walk}`, all));
  const r = all.rps / all.teams;
  if (!best || r < best.rps) best = { drift: { tau, walk }, rps: r };
}
console.error(`grid: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log(`\nChosen: tau ${best!.drift.tau}, walk ${best!.drift.walk}.\n\n## How much drift the playoffs carry, tuning seasons\n\n${HEAD}`);
let bestCarry: { carry: number; ll: number } | null = null;
for (const carry of CARRIES) {
  const { all } = evaluate({ name: "", run: sim({ ...best!.drift, playoff: carry }) }, tuning);
  console.log(row(`carry ${carry}`, all));
  const ll = all.roundLL / all.roundN;
  if (!bestCarry || ll < bestCarry.ll) bestCarry = { carry, ll };
}
const chosen: Drift = { ...best!.drift, playoff: bestCarry!.carry };
console.log(`\nChosen: tau ${chosen.tau}, walk ${chosen.walk}, playoff carry ${chosen.playoff}.\n`);

const methods: Method[] = [
  { name: `Model, drift ${chosen.tau}/${chosen.walk}/${chosen.playoff}`, run: sim(chosen) },
  { name: "Model, no drift", run: sim({ tau: 0, walk: 0 }) },
  { name: "Preseason seeds, same drift", run: sim(chosen, preseason) },
  { name: "Pace", run: (m, day) => score(null, m.abbrs, truths.get(m.data.season)!, pace(m, day)) },
];
for (const [label, seasons] of [["Tuning seasons", tuning], [`Exploration seasons (${exploration[0]} to ${exploration.at(-1)})`, exploration]] as const) {
  console.log(`## ${label}\n\n${HEAD}`);
  const results = methods.map((m) => ({ m, r: evaluate(m, seasons) }));
  for (const { m, r } of results) console.log(row(m.name, r.all));
  console.log(`\nBy checkpoint, wins RPS / playoffs log loss:\n\n| Days in | ${results.map((x) => x.m.name).join(" | ")} |\n|---|${results.map(() => "---").join("|")}|`);
  CHECKPOINTS.forEach((d, k) => console.log(`| ${d} | ${results.map(({ r }) => { const s = r.byCheckpoint[k]; return `${fmt(s.rps / s.teams, 2)} / ${s.poN ? fmt(s.poLL / s.poN) : "–"}`; }).join(" | ")} |`));
  console.log("");
}

// Calibration of playoff chances on every finished season but the bubble, from the chosen model, in tenths.
const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
for (const id of finished) {
  const m = models.get(id)!, t = truths.get(id)!;
  if (!t.playoffs) continue;
  for (const offset of CHECKPOINTS) {
    const p = simulate(setupAt(m, checkpointDay(m, offset), chosen), RUNS, 20261101);
    for (const a of m.abbrs) {
      const q = p.teams[a].playoffs / p.runs;
      const b = bins[Math.min(9, Math.floor(q * 10))];
      b.n++; b.p += q; b.y += t.playoffs.has(a) ? 1 : 0;
    }
  }
}
console.log("## Playoff chances against what happened, every finished season but 2019-20\n\n| Chance | Teams | Mean chance | Made it |\n|---|---|---|---|");
bins.forEach((b, i) => b.n && console.log(`| ${i * 10}–${i * 10 + 10}% | ${b.n} | ${fmt((100 * b.p) / b.n, 1)}% | ${fmt((100 * b.y) / b.n, 1)}% |`));
console.log(`\nJSON ${JSON.stringify({ chosen, bins })}`);
