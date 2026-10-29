// npm run backtest:v2: runs docs/model-v2.md's pre-registered plan. It scores the 18 candidates on the tuning
// seasons against version 1 as shipped, chooses version 2 by the plan's rules, prints every table and rewrites
// the Results part of docs/model-v2.md. 2026-27 is logged only; the confirmation runs after its last game. It
// exits non-zero when src/lib/elo.ts's PARAMS, EARLY or PROVISIONAL differ from the choice (version 1 when no
// candidate is eligible), or when the pre-registration's text has changed.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { EARLY, ELO_PER_SIGMA, PARAMS, PROVISIONAL, seedCentres, type FitRule, type SeasonData, type SeasonInputs } from "../src/lib/elo.ts";
import { boxRatings, lineups, type BoxRatings, type Lineups, type SeasonBox } from "../src/lib/players.ts";
import { stage } from "../src/lib/teams.ts";
import {
  accuracy, brier, compare, fitSigma, fitWiden, inSeasons, loadBox, loadPreseason, loadSeason, logLoss, loss, mean, modelRows, price,
  TUNING, V1, windows, worseJudgedV2, type Diff, type Row, type Scored,
} from "./evaluate.ts";
import { loadVegas } from "./vegas.ts";

const started = performance.now();
const DOC = new URL("../docs/model-v2.md", import.meta.url);
const PREREGISTERED = "d0b48eb08211353a22300ab71eadb7ff59fc4303a2a8a5c0b631bfae4b7c0cad";

const EXPLORATION = ["2023-24", "2024-25", "2025-26"];
const CONFIRMATION = ["2026-27"];
const ALL = [...TUNING, ...EXPLORATION, ...CONFIRMATION];

type Loaded = { data: SeasonData; box: SeasonBox; centres: Record<string, number> };
const SEED = { scale: 5, fade: 120, carry: 0.7 };
const seasons: Loaded[] = ALL.map((id) => {
  const data = loadSeason(id);
  const p = loadPreseason(data);
  return { data, box: loadBox(id), centres: seedCentres(SEED, Object.keys(data.teams), { preseason: p, last: {} }) };
});
const vegas: Record<string, number> = Object.assign({}, ...ALL.map((id) => loadVegas(id).chances));
const lineupsBySeason = lineups(seasons);
const HALF_LIVES = [180, 365];
const ratingsByHalf = new Map(HALF_LIVES.map((h) => [h, boxRatings(seasons, h)]));

const A = [0.08, 0.11, 0.15];
const NP = [160, 320, 640];
const TEAM: FitRule = { n0: 96, margin: V1.params.margin, home: V1.params.home, seed: SEED, b2b: 0.4 };

type LineupMode = keyof Pick<Lineups, "previous" | "atTip">;
type Model = { label: string; rule: FitRule; rows: Row[]; sigma: number; widen: number; scored: Scored[] };

function run(label: string, rule: FitRule, lineup: LineupMode = "previous"): Model {
  const rows = seasons.flatMap(({ data, box, centres }) => {
    const ratings: BoxRatings | undefined = rule.players && ratingsByHalf.get(rule.players.halfLife)!.get(data.season);
    const inputs: SeasonInputs = {
      centres: rule.seed ? centres : undefined,
      players: ratings && { box, ratings, lineups: lineupsBySeason.get(data.season)![lineup] },
    };
    return modelRows(data, rule, inputs);
  });
  const tuningRows = rows.filter((r) => TUNING.includes(r.season));
  const sigma = fitSigma(tuningRows);
  const widen = fitWiden(tuningRows, sigma);
  return { label, rule, rows, sigma, widen, scored: price(rows, sigma, widen) };
}

const baselineRows = seasons.flatMap(({ data }) => modelRows(data, V1.params));
const baseline: Model = {
  label: "Version 1 as shipped", rule: V1.params, rows: baselineRows, sigma: V1.params.sigma, widen: V1.early.widen,
  scored: price(baselineRows, V1.params.sigma, V1.early.widen),
};

