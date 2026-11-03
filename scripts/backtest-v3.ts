// npm run backtest:v3: runs docs/model-v3.md's pre-registered plan, as amended before any confirmation game. It
// scores version 3 and each of its changes against version 2 as the site ran it on the tuning and exploration
// seasons, checks the tuning windows, logs the 2026-27 confirmation games so far and, once the season has its end in
// src/data/seasons.json, gives the confirmation's verdict. It prints every table and rewrites the Results part of
// docs/model-v3.md. It exits non-zero when the pre-registration's text has changed, or when version 3's settings,
// src/lib/elo.ts's PARAMS and EARLY as src/lib/v3.ts reads them, differ from what the plan fits.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dayKey, ELO_PER_SIGMA, seedCentres, type FitRule, type SeasonData, type SeasonInputs } from "../src/lib/elo.ts";
import { trailingHomeEdges } from "../src/lib/home.ts";
import { beforeTip, parseArchive, type InjuryArchive } from "../src/lib/injuries.ts";
import { boxRatings, lineups, type Lineup, type Sides } from "../src/lib/players.ts";
import { reportLineups } from "../src/lib/report-lineup.ts";
import { newcomers } from "../src/lib/rookies.ts";
import { V3 } from "../src/lib/v3.ts";
import {
  accuracy, brier, compare, fitSigma, fitWiden, inSeasons, loadBox, loadPreseason, loadSeason, logLoss, modelRows, price,
  TUNING, V2, windows, type Diff, type Scored,
} from "./evaluate.ts";
import { loadVegas } from "./vegas.ts";

const started = performance.now();
const DOC = new URL("../docs/model-v3.md", import.meta.url);
const PREREGISTERED = "d4996fce984e4d47137aac2e1ed0e96c6938085629d344c6073d0510e4a2af59";

const EXPLORATION = ["2023-24", "2024-25", "2025-26"];
const CONFIRMATION = "2026-27";
const FIRST_DAY = "2026-11-01";
const ALL = [...TUNING, ...EXPLORATION, CONFIRMATION];

const read = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(new URL(`../src/data/${path}`, import.meta.url), "utf8"));
  } catch {
    return undefined;
  }
};
const listed = read("seasons.json") as { id: string; end?: string }[];
const finished = listed.some((s) => s.id === CONFIRMATION && s.end);

const seasons = ALL.map((id) => {
  const data = loadSeason(id);
  return { data, box: loadBox(id), centres: seedCentres(V2.params.seed, Object.keys(data.teams), { preseason: loadPreseason(data), last: {} }) };
});
const vegas: Record<string, number> = Object.assign({}, ...ALL.map((id) => loadVegas(id).chances));
const lineupsBy = lineups(seasons);
const ratings = boxRatings(seasons, V2.params.players.halfLife);
const rookies = newcomers(seasons);
const homes = trailingHomeEdges(seasons.map((s) => s.data), V2.params, V3.home);
const rawArchive = read(`injuries/${CONFIRMATION}.json`);
const archive: InjuryArchive | undefined = rawArchive === undefined ? undefined : parseArchive(rawArchive, CONFIRMATION);
const confirmationData = seasons.find((s) => s.data.season === CONFIRMATION)!.data;
const previous = lineupsBy.get(CONFIRMATION)!.previous;
const withReport = reportLineups(confirmationData, previous, archive);

type Lineups = (season: string) => ReadonlyMap<string, Sides<Lineup>>;
const previousLineups: Lineups = (season) => lineupsBy.get(season)!.previous;
const reportLineupsOf: Lineups = (season) => (season === CONFIRMATION ? withReport : lineupsBy.get(season)!.previous);
const fixedHome = () => V2.params.home.value;
const trailingHome = (season: string) => homes.get(season)!.value;

/** Every season's rows under version 2's settings with each season's home edge, lineups and, if given, rookie hold. */
function rows(home: (season: string) => number, lineupsOf: Lineups, rookieNp?: number) {
  return seasons.flatMap(({ data, box, centres }) => {
    const rule: FitRule = { ...V2.params, home: { kind: "fixed", value: home(data.season) }, players: { ...V2.params.players, rookieNp } };
    const inputs: SeasonInputs = {
      centres,
      players: { box, ratings: ratings.get(data.season)!, lineups: lineupsOf(data.season) as Map<string, Sides<Lineup>>, rookies: rookies.get(data.season) },
    };
    return modelRows(data, rule, inputs);
  });
}
/** Rows priced with SIGMA and the early widening fitted on their tuning seasons. */
function fitted(r: ReturnType<typeof rows>) {
  const tun = r.filter((x) => TUNING.includes(x.season));
  const sigma = fitSigma(tun), widen = fitWiden(tun, sigma);
  return { sigma, widen, scored: price(r, sigma, widen) };
}

