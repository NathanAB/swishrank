// npm run backtest: runs docs/model.md's pre-registered plan end to end. It scores every candidate on the
// tuning seasons, chooses the site's model by the plan's rules, confirms it on the held-out seasons, prints
// every table and rewrites the Results part of docs/model.md. It exits non-zero when src/lib/elo.ts's PARAMS
// or PROVISIONAL differ from what the plan chose, or when the pre-registration's text has changed.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { counted, ELO_PER_SIGMA, fitSeason, PARAMS, phi, PROVISIONAL, START, type FitRule, type HomeRule, type MarginRule, type SeasonData } from "../src/lib/elo.ts";
import {
  accuracy, brier, compare, eloScored, fitSigma, HELD_OUT, inSeasons, LOG_ONLY, loadSeason, logLoss, loss, mean, modelRows,
  price, TUNING, windows, worse, worseJudged, type Diff, type Row, type Scored,
} from "./evaluate.ts";

const started = performance.now();
const DOC = new URL("../docs/model.md", import.meta.url);
const PREREGISTERED = "3882ab098f3f45cd4a660cfe1bd9d75251fa82044c2c12706d8c9416a11cb578";

const ALL = [...TUNING, ...HELD_OUT, ...LOG_ONLY];
const data: Record<string, SeasonData> = Object.fromEntries(ALL.map((id) => [id, loadSeason(id)]));

const N0 = [2, 3, 5, 8, 12];
const MARGINS: { name: string; rule: MarginRule }[] = [
  { name: "raw", rule: { kind: "raw" } },
  { name: "cap 25", rule: { kind: "cap", at: 25 } },
  { name: "power 0.8", rule: { kind: "power", q: 0.8 } },
  { name: "power 0.6", rule: { kind: "power", q: 0.6 } },
  { name: "power 0.5", rule: { kind: "power", q: 0.5 } },
];
const MODES = ["fitted", "fixed"] as const;
type Mode = (typeof MODES)[number];
const HOME_WEIGHT = 50;
const RATIO_LIMIT = 4;

const ratio = (m: MarginRule) => counted(43, m) / counted(1, m);

const h0Cache = new Map<string, number>();
function h0Of(n0: number, mi: number) {
  const key = `${n0}:${mi}`;
  if (!h0Cache.has(key)) {
    const rule: FitRule = { n0, margin: MARGINS[mi].rule, home: { kind: "fitted", centre: 0, weight: 0 } };
    h0Cache.set(key, mean(TUNING.map((id) => fitSeason(data[id], rule).at(-1)!.after.home)));
  }
  return h0Cache.get(key)!;
}

type Candidate = { n0: number; mi: number; mode: Mode; weight: number; h0: number; rule: FitRule; sigma: number; rows: Row[]; scored: Scored[] };

function build(n0: number, mi: number, mode: Mode, weight = HOME_WEIGHT): Candidate {
  const h0 = h0Of(n0, mi);
  const home: HomeRule = mode === "fixed" ? { kind: "fixed", value: h0 } : { kind: "fitted", centre: h0, weight };
  const rule: FitRule = { n0, margin: MARGINS[mi].rule, home };
  const rows = ALL.flatMap((id) => modelRows(data[id], rule));
  const sigma = fitSigma(rows.filter((r) => TUNING.includes(r.season)));
  return { n0, mi, mode, weight, h0, rule, sigma, rows, scored: price(rows, sigma) };
}

const label = (c: Candidate) => `n0 ${c.n0}, ${MARGINS[c.mi].name}, ${c.mode} home${c.mode === "fitted" && c.weight !== HOME_WEIGHT ? ` (w_h ${c.weight})` : ""}`;

const grid: Candidate[] = N0.flatMap((n0) => MARGINS.flatMap((_, mi) => MODES.map((mode) => build(n0, mi, mode))));
const elo = ALL.flatMap((id) => eloScored(data[id], grid[0].rows.filter((r) => r.season === id)));