const candidates = HALF_LIVES.flatMap((halfLife) => A.flatMap((a) => NP.map((np) =>
  run(`a ${a}, np ${np}, half-life ${halfLife}`, { ...TEAM, players: { a, np, halfLife } }))));

const tuning = inSeasons(TUNING);
const exploration = inSeasons(EXPLORATION);
const confirmation = inSeasons(CONFIRMATION);
const withLine = (keep: (x: Scored) => boolean) => (x: Scored) => keep(x) && x.id in vegas;
const only = (s: Scored[], keep: (x: Scored) => boolean) => s.filter(keep);
const asVegas = (s: Scored[]): Scored[] => s.map((x) => ({ ...x, p: vegas[x.id] ?? 0.5 }));

const f3 = (x: number) => x.toFixed(3);
const f4 = (x: number) => x.toFixed(4);
const s4 = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(4);
const ci = (d: Diff) => `${s4(d.d)} [${s4(d.lo)}, ${s4(d.hi)}]`;
const verdict = (d: Diff) => (d.hi < 0 ? "better" : d.lo > 0 ? "worse" : "tie");
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
function table(head: string[], rows: (string | number)[][]) {
  return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}
const out: string[] = [];
const section = (title: string, intro: string, body: string) => out.push(`### ${title}\n\n${intro}\n\n${body}`);

type Tuned = { m: Model; ll: number; vsBase: Diff; wins: number; worse: number; eligible: boolean };
const tuned: Tuned[] = candidates.map((m) => {
  const vsBase = compare(m.scored, baseline.scored, tuning);
  const judged = windows(m.scored, baseline.scored, tuning).filter(worseJudgedV2);
  const wins = TUNING.filter((id) => logLoss(only(m.scored, inSeasons([id]))) < logLoss(only(baseline.scored, inSeasons([id])))).length;
  return { m, ll: vsBase.a, vsBase, wins, worse: judged.length, eligible: judged.length === 0 };
});
const byLoss = (a: Tuned, b: Tuned) => a.ll - b.ll;
const chosen = tuned.filter((t) => t.eligible).sort(byLoss)[0] ?? null;
// With no eligible candidate the site keeps version 1, and the tables report the lowest-loss candidate, the
// leader, so the owner can see what the rule turned down. Nothing about the leader chooses anything.
const lead = chosen ?? [...tuned].sort(byLoss)[0];
const V2 = chosen ? "Version 2" : "Leader";
const v2l = V2.toLowerCase();

section(
  "Table 1. Every candidate on the tuning seasons",
  `Log loss pooled over the ${TUNING.length} tuning seasons (${only(baseline.scored, tuning).length} games), against version 1 as shipped, ${f4(logLoss(only(baseline.scored, tuning)))}. Lower is better. SIGMA, in margin units, and the early widening are each candidate's own, fitted by maximum likelihood on the tuning seasons. Windows worse counts the pooled two-week windows where the candidate is worse than version 1, judging no window whose games sit in two or fewer (season, week) blocks, the deviation declared under Settings and their evidence. Sorted by log loss.`,
  table(
    ["Candidate", "SIGMA", "Early widening", "Log loss", "vs version 1 [95%]", "Seasons won", "Windows worse", "Brier", "Accuracy"],
    [...tuned].sort(byLoss).map((t) => [
      t.m.label, f3(t.m.sigma), t.m.widen.toFixed(2), f4(t.ll), ci(t.vsBase), `${t.wins} of ${TUNING.length}`, t.worse,
      f4(brier(only(t.m.scored, tuning))), pct(accuracy(only(t.m.scored, tuning))),
    ]),
  ),
);

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r2 = (x: number) => Math.round(x * 100) / 100;

