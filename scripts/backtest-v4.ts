// npm run backtest:v4: runs docs/model-v4.md's pre-registered plan. It scores version 4, and each of its parts, against
// version 3 as the site ran it on the tuning and exploration seasons, logs 2026-27 and the 2027-28 confirmation
// games so far and, once 2027-28 has its end in src/data/seasons.json, gives the confirmation's verdict. It prints
// every table and rewrites the Results part of docs/model-v4.md. It exits non-zero when the pre-registration's text
// has changed, or when src/lib/elo.ts's SIGMA and early widening differ from what the plan fits. Version 3 is
// src/lib/v3.ts's frozen settings with its own lineups and box ratings, so its numbers hold while the site runs version 4.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { EARLY, ELO_PER_SIGMA, PARAMS, seasonRule, type SeasonData, type SeasonInputs } from "../src/lib/elo.ts";
import { parseArchive } from "../src/lib/injuries.ts";
import { modelInputs } from "../src/lib/inputs.ts";
import { parseNbaArchive, type NbaArchive } from "../src/lib/nba-report.ts";
import { boxRatings, lineups, parseBox, type BoxRatings, type SeasonBox } from "../src/lib/players.ts";
import { reportLineups } from "../src/lib/report-lineup.ts";
import { V3 } from "../src/lib/v3.ts";
import { availability, topThreeStart, V4, type Availability, type LineupRule } from "../src/lib/v4.ts";
import type { DraftFile } from "../src/lib/draft.ts";
import {
  accuracy, brier, compare, fitSigma, fitWiden, inSeasons, logLoss, modelRows, price, TUNING, type Diff, type Row, type Scored,
} from "./evaluate.ts";
import { loadVegas } from "./vegas.ts";

const started = performance.now();
const DOC = new URL("../docs/model-v4.md", import.meta.url);
const PREREGISTERED = "90f4dd33b78b01a496c2274c7c13b76ae3732edc8e71fe8df96649996c04641c";

const WITH_REPORTS = ["2019-20", "2020-21", "2021-22", "2022-23"];
const EXPLORATION = ["2023-24", "2024-25", "2025-26"];
const LOGGED = "2026-27";
const CONFIRMATION = "2027-28";

const read = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(new URL(`../src/data/${path}`, import.meta.url), "utf8"));
  } catch {
    return undefined;
  }
};
const listed = read("seasons.json") as { id: string; end?: string }[];
const ALL = listed.map((s) => s.id).sort();
const finished = listed.some((s) => s.id === CONFIRMATION && s.end);
const draft = read("draft.json") as DraftFile;

const files = ALL.map((id) => ({ data: read(`games/${id}.json`) as SeasonData, box: read(`box/${id}.json`), preseason: read(`preseason/${id}.json`), injuries: read(`injuries/${id}.json`) }));
const inputs = modelInputs(files);
const walked = files.map((f) => ({ data: f.data, box: f.box === undefined ? { season: f.data.season, games: {} } : parseBox(f.box, f.data.season) }));
const reports = new Map<string, NbaArchive>();
for (const id of ALL) { const raw = read(`nba-reports/${id}.json`); if (raw !== undefined) reports.set(id, parseNbaArchive(raw, id)); }
const espn = new Map(files.flatMap((f) => (f.injuries === undefined ? [] : [[f.data.season, parseArchive(f.injuries, f.data.season)] as const])));
const vegas: Record<string, number> = Object.assign({}, ...ALL.filter((id) => id < LOGGED).map((id) => loadVegas(id).chances));

/** Version 3's lineup for a side the NBA's report does not cover: the previous game's, `recent` appearances' minutes, less ESPN's "Out". */
const fallbackOf = (recent: number) => {
  const previous = lineups(walked, recent);
  return (season: string) => reportLineups(walked.find((w) => w.data.season === season)!.data, previous.get(season)!.previous, espn.get(season));
};
const topThree = boxRatings(walked, PARAMS.players.halfLife, topThreeStart(walked, new Map(ALL.map((id) => [id, inputs.get(id)!.players!.rookies!])), draft));
const v4Lineups = availability(walked, reports, fallbackOf(V4.recent));
const NONE = new Map<string, Availability>();
/** Version 3's lineups and box ratings: the previous game's, 10 appearances' minutes, less ESPN's "Out", and no top-three start. */
const v3Lineups = new Map(ALL.map((id) => [id, fallbackOf(10)(id)]));
const v3Ratings = boxRatings(walked, PARAMS.players.halfLife);