const tuning = inSeasons(TUNING);
const held = inSeasons(HELD_OUT);
const only = (s: Scored[], keep: (x: Scored) => boolean) => s.filter(keep);

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

type Tuned = { c: Candidate; ll: number; vsElo: Diff; wins: number; worseWindows: number; oneBlock: number; eligible: boolean };
const seasonWins = (c: Candidate, ids: string[]) =>
  ids.filter((id) => logLoss(only(c.scored, inSeasons([id]))) < logLoss(only(elo, inSeasons([id])))).length;
const tuned: Tuned[] = grid.map((c) => {
  const vsElo = compare(c.scored, elo, tuning);
  const ws = windows(c.scored, elo, tuning);
  const worseWindows = ws.filter(worse).length;
  const oneBlock = worseWindows - ws.filter(worseJudged).length;
  return { c, ll: vsElo.a, vsElo, wins: seasonWins(c, TUNING), worseWindows, oneBlock, eligible: worseWindows === 0 && ratio(c.rule.margin) <= RATIO_LIMIT };
});
const byLoss = (a: Tuned, b: Tuned) => a.ll - b.ll;
const passing = tuned.filter((t) => t.worseWindows === 0).sort(byLoss);
const site = passing.find((t) => t.eligible) ?? null;
const best = passing[0] ?? null;
const passingJudged = tuned.filter((t) => t.worseWindows - t.oneBlock === 0).sort(byLoss);
const sameChoice = passingJudged.find((t) => ratio(t.c.rule.margin) <= RATIO_LIMIT) === site && passingJudged[0] === best;

section(
  "Table 1. Every candidate on the tuning seasons",
  `Log loss pooled over the ${TUNING.length} tuning seasons (${only(elo, tuning).length} games), against the baseline Elo's ${f4(logLoss(only(elo, tuning)))}. Lower is better. "Power q" counts a margin m as (abs(m) + 3)^q. h0 and SIGMA are in the candidate's margin units. Windows worse counts the pooled two-week windows where the candidate is worse than Elo, with how many of them hold one (season, week) block. Sorted by log loss.`,
  table(
    ["Candidate", "43 vs 1", "h0", "SIGMA", "Log loss", "vs Elo [95%]", "Seasons won", "Windows worse", "Brier", "Accuracy"],
    [...tuned].sort(byLoss).map((t) => [
      label(t.c), `${ratio(t.c.rule.margin).toFixed(1)}x`, t.c.h0.toFixed(3), t.c.sigma.toFixed(3), f4(t.ll), ci(t.vsElo),
      `${t.wins} of ${TUNING.length}`, t.oneBlock ? `${t.worseWindows} (${t.oneBlock} one-block)` : t.worseWindows, f4(brier(only(t.c.scored, tuning))), pct(accuracy(only(t.c.scored, tuning))),
    ]),
  ),
);