const v2 = price(rows(fixedHome, previousLineups), V2.params.sigma, V2.early.widen);
const fit3 = fitted(rows(trailingHome, previousLineups, V3.rookieNp));
const { sigma, widen } = fit3;
const v3 = price(rows(trailingHome, reportLineupsOf, V3.rookieNp), sigma, widen);
const homeOnly = fitted(rows(trailingHome, previousLineups)).scored;
const rookieOnly = fitted(rows(fixedHome, previousLineups, V3.rookieNp)).scored;
const reportOnly = price(rows(fixedHome, reportLineupsOf), V2.params.sigma, V2.early.widen);

const gameOf = new Map(seasons.flatMap(({ data }) => data.games.map((g) => [g.id, g])));
const tuning = inSeasons(TUNING);
const exploration = inSeasons(EXPLORATION);
const confirmation = (x: Scored) => x.season === CONFIRMATION && dayKey(gameOf.get(x.id)!.t) >= FIRST_DAY;
const withLine = (keep: (x: Scored) => boolean) => (x: Scored) => keep(x) && x.id in vegas;
const only = (s: Scored[], keep: (x: Scored) => boolean) => s.filter(keep);
const asVegas = (s: Scored[]): Scored[] => s.map((x) => ({ ...x, p: vegas[x.id] ?? 0.5 }));

const f3 = (x: number) => x.toFixed(3);
const f4 = (x: number) => x.toFixed(4);
const s4 = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(4);
const ci = (d: Diff) => `${s4(d.d)} [${s4(d.lo)}, ${s4(d.hi)}]`;
const verdict = (d: Diff) => (d.hi < 0 ? "better" : d.lo > 0 ? "worse" : "tie");
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
function table(head: string[], body: (string | number)[][]) {
  return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}
const out: string[] = [];
const section = (title: string, intro: string, body: string) => out.push(`### ${title}\n\n${intro}\n\n${body}`);

section(
  "Table 1. Each season's home edge",
  "The mean of counted(home margin) less the back-to-back term over the final, non-neutral games of the three seasons before it, in margin units and in Elo points at version 3's SIGMA. Version 2 uses 0.622 every season.",
  table(
    ["Season", "Home edge", "Elo points", "Games", "From"],
    ALL.map((id) => {
      const h = homes.get(id)!;
      return [id, f3(h.value), (h.value * (ELO_PER_SIGMA / sigma)).toFixed(1), h.games, h.from.length ? h.from.join(", ") : "none, 0.622"];
    }),
  ),
);

const judged = windows(v3, v2, tuning);
section(
  "Table 2. Version 3 on the tuning and exploration seasons",
  "Before 2026-27 no season has an injury report, so on these seasons version 3 differs from version 2 in its home edge and its rookie hold. SIGMA and the early widening are version 3's own, fitted by maximum likelihood on the tuning seasons. Each change alone has its own. The exploration seasons informed the plan and confirm nothing.",
  table(
    ["Model", "Seasons", "Games", "Version 2 log loss", "Log loss", "Minus version 2 [95%]", "Verdict", "Brier", "Accuracy"],
    ([["Version 3", v3], ["Home edge alone", homeOnly], ["Rookie hold alone", rookieOnly]] as const).flatMap(([model, s]) =>
      ([["Tuning, 2015-16 to 2022-23", tuning], ["Exploration, 2023-24 to 2025-26", exploration]] as const).map(([name, keep]) => {
        const d = compare(s, v2, keep);
        return [model, name, d.n, f4(d.b), f4(d.a), ci(d), verdict(d), f4(brier(only(s, keep))), pct(accuracy(only(s, keep)))];
      })),
  ),
);

section(
  "Table 3. Two-week windows, tuning seasons pooled",
  "Window w holds days 14w to 14w + 13 of each season. Reported, never used to judge: each window's own 95% interval would call some window worse by chance alone, as the pre-registration says.",
  table(
    ["Window", "Days", "Games", "Blocks", "Version 2 log loss", "Version 3 log loss", "Version 3 - version 2 [95%]", "Verdict"],
    judged.map((d) => [d.w, `${14 * d.w}-${14 * d.w + 13}`, d.n, d.blocks, f4(d.b), f4(d.a), ci(d), verdict(d)]),
  ),
);

const vegasRow = (name: string, keep: (x: Scored) => boolean) => {
  const k = withLine(keep);
  const n = only(v3, k).length;
  if (!n) return [name, 0, "", "", "", "", ""];
  const base = compare(v3, v2, k), veg = compare(v3, asVegas(v3), k);
  return [name, n, f4(veg.b), f4(base.b), f4(base.a), ci(base), ci(veg)];
};
section(
  "Table 4. Version 3, version 2 and Vegas on the same games",
  "Every game with a Vegas line, as in version 2. Vegas is reported, never used to judge.",
  table(
    ["Seasons", "Games", "Vegas log loss", "Version 2 log loss", "Version 3 log loss", "Version 3 - version 2 [95%]", "Version 3 - Vegas [95%]"],
    [vegasRow("Tuning, 2015-16 to 2022-23", tuning), vegasRow("Exploration, 2023-24 to 2025-26", exploration), vegasRow(`Confirmation, ${FIRST_DAY} on`, confirmation)],
  ),
);