/** Every season's rows: version 3's inputs with these lineups, box ratings and extra terms. */
function rows(lineupsOf?: ReadonlyMap<string, Availability>, ratingsOf?: ReadonlyMap<string, BoxRatings>, fill = true): Row[] {
  return walked.flatMap(({ data, box }) => {
    const inp = inputs.get(data.season)!;
    const players = inp.players!;
    const a = lineupsOf?.get(data.season);
    const season: SeasonInputs = {
      centres: inp.centres,
      players: { box: box as SeasonBox, ratings: ratingsOf?.get(data.season) ?? v3Ratings.get(data.season)!, lineups: a?.lineups ?? v3Lineups.get(data.season)!, rookies: players.rookies },
      extra: fill ? a?.extra : undefined,
    };
    return modelRows(data, seasonRule(inp), season);
  });
}
/** Rows priced with SIGMA and the early widening fitted on the tuning seasons. */
function fitted(r: Row[]) {
  const tun = r.filter((x) => TUNING.includes(x.season));
  const sigma = fitSigma(tun), widen = fitWiden(tun, sigma);
  return { sigma, widen, scored: price(r, sigma, widen) };
}

const v3 = price(rows(), V3.sigma, V3.widen);
const fit4 = fitted(rows(v4Lineups, topThree));
const { sigma, widen } = fit4;
const v4 = fit4.scored;
const v3Rule: LineupRule = { out: ["Out"], questionable: 1, back: [], window: 10, recent: 10, fill: 0 };
const pieces: [string, Scored[]][] = [
  ["Version 4", v4],
  ["Without the fill-in term", fitted(rows(v4Lineups, topThree, false)).scored],
  ["Without the top-three start", fitted(rows(v4Lineups)).scored],
  ["Top-three start alone", fitted(rows(NONE, topThree)).scored],
  ["Version 3's \"Out\" rule on the NBA's report", fitted(rows(availability(walked, reports, fallbackOf(10), v3Rule))).scored],
];

const splits: [string, (x: Scored) => boolean][] = [
  ["Tuning, 2015-16 to 2022-23", inSeasons(TUNING)],
  ["Tuning with reports, 2019-20 to 2022-23", inSeasons(WITH_REPORTS)],
  ["Exploration, 2023-24 to 2025-26", inSeasons(EXPLORATION)],
];
const confirmation = (x: Scored) => x.season === CONFIRMATION;
const logged = (x: Scored) => x.season === LOGGED && x.id in (reports.get(LOGGED)?.games ?? {});
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
  "Table 1. The NBA's reports on file",
  "Each final game's report and how many of its sides it covers; a side is uncovered when the report does not list the team or lists it as not yet submitted. Unmatched names are entries the fetch could not match to a player with a box line for the team that season, nearly all players out for the whole season.",
  table(
    ["Season", "Final games", "Both sides", "One side", "Neither", "Unmatched names"],
    ALL.filter((id) => reports.has(id)).map((id) => {
      const games = reports.get(id)!.games;
      const finals = walked.find((w) => w.data.season === id)!.data.games.filter((g) => g.final);
      let both = 0, one = 0, unmatched = 0;
      for (const g of finals) { const r = games[g.id]; const n = Number(!!r?.home) + Number(!!r?.away); both += Number(n === 2); one += Number(n === 1); unmatched += r?.unmatched?.length ?? 0; }
      return [id, finals.length, both, one, finals.length - both - one, unmatched];
    }),
  ),
);

section(
  "Table 2. Version 4 and its parts against version 3",
  "Version 3 as the site runs it, with its SIGMA and early widening; before 2026-27 it has no injury report, so it prices every game with the previous game's lineup. Version 4 and each part have their own SIGMA and widening, fitted on the tuning seasons. Only the tuning seasons judge; 2019-20 to 2022-23 are the tuning seasons with reports, and the exploration seasons informed the plan and confirm nothing.",
  table(
    ["Model", "Seasons", "Games", "Version 3 log loss", "Log loss", "Minus version 3 [95%]", "Verdict", "Brier", "Accuracy"],
    pieces.flatMap(([model, s]) => splits.map(([name, keep]) => {
      const d = compare(s, v3, keep);
      return [model, name, d.n, f4(d.b), f4(d.a), ci(d), verdict(d), f4(brier(only(s, keep))), pct(accuracy(only(s, keep)))];
    })),
  ),
);