if (!site || !best) {
  section("Table 2. The choice", "No candidate is eligible, so the site keeps Elo.", "");
} else {
  const costTune = compare(site.c.scored, best.c.scored, tuning);
  const costHeld = compare(site.c.scored, best.c.scored, held);
  section(
    "Table 2. The choice",
    `The site's model is the eligible candidate (43 vs 1 at most ${RATIO_LIMIT}x, no worse window) with the lowest tuning log loss. The unconstrained best drops the ${RATIO_LIMIT}x limit. The cost of the limit is the site's model minus the unconstrained best. With the deviation's rule, which judges no one-block window, the choice is ${sameChoice ? "the same" : "DIFFERENT"}.`,
    table(
      ["", "Candidate", "43 vs 1", "Tuning log loss"],
      [
        ["Site's model", label(site.c), `${ratio(site.c.rule.margin).toFixed(1)}x`, f4(site.ll)],
        ["Unconstrained best", label(best.c), `${ratio(best.c.rule.margin).toFixed(1)}x`, f4(best.ll)],
      ],
    ) + "\n\n" + table(
      ["Cost of the limit", "Log loss difference [95%]", "Verdict"],
      [["Tuning seasons", ci(costTune), verdict(costTune)], ["Held-out seasons", ci(costHeld), verdict(costHeld)]],
    ),
  );

  const s = site.c.scored;
  const seasonRow = (name: string, keep: (x: Scored) => boolean) => {
    const d = compare(s, elo, keep);
    const m = only(s, keep), e = only(elo, keep);
    return [name, d.n, f4(d.b), f4(d.a), ci(d), verdict(d), f4(brier(e)), f4(brier(m)), pct(accuracy(e)), pct(accuracy(m))];
  };
  const heldWindows = windows(s, elo, held);
  const heldVsElo = compare(s, elo, held);
  const ships = heldWindows.filter(worse).length === 0 && heldVsElo.d < 0;
  const shipsJudged = heldWindows.filter(worseJudged).length === 0 && heldVsElo.d < 0;
  const oneBlockWorse = heldWindows.filter((d) => worse(d) && !worseJudged(d)).map((d) => d.w);
  section(
    "Table 3. Held-out confirmation",
    `The site's model against the baseline Elo on the held-out seasons, scored once after the choice. It wins ${seasonWins(site.c, HELD_OUT)} of ${HELD_OUT.length} seasons on the point estimate and is worse in ${heldWindows.filter(worse).length} of ${heldWindows.length} pooled two-week windows (table 5)${oneBlockWorse.length ? `, ${oneBlockWorse.length} of them one-block (window ${oneBlockWorse.join(", ")})` : ""}. By the plan's rule as written the site ${ships ? "switches to the model" : "keeps Elo"}. With the declared deviation, which judges no one-block window, it ${shipsJudged ? "switches to the model" : "keeps Elo"}.`,
    table(
      ["Season", "Games", "Elo log loss", "Model log loss", "Model - Elo [95%]", "Verdict", "Elo Brier", "Model Brier", "Elo accuracy", "Model accuracy"],
      [...HELD_OUT.map((id) => seasonRow(id, inSeasons([id]))), seasonRow("Pooled", held)],
    ) + "\n\n" + table(
      ["Unconstrained best, season", "Best - Elo [95%]", "Site's model - best [95%]"],
      [...HELD_OUT, "Pooled"].map((id) => {
        const keep = id === "Pooled" ? held : inSeasons([id]);
        return [id, ci(compare(best.c.scored, elo, keep)), ci(compare(s, best.c.scored, keep))];
      }),
    ),
  );

  const parts: [string, (x: Scored) => boolean][] = [
    ["Weeks 1-2", (x) => x.day < 14], ["Weeks 3-4", (x) => x.day >= 14 && x.day < 28],
    ["Weeks 5-6", (x) => x.day >= 28 && x.day < 42], ["Rest of season", (x) => x.day >= 42],
  ];
  section(
    "Table 4. Early season and the rest",
    "The site's model against Elo by part of the season, days counted from each season's first game day.",
    table(
      ["Seasons", "Part", "Games", "Elo log loss", "Model log loss", "Model - Elo [95%]", "Verdict"],
      ([["Tuning", tuning], ["Held-out", held]] as const).flatMap(([name, set]) =>
        parts.map(([part, keep]) => {
          const d = compare(s, elo, (x) => set(x) && keep(x));
          return [name, part, d.n, f4(d.b), f4(d.a), ci(d), verdict(d)];
        }),
      ),
    ),
  );

  section(
    "Table 5. Two-week windows, held-out seasons pooled",
    `Window w holds days 14w to 14w + 13 of each season. The constraint fails on a window marked worse. A window of one (season, week) block has an interval of zero width. On the tuning seasons the site's model is worse in ${site.worseWindows} windows.`,
    table(
      ["Window", "Days", "Games", "Blocks", "Elo log loss", "Model log loss", "Model - Elo [95%]", "Verdict"],
      heldWindows.map((d) => [d.w, `${14 * d.w}-${14 * d.w + 13}`, d.n, d.blocks, f4(d.b), f4(d.a), ci(d), verdict(d) + (d.blocks === 1 ? ", one block" : "")]),
    ),
  );

  const calib = (set: Scored[]) => {
    const buckets = Array.from({ length: 10 }, () => ({ n: 0, stated: 0, won: 0 }));
    for (const x of set) {
      const fav = Math.max(x.p, 1 - x.p);
      const b = buckets[Math.min(9, Math.floor((fav - 0.5) / 0.05))];
      b.n++; b.stated += fav; b.won += (x.p >= 0.5 ? x.y : 1 - x.y);
    }
    return buckets;
  };
  const cm = calib(only(s, held)), ce = calib(only(elo, held));
  section(
    "Table 6. Calibration, held-out seasons",
    "Games bucketed by the favourite's stated chance. A calibrated model's favourites win about as often as it says.",
    table(
      ["Stated chance", "Model games", "Model says", "Model favourite won", "Elo games", "Elo says", "Elo favourite won"],
      cm.map((b, i) => {
        const e = ce[i];
        const cell = (x: typeof b) => (x.n ? [x.n, pct(x.stated / x.n), pct(x.won / x.n)] : [0, "", ""]);
        return [`${50 + 5 * i}-${55 + 5 * i}%`, ...cell(b), ...cell(e)];
      }),
    ),
  );

  const near: Candidate[] = [];
  const find = (n0: number, mi: number, mode: Mode) => grid.find((c) => c.n0 === n0 && c.mi === mi && c.mode === mode)!;
  const ni = N0.indexOf(site.c.n0);
  for (const j of [ni - 1, ni + 1]) if (N0[j] !== undefined) near.push(find(N0[j], site.c.mi, site.c.mode));
  for (const j of [site.c.mi - 1, site.c.mi + 1]) if (MARGINS[j]) near.push(find(site.c.n0, j, site.c.mode));
  near.push(find(site.c.n0, site.c.mi, site.c.mode === "fitted" ? "fixed" : "fitted"));
  if (site.c.mode === "fitted") for (const w of [10, 200]) near.push(build(site.c.n0, site.c.mi, "fitted", w));
  section(
    "Table 7. Sensitivity of the choice",
    "Each neighbour against the site's model on the tuning seasons; a positive difference means the neighbour does worse. The home prior's weight w_h is outside the grid and reported only.",
    table(
      ["Neighbour", "43 vs 1", "Tuning log loss", "Neighbour - site [95%]", "Verdict"],
      near.map((c) => {
        const d = compare(c.scored, s, tuning);
        return [label(c), `${ratio(c.rule.margin).toFixed(1)}x`, f4(d.a), ci(d), verdict(d)];
      }),
    ),
  );

  const tun = only(s, tuning);
  const excess = (x: Scored) => loss(x.p, x.y) - loss(x.ph, x.y);
  const within = (lo: number, hi: number) => tun.filter((x) => x.k >= lo && x.k <= hi).map(excess);
  const settled = mean(within(40, 59));
  const E = Array.from({ length: 40 }, (_, k) => mean(within(k - 2, k + 2)));
  const threshold = E.findIndex((_, k) => E.slice(k).every((e) => e - settled <= 0.01));
  section(
    "Table 8. Provisional threshold",
    `k is the number of games the less experienced side had played before a game. E(k) is the mean excess log loss (pre-game minus the season's final fit) of the tuning seasons' games with k within 2 of k. The settled level, games with k from 40 to 59, is ${f4(settled)}. The threshold is the first k from which E stays within 0.01 of it: **${threshold} games**.`,
    table(
      ["k", "Games at k", "E(k)", "E(k) - settled"],
      E.map((e, k) => [k, within(k, k).length, f4(e), s4(e - settled)]),
    ),
  );

  const classic = (d: number) => 1 / (1 + 10 ** (-d / 400));
  let maxErr = 0;
  for (let d = 0; d <= 1200; d++) maxErr = Math.max(maxErr, Math.abs(phi(d / ELO_PER_SIGMA) - classic(d)));
  const eloPerUnit = ELO_PER_SIGMA / site.c.sigma;
  section(
    "Table 9. The Elo scale",
    `A rating is ${START} plus the fitted rating times ${ELO_PER_SIGMA.toFixed(1)} / SIGMA Elo points, so a gap of g Elo points means Phi(g / ${ELO_PER_SIGMA.toFixed(1)}), the model's own chance. ${ELO_PER_SIGMA.toFixed(1)} is 400 x 1.702 / ln 10, the scale at which the normal curve sits closest to classic Elo's logistic: the largest gap between the two chances over 0 to 1200 points is ${maxErr.toFixed(4)}.`,
    table(
      ["Quantity", "Value"],
      [
        ["SIGMA, margin units", site.c.sigma.toFixed(3)],
        ["Elo points per margin unit", eloPerUnit.toFixed(2)],
        ["h0, margin units", site.c.h0.toFixed(3)],
        ["h0, Elo points", (site.c.h0 * eloPerUnit).toFixed(1)],
        ["Chance at a 100-point gap, model / classic Elo", `${pct(phi(100 / ELO_PER_SIGMA))} / ${pct(classic(100))}`],
        ["Chance at a 200-point gap, model / classic Elo", `${pct(phi(200 / ELO_PER_SIGMA))} / ${pct(classic(200))}`],
        ["Chance at a 400-point gap, model / classic Elo", `${pct(phi(400 / ELO_PER_SIGMA))} / ${pct(classic(400))}`],
      ],
    ),
  );

  section(
    "Table 10. 2026-27, logged only",
    "Too young to judge; shown so the season's start can be compared later.",
    table(
      ["Season", "Games", "Elo log loss", "Model log loss"],
      LOG_ONLY.map((id) => {
        const keep = inSeasons([id]);
        const n = only(s, keep).length;
        return [id, n, n ? f4(logLoss(only(elo, keep))) : "", n ? f4(logLoss(only(s, keep))) : ""];
      }),
    ),
  );

  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const want = { n0: site.c.n0, margin: site.c.rule.margin, home: site.c.mode === "fixed" ? { kind: "fixed", value: r3(site.c.h0) } : { kind: "fitted", centre: r3(site.c.h0), weight: HOME_WEIGHT }, sigma: r3(site.c.sigma) };
  const have = { ...PARAMS, home: PARAMS.home.kind === "fixed" ? { kind: "fixed", value: r3(PARAMS.home.value) } : { kind: "fitted", centre: r3(PARAMS.home.centre), weight: PARAMS.home.weight }, sigma: r3(PARAMS.sigma) };
  const paramsMatch = JSON.stringify(want) === JSON.stringify(have) && shipsJudged;
  const provisionalMatch = threshold === PROVISIONAL;
  out.push(
    `### Check\n\nsrc/lib/elo.ts PARAMS ${paramsMatch ? "match" : "DO NOT match"} the choice, \`${JSON.stringify(want)}\`. PROVISIONAL ${provisionalMatch ? "matches" : "DOES NOT match"} table 8 (${threshold}).`,
  );
  if (!paramsMatch || !provisionalMatch) process.exitCode = 1;
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
if (a < 0 || b < a) throw new Error("docs/model.md has lost its results markers");
writeFileSync(DOC, `${doc.slice(0, a + START_MARK.length)}\n${body}\n${doc.slice(b)}`);
console.error(`backtest: ${grid.length} candidates, ${((performance.now() - started) / 1000).toFixed(1)} s`);