const confirmationGames = only(v3, confirmation);
const reportDays = archive ? new Set(Object.keys(archive.days)) : new Set<string>();
const usable = archive ? new Set(Object.keys(beforeTip(archive, confirmationData.games).days)) : new Set<string>();
let reported = 0, changedGames = 0, changedSides = 0, dropped = 0;
for (const x of confirmationGames) {
  const before = previous.get(x.id)!, after = withReport.get(x.id)!;
  if (usable.has(dayKey(gameOf.get(x.id)!.t))) reported++;
  const n = { home: before.home.length - after.home.length, away: before.away.length - after.away.length };
  changedSides += Number(n.home > 0) + Number(n.away > 0);
  dropped += n.home + n.away;
  if (n.home > 0 || n.away > 0) changedGames++;
}
section(
  "Table 5. The injury report on the confirmation games",
  `Days with a saved report: ${reportDays.size}, ${usable.size} of them fetched before the day's first tip-off. A game uses its day's report only then.`,
  table(
    ["Confirmation games so far", "With a report fetched before tip-off", "Games with a lineup changed", "Team lineups changed", "Players dropped"],
    [[confirmationGames.length, reported, changedGames, changedSides, dropped]],
  ),
);

const confirm = compare(v3, v2, confirmation);
const pieces: [string, Scored[]][] = [["Version 3", v3], ["Home edge alone", homeOnly], ["Report lineups alone", reportOnly], ["Rookie hold alone", rookieOnly]];
section(
  `Table 6. Confirmation, 2026-27 from ${FIRST_DAY}`,
  finished
    ? `The season is over. Version 3's pooled log loss is ${confirm.d < 0 ? "below" : "not below"} version 2's, so ${confirm.d < 0 ? "version 3 goes on the site, unless version 2's own confirmation returned it to version 1" : "the site keeps version 2"}.`
    : "Logged only: the confirmation judges once, after the season's last game. Each piece alone is reported, never used to judge.",
  confirmationGames.length
    ? table(
        ["Model", "Games", "Version 2 log loss", "Log loss", "Minus version 2 [95%]", "Two-week windows worse, reported"],
        pieces.map(([name, s]) => {
          const d = compare(s, v2, confirmation);
          return [name, d.n, f4(d.b), f4(d.a), ci(d), windows(s, v2, confirmation).filter((w) => w.lo > 0).length];
        }),
      )
    : "No confirmation game has been played.",
);

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r2 = (x: number) => Math.round(x * 100) / 100;
const want = { home: V3.home, out: V3.out, rookieNp: V3.rookieNp, sigma: r3(sigma), widen: r2(widen) };
const have = { home: V3.home, out: V3.out, rookieNp: V3.rookieNp, sigma: r3(V3.sigma), widen: r2(V3.widen) };
const match = JSON.stringify(want) === JSON.stringify(have);
out.push(`### Check\n\nsrc/lib/v3.ts V3 ${match ? "matches" : "DOES NOT match"} the plan's fit, \`${JSON.stringify(want)}\`.`);
if (!match) process.exitCode = 1;

const doc = readFileSync(DOC, "utf8");
const lines = doc.split("\n");
const from = lines.indexOf("## Pre-registration");
const to = lines.findIndex((l, i) => i > from && l.startsWith("## "));
const hash = createHash("sha256").update(lines.slice(from + 1, to).join("\n")).digest("hex");
out.unshift(`Pre-registration SHA-256 now: \`${hash}\`, ${hash === PREREGISTERED ? "unchanged since its last amendment on 2026-10-31" : "CHANGED since its last amendment on 2026-10-31"}. Bootstrap: 2000 resamples of whole weeks, seed 20261025. Version 3's SIGMA ${f3(sigma)}, early widening ${widen.toFixed(2)}.`);
if (hash !== PREREGISTERED) process.exitCode = 1;

const body = out.join("\n\n");
console.log(body);
const START_MARK = "<!-- results:start -->";
const END_MARK = "<!-- results:end -->";
const a = doc.indexOf(START_MARK), b = doc.indexOf(END_MARK);
if (a < 0 || b < a) throw new Error("docs/model-v3.md has lost its results markers");
writeFileSync(DOC, `${doc.slice(0, a + START_MARK.length)}\n${body}\n${doc.slice(b)}`);
console.error(`backtest:v3: ${((performance.now() - started) / 1000).toFixed(1)} s`);