const vegasRow = (name: string, keep: (x: Scored) => boolean) => {
  const k = withLine(keep);
  const n = only(v4, k).length;
  if (!n) return [name, 0, "", "", "", "", ""];
  const base = compare(v4, v3, k), veg = compare(v4, asVegas(v4), k), veg3 = compare(v3, asVegas(v3), k);
  return [name, n, f4(veg.b), f4(base.b), f4(base.a), ci(veg3), ci(veg)];
};
section(
  "Table 3. Version 4, version 3 and Vegas on the same games",
  "Every game with a Vegas line. Vegas is reported, never used to judge.",
  table(
    ["Seasons", "Games", "Vegas log loss", "Version 3 log loss", "Version 4 log loss", "Version 3 - Vegas [95%]", "Version 4 - Vegas [95%]"],
    splits.map(([name, keep]) => vegasRow(name, keep)),
  ),
);

const loggedGames = only(v4, logged);
section(
  `Table 4. ${LOGGED}, logged`,
  `The live fetch began saving the NBA's report before each tip-off during ${LOGGED}, so its games since then are scored here, never used to judge: version 3 had ESPN's morning report, version 4 the NBA's.`,
  loggedGames.length
    ? table(["Games with an NBA report", "Version 3 log loss", "Version 4 log loss", "Minus version 3 [95%]"], [(() => { const d = compare(v4, v3, logged); return [d.n, f4(d.b), f4(d.a), ci(d)]; })()])
    : "No game with a saved NBA report has been played.",
);

const confirm = compare(v4, v3, confirmation);
section(
  `Table 5. Confirmation, ${CONFIRMATION}`,
  finished
    ? `The season is over. Version 4's pooled log loss is ${confirm.d < 0 ? "below" : "not below"} version 3's, so ${confirm.d < 0 ? "version 4 goes on the site, unless version 3's own confirmation returned the site to version 2" : "the site keeps version 3"}.`
    : "Logged only: the confirmation judges once, after the season's last game. Each part is reported, never used to judge.",
  only(v4, confirmation).length
    ? table(["Model", "Games", "Version 3 log loss", "Log loss", "Minus version 3 [95%]"], pieces.map(([name, s]) => { const d = compare(s, v3, confirmation); return [name, d.n, f4(d.b), f4(d.a), ci(d)]; }))
    : "No confirmation game has been played.",
);

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r2 = (x: number) => Math.round(x * 100) / 100;
const want = { sigma: r3(sigma), widen: r2(widen) };
const have = { sigma: r3(PARAMS.sigma), widen: r2(EARLY.widen) };
const match = JSON.stringify(want) === JSON.stringify(have);
out.push(`### Check\n\nsrc/lib/v4.ts V4 ${match ? "matches" : "DOES NOT match"} the plan's fit, \`${JSON.stringify(want)}\`.`);
if (!match) process.exitCode = 1;

const doc = readFileSync(DOC, "utf8");
const lines = doc.split("\n");
const from = lines.indexOf("## Pre-registration");
const to = lines.findIndex((l, i) => i > from && l.startsWith("## "));
const hash = createHash("sha256").update(lines.slice(from + 1, to).join("\n")).digest("hex");
out.unshift(`Pre-registration SHA-256 now: \`${hash}\`, ${hash === PREREGISTERED ? "unchanged since its amendment on 2026-11-05" : "CHANGED since its amendment on 2026-11-05"}. Bootstrap: 2000 resamples of whole weeks, seed 20261025. Version 4's SIGMA ${f3(sigma)} (${(ELO_PER_SIGMA / sigma).toFixed(1)} Elo points per margin unit), early widening ${widen.toFixed(2)}; version 3's ${f3(V3.sigma)} and ${V3.widen.toFixed(2)}. Version 3's log loss on the tuning seasons: ${f4(logLoss(only(v3, inSeasons(TUNING))))}.`);
if (hash !== PREREGISTERED) process.exitCode = 1;

const body = out.join("\n\n");
console.log(body);
const START_MARK = "<!-- results:start -->";
const END_MARK = "<!-- results:end -->";
const a = doc.indexOf(START_MARK), b = doc.indexOf(END_MARK);
if (a >= 0 && b > a) writeFileSync(DOC, `${doc.slice(0, a + START_MARK.length)}\n${body}\n${doc.slice(b)}`);
else console.error("docs/model-v4.md has no results markers, so it is left as it is");

console.error(`backtest:v4: ${((performance.now() - started) / 1000).toFixed(1)} s`);