{
  const v2 = lead.m;
  const s = v2.scored;
  section(
    "Table 2. The choice",
    chosen
      ? `Version 2 is the candidate with the lowest tuning log loss among the ${tuned.filter((t) => t.eligible).length} of ${tuned.length} that are worse than version 1 in no judged window. A window is judged when its games sit in more than two (season, week) blocks, the deviation declared under Settings and their evidence.`
      : `No candidate passes the window constraint, so the site keeps version 1. The tables below report the leader, the candidate with the lowest tuning log loss, to show what the rule turned down; nothing in them chooses anything. Table 6 shows the leader's windows.`,
    table(
      ["Candidate", "SIGMA", "Early widening", "Tuning log loss", "vs version 1 [95%]", "Verdict", "Windows worse"],
      [[v2.label, f3(v2.sigma), v2.widen.toFixed(2), f4(lead.ll), ci(lead.vsBase), verdict(lead.vsBase), lead.worse]],
    ),
  );

  const seedOnly = run("Seed", { n0: TEAM.n0, margin: TEAM.margin, home: TEAM.home, seed: SEED });
  const seedB2b = run("Seed and back-to-back", TEAM);
  const steps = [baseline, seedOnly, seedB2b, v2];
  section(
    "Table 3. What each piece adds, tuning seasons",
    "Each step adds one piece to the step above and has its own SIGMA and early widening, fitted on the tuning seasons. The change is the step minus the step above.",
    table(
      ["Step", "SIGMA", "Early widening", "Log loss", "Change [95%]"],
      steps.map((m, i) => [
        i === steps.length - 1 ? `Players: ${v2l}, ${m.label}` : m.label, f3(m.sigma), m.widen.toFixed(2), f4(logLoss(only(m.scored, tuning))),
        i ? ci(compare(m.scored, steps[i - 1].scored, tuning)) : "",
      ]),
    ),
  );

  const vs = (name: string, keep: (x: Scored) => boolean) => {
    const k = withLine(keep);
    const n = only(s, k).length;
    if (!n) return [name, 0, "", "", "", "", ""];
    const base = compare(s, baseline.scored, k), veg = compare(s, asVegas(s), k);
    return [name, n, f4(veg.b), f4(base.b), f4(base.a), ci(base), ci(veg)];
  };
  section(
    `Table 4. ${V2}, version 1 and Vegas on the same games`,
    "Every game with a Vegas line: the median of the sportsbooks' moneylines with their cut removed. Vegas is reported, never used to choose. The exploration seasons informed the plan and confirm nothing; 2026-27 is logged until its last game.",
    table(
      ["Seasons", "Games", "Vegas log loss", "Version 1 log loss", `${V2} log loss`, `${V2} - version 1 [95%]`, `${V2} - Vegas [95%]`],
      [vs("Tuning, 2015-16 to 2022-23", tuning), vs("Exploration, 2023-24 to 2025-26", exploration), vs("2026-27 so far", confirmation)],
    ),
  );

  const gameOf = new Map(seasons.flatMap(({ data }) => data.games.map((g) => [g.id, g])));
  const regular = (x: Scored) => stage(gameOf.get(x.id)!.note).phase === "regular";
  const lastRegular = new Map(ALL.map((id) => [id, Math.max(...only(s, (x) => x.season === id && regular(x)).map((x) => x.day))]));
  const parts: [string, (x: Scored) => boolean][] = [
    ["Weeks 1-2", (x) => x.day < 14], ["Weeks 3-4", (x) => x.day >= 14 && x.day < 28], ["Weeks 5-6", (x) => x.day >= 28 && x.day < 42],
    ["Last 3 weeks of the regular season", (x) => regular(x) && x.day > lastRegular.get(x.season)! - 21],
    ["Play-in and playoffs", (x) => !regular(x)],
  ];
  section(
    "Table 5. By part of the season",
    "Days count from each season's first game day. The last three weeks end on the season's last regular-season game day.",
    table(
      ["Seasons", "Part", "Games", "Version 1 log loss", `${V2} log loss`, `${V2} - version 1 [95%]`, "Verdict"],
      ([["Tuning", tuning], ["Exploration", exploration]] as const).flatMap(([name, set]) =>
        parts.map(([part, keep]) => {
          const d = compare(s, baseline.scored, (x) => set(x) && keep(x));
          return [name, part, d.n, f4(d.b), f4(d.a), ci(d), verdict(d)];
        }),
      ),
    ),
  );

  section(
    "Table 6. Two-week windows, tuning seasons pooled",
    "Window w holds days 14w to 14w + 13 of each season. The constraint fails on a window marked worse; a window of two or fewer (season, week) blocks is not judged.",
    table(
      ["Window", "Days", "Games", "Blocks", "Version 1 log loss", `${V2} log loss`, `${V2} - version 1 [95%]`, "Verdict"],
      windows(s, baseline.scored, tuning).map((d) => [d.w, `${14 * d.w}-${14 * d.w + 13}`, d.n, d.blocks, f4(d.b), f4(d.a), ci(d), verdict(d) + (d.blocks > 2 ? "" : `, ${d.blocks === 1 ? "one block" : "two blocks"}, not judged`)]),
    ),
  );

  const calib = (set: Scored[]) => {
    const buckets = Array.from({ length: 10 }, () => ({ n: 0, stated: 0, won: 0 }));
    for (const x of set) {
      const fav = Math.max(x.p, 1 - x.p);
      const b = buckets[Math.min(9, Math.floor((fav - 0.5) / 0.05))];
      b.n++; b.stated += fav; b.won += x.p >= 0.5 ? x.y : 1 - x.y;
    }
    return buckets;
  };
  const cell = (b: { n: number; stated: number; won: number }) => (b.n ? [b.n, pct(b.stated / b.n), pct(b.won / b.n)] : [0, "", ""]);
  const ct = calib(only(s, tuning)), ce = calib(only(s, exploration));
  section(
    `Table 7. Calibration, ${v2l}`,
    "Games bucketed by the favourite's stated chance. A calibrated model's favourites win about as often as it says.",
    table(
      ["Stated chance", "Tuning games", "Says", "Favourite won", "Exploration games", "Says", "Favourite won"],
      ct.map((b, i) => [`${50 + 5 * i}-${55 + 5 * i}%`, ...cell(b), ...cell(ce[i])]),
    ),
  );

  const atTip = run(`${v2.label}, lineup at tip`, v2.rule, "atTip");
  const tipRow = (name: string, keep: (x: Scored) => boolean) => {
    const d = compare(atTip.scored, s, keep), veg = compare(atTip.scored, asVegas(atTip.scored), withLine(keep));
    return [name, d.n, f4(d.b), f4(d.a), ci(d), ci(veg)];
  };
  section(
    "Table 8. The lineup known at tip",
    `The ${v2l} with each side's lineup taken from the players who played in the game itself, at their usual minutes, with its own SIGMA (${f3(atTip.sigma)}) and early widening (${atTip.widen.toFixed(2)}). It is the ceiling a pre-game lineup feed could reach; the site cannot know who plays.`,
    table(
      ["Seasons", "Games", `${V2} log loss`, "Lineup at tip log loss", `At tip - ${v2l} [95%]`, "At tip - Vegas [95%]"],
      [tipRow("Tuning", tuning), tipRow("Exploration", exploration)],
    ),
  );

  const tun = only(s, tuning);
  const excess = (x: Scored) => loss(x.p, x.y) - loss(x.ph, x.y);
  const within = (lo: number, hi: number) => tun.filter((x) => x.k >= lo && x.k <= hi).map(excess);
  const settled = mean(within(40, 59));
  const E = Array.from({ length: 40 }, (_, k) => mean(within(k - 2, k + 2)));
  const threshold = E.findIndex((_, k) => E.slice(k).every((e) => e - settled <= 0.01));
  section(
    "Table 9. Provisional threshold",
    `Version 1's rule on the ${v2l}. k is the number of games the less experienced side had played before a game. E(k) is the mean excess log loss (pre-game, as priced, minus the season's final fit at SIGMA) of the tuning seasons' games with k within 2 of k. The settled level, games with k from 40 to 59, is ${f4(settled)}. The threshold is the first k from which E stays within 0.01 of it: **${threshold} games**.`,
    table(["k", "Games at k", "E(k)", "E(k) - settled"], E.map((e, k) => [k, within(k, k).length, f4(e), s4(e - settled)])),
  );

  const eloPerUnit = ELO_PER_SIGMA / v2.sigma;
  section(
    `Table 10. The Elo scale, ${v2l}`,
    `As in version 1, a rating is 1000 plus the fitted rating times ${ELO_PER_SIGMA.toFixed(1)} / SIGMA Elo points.`,
    table(
      ["Quantity", "Value"],
      [
        ["SIGMA, margin units", f3(v2.sigma)],
        ["Elo points per margin unit", eloPerUnit.toFixed(2)],
        ["Home edge, Elo points", (TEAM.home.kind === "fixed" ? TEAM.home.value * eloPerUnit : NaN).toFixed(1)],
        ["Back-to-back, Elo points", ((TEAM.b2b ?? 0) * eloPerUnit).toFixed(1)],
      ],
    ),
  );

  const confirmedGames = only(s, confirmation).length;
  section(
    "Table 11. 2026-27, logged only",
    "The confirmation scores the whole season once, after its last game. Until then the season's games so far are logged here and judge nothing.",
    table(
      ["Season", "Games", "Version 1 log loss", `${V2} log loss`],
      [["2026-27", confirmedGames, confirmedGames ? f4(logLoss(only(baseline.scored, confirmation))) : "", confirmedGames ? f4(logLoss(only(s, confirmation))) : ""]],
    ),
  );

  const want = chosen
    ? { ...v2.rule, sigma: r3(v2.sigma), widen: r2(v2.widen), provisional: threshold }
    : { ...V1.params, widen: V1.early.widen, provisional: V1.provisional };
  const have = { ...PARAMS, sigma: r3(PARAMS.sigma), widen: r2(EARLY.widen), provisional: PROVISIONAL };
  const match = JSON.stringify(want) === JSON.stringify(have);
  out.push(`### Check\n\nsrc/lib/elo.ts PARAMS, EARLY and PROVISIONAL ${match ? "match" : "DO NOT match"} ${chosen ? "the choice" : "version 1, which the site keeps"}, \`${JSON.stringify(want)}\`.`);
  if (!match) process.exitCode = 1;
}

const doc = readFileSync(DOC, "utf8");
const lines = doc.split("\n");
const from = lines.indexOf("## Pre-registration");
const to = lines.findIndex((l, i) => i > from && l.startsWith("## "));
const hash = createHash("sha256").update(lines.slice(from + 1, to).join("\n")).digest("hex");
out.unshift(`Pre-registration SHA-256 now: \`${hash}\`, ${hash === PREREGISTERED ? "unchanged since it was written" : "CHANGED since it was written"}. Bootstrap: 2000 resamples of whole weeks, seed 20261025.`);
if (hash !== PREREGISTERED) process.exitCode = 1;

const body = out.join("\n\n");
console.log(body);
const START_MARK = "<!-- results:start -->";
const END_MARK = "<!-- results:end -->";
const a = doc.indexOf(START_MARK), b = doc.indexOf(END_MARK);
if (a < 0 || b < a) throw new Error("docs/model-v2.md has lost its results markers");
writeFileSync(DOC, `${doc.slice(0, a + START_MARK.length)}\n${body}\n${doc.slice(b)}`);
console.error(`backtest:v2: ${candidates.length} candidates, ${((performance.now() - started) / 1000).toFixed(1)} s`);
