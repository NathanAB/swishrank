// npm run roster-check: the prototype's check of roster-based lineups (issue 70), reproduced once. Rates are learned
// from exactly 2019-20 to 2022-23, as the prototype learned them, and version 4's ratings run with its own SIGMA and
// early widening; the scoreboard scores 2023-24 to 2025-26 against version 4 for each fill of scripts/roster-candidates.ts.
// It prints the rates and the scores as Markdown tables and changes no file.
import { parseNbaArchive } from "../src/lib/nba-report.ts";
import { parseBox } from "../src/lib/players.ts";
import { rosterRates, type RosterRule } from "../src/lib/roster-lineups.ts";
import { V4 } from "../src/lib/v4.ts";
import version4 from "./candidates/v4.ts";
import { pricedOnce, scoreboard, type Candidate } from "./past-seasons.ts";
import { FILLS, version4With } from "./roster-candidates.ts";
import { seasons } from "./seasons-on-file.ts";

const started = performance.now();
const FROM = ["2019-20", "2020-21", "2021-22", "2022-23"];
const SCORED = ["2023-24", "2024-25", "2025-26"];

function table(head: string[], body: (string | number)[][]) {
  return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}
const s4 = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(4);
/** A cell's mean and count, or a dash for a cell with no observation. */
const cell = (sum: number, n: number, places: number) => (n ? `${(sum / n).toFixed(places)} (${n})` : "-");

const learned = [...seasons].sort((x, y) => x.data.season.localeCompare(y.data.season)).filter((s) => s.data.season <= FROM[FROM.length - 1]);
const archives = new Map(learned.flatMap((s) => (s.nbaReports === undefined ? [] : [[s.data.season, parseNbaArchive(s.nbaReports, s.data.season)] as const])));
const { cells, labels } = rosterRates(learned.map((s) => ({ data: s.data, box: parseBox(s.box, s.data.season) })), archives, FROM);

/** The summed observations of the cells of `table` whose labels `match` accepts. */
const pooled = (name: string, match: (at: Record<string, string>) => boolean) =>
  cells.filter((c) => c.table === name && match(c.at)).reduce((t, c) => ({ sum: t.sum + c.sum, n: t.n + c.n }), { sum: 0, n: 0 });

const out: string[] = [];
out.push(`### P(plays) by status and games missed in a row\n\nPlayers with 18 or more usual minutes, rates learned from ${FROM[0]} to ${FROM[FROM.length - 1]}; each cell is the share who played, with its count.\n\n${table(
  ["Status", ...labels.missed.map((m) => `Missed ${m}`)],
  labels.status.map((status) => [status, ...labels.missed.map((missed) => {
    const { sum, n } = pooled("plays", (at) => at.status === status && at.missed === missed && labels.usual.slice(-2).includes(at.usual));
    return cell(sum, n, 2);
  })]),
)}`);
out.push(`### Minutes multiplier by usual minutes and share of rotation absent\n\nPlayed minutes of 240 over usual minutes (at least 4), for prospects who played, with each cell's count.\n\n${table(
  ["Usual minutes", ...labels.absent.map((a) => `Absent ${a}`)],
  labels.usual.map((usual) => [usual, ...labels.absent.map((absent) => {
    const { sum, n } = pooled("minutes", (at) => at.usual === usual && at.absent === absent);
    return cell(sum, n, 3);
  })]),
)}`);

const baseline = pricedOnce(version4);
const rows = FILLS.map((fill) => {
  const roster: RosterRule = { fill, from: FROM };
  const candidate: Candidate = {
    name: `Version 4 with roster-based lineups at fill ${fill}`,
    choose: (earlier) => version4With(earlier, roster),
  };
  const { pooled: line } = scoreboard({ seasons, scored: SCORED, candidate, baseline });
  const { logLoss: d, lineups: l } = line;
  return [fill, d.n, `${s4(d.d)} [${s4(d.lo)}, ${s4(d.hi)}]`, l.teamGames, l.misplaced.b.toFixed(2), l.misplaced.a.toFixed(2), l.valueError.baseline.toFixed(3), l.valueError.candidate.toFixed(3)];
});
out.push(`### Roster lineups against version 4, ${SCORED[0]} to ${SCORED[SCORED.length - 1]} pooled\n\nVersion 4's ratings, SIGMA ${V4.sigma} and early widening ${V4.widen} in both; rates learned from ${FROM[0]} to ${FROM[FROM.length - 1]}.\n\n${table(
  ["Fill", "Games", "Roster minus version 4 log loss [95%]", "Team-games", "Version 4 minutes misplaced", "Roster minutes misplaced", "Version 4 value error", "Roster value error"],
  rows,
)}`);

console.log(out.join("\n\n"));
console.error(`roster-check: ${((performance.now() - started) / 1000).toFixed(1)} s`);
