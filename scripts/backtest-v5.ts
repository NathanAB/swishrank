// npm run backtest:v5: the past-seasons test (docs/adr/0002). Scores every candidate in scripts/candidates/ against
// version 4 on each finished season from FIRST_SCORED on, every setting chosen from the seasons before the one scored,
// prints the tables and rewrites the Results part of docs/model-v5.md. With file names as arguments, as in
// `node scripts/backtest-v5.ts on-court`, it scores only those candidates and leaves the doc as it is. Version 4 runs
// as a candidate too, against itself, and the run exits non-zero when any of its differences is not exactly 0. Each
// other candidate also chooses its settings from every finished season, the ones a season after them would run with;
// a candidate file that exports `frozen`, the settings src/lib holds for the site, fails the run when they differ. A
// candidate file that exports `against`, other candidate file names, is also scored against each of those.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { BOOTSTRAP, type Diff } from "./evaluate.ts";
import { isCandidate, marketLines, PRE_TIP, pricedOnce, reportsRead, scoreboard, type Board, type Candidate, type Line } from "./past-seasons.ts";
import { loadPolymarket } from "./polymarket.ts";
import { listed, seasons } from "./seasons-on-file.ts";
import { loadVegas } from "./vegas.ts";

const started = performance.now();
const DOC = new URL("../docs/model-v5.md", import.meta.url);
const CANDIDATES = new URL("./candidates/", import.meta.url);
const FIRST_SCORED = "2019-20";
const BASELINE_FILE = "v4";

const scored = listed.filter((s) => s.id >= FIRST_SCORED && s.end).map((s) => s.id).sort();
const isFinished = (id: string) => listed.some((s) => s.id === id && s.end);

type Loaded = { candidate: Candidate; frozen?: string; against: string[] };
async function load(file: string): Promise<Loaded> {
  const mod: unknown = await import(new URL(`${file}.ts`, CANDIDATES).href);
  const candidate = typeof mod === "object" && mod !== null && "default" in mod ? mod.default : undefined;
  if (!isCandidate(candidate)) throw new Error(`scripts/candidates/${file}.ts has no default export shaped like a Candidate`);
  const frozen = typeof mod === "object" && mod !== null && "frozen" in mod && typeof mod.frozen === "string" ? mod.frozen : undefined;
  const raw = typeof mod === "object" && mod !== null && "against" in mod ? mod.against : [];
  if (!Array.isArray(raw) || !raw.every((a): a is string => typeof a === "string")) throw new Error(`scripts/candidates/${file}.ts exports an \`against\` that is not a list of file names`);
  for (const a of raw) if (!onFile.includes(a)) throw new Error(`scripts/candidates/${file}.ts is scored against ${a}, which is not on file`);
  return { candidate, frozen, against: raw };
}
const loaded = new Map<string, Promise<Loaded>>();
/** A candidate file loaded once, its candidate priced once however many boards score it. */
const loadOnce = (file: string): Promise<Loaded> => {
  const hit = loaded.get(file) ?? load(file).then((l) => ({ ...l, candidate: pricedOnce(l.candidate) }));
  loaded.set(file, hit);
  return hit;
};

const onFile = readdirSync(CANDIDATES)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => f.slice(0, -3))
  .sort((x, y) => Number(y === BASELINE_FILE) - Number(x === BASELINE_FILE) || x.localeCompare(y));
const asked = process.argv.slice(2);
for (const a of asked) if (!onFile.includes(a)) throw new Error(`scripts/candidates/${a}.ts is not on file`);
const files = asked.length ? onFile.filter((f) => asked.includes(f)) : onFile;
// Its own wrapper, apart from the one version 4 is scored with as a candidate, so the check against itself prices it twice.
const baseline = pricedOnce((await load(BASELINE_FILE)).candidate);
const finished = seasons.filter((s) => isFinished(s.data.season)).sort((x, y) => x.data.season.localeCompare(y.data.season));

const vegas: Record<string, number> = Object.assign({}, ...scored.map((id) => loadVegas(id).chances));
const polymarket: Record<string, number> = Object.assign({}, ...scored.map((id) => loadPolymarket(id).chances));
const markets: [string, Record<string, number>][] = [["Vegas", vegas], ["Polymarket", polymarket]];

const f3 = (x: number) => x.toFixed(3);
const f4 = (x: number) => x.toFixed(4);
const s4 = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(4);
const ci = (d: Diff) => `${s4(d.d)} [${s4(d.lo)}, ${s4(d.hi)}]`;
const f2 = (x: number) => x.toFixed(2);
const s2 = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(2);
const ci2 = (d: Diff) => `${s2(d.d)} [${s2(d.lo)}, ${s2(d.hi)}]`;
const verdict = (d: Diff) => (d.hi < 0 ? "better" : d.lo > 0 ? "worse" : "tie");
const span = (ids: readonly string[]) => (ids.length ? `${ids[0]} to ${ids[ids.length - 1]}` : "none");
function table(head: string[], body: (string | number)[][]) {
  return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}
const out: string[] = [];
const section = (title: string, intro: string, body: string) => out.push(`### ${title}\n\n${intro}\n\n${body}`);

out.push(`Bootstrap: ${BOOTSTRAP.resamples} resamples of whole weeks, seed ${BOOTSTRAP.seed}. Seasons scored from ${FIRST_SCORED} on, each with every setting chosen from the seasons before it. Candidates scored: ${files.length}, version 4's check against itself included.`);

section(
  "Table 1. The injury reports both versions read",
  `Both versions read scripts/nba-reports-at-tip/, built to hold each game's last NBA report published at least ${PRE_TIP} minutes before its tip-off. A side without one takes version 3's lineup in version 4, and is priced at the uncovered rates under roster-based lineups. The last three columns measure the rule on the files: the minutes from the time each report says it was published to its game's tip-off, and how many games read a report from under ${PRE_TIP} minutes before it.`,
  table(
    ["Season", "Final games", "Both sides", "One side", "Neither", "Median minutes before tip-off", "Shortest", `Under ${PRE_TIP} minutes`],
    scored.map((id) => {
      const r = reportsRead(seasons.find((s) => s.data.season === id)!);
      return [id, r.finals, r.both, r.one, r.neither, r.lead ? r.lead.median : "", r.lead ? r.lead.shortest : "", r.lead ? r.lead.late : ""];
    }),
  ),
);

/** Every difference of a board that must be exactly 0 when the candidate is version 4. */
const differences = (board: Board): number[] =>
  [...board.seasons, board.pooled].flatMap((l) => [l.logLoss.d, l.logLoss.lo, l.logLoss.hi, ...(l.lineups.teamGames ? [l.lineups.misplaced.d] : [])]);

const lowerFirst = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
for (const file of files) {
  const { candidate, frozen, against } = await loadOnce(file);
  const name = candidate.name;
  for (const versus of [BASELINE_FILE, ...against]) {
    const base = versus === BASELINE_FILE ? baseline : (await loadOnce(versus)).candidate;
    const board = scoreboard({ seasons, scored, candidate, baseline: base });
    const title = versus === BASELINE_FILE ? name : `${name} against ${lowerFirst(base.name)}`;
    const them = base.name, theirs = lowerFirst(base.name);
    section(
      `${title}: log loss on real results`,
      versus === BASELINE_FILE
        ? "Each season is scored with the candidate's settings chosen from the seasons before it; the pooled row takes every scored game. Version 4 is as the site ran it until the switch to version 5 (src/lib/inputs.ts modelInputs with no switches, src/lib/v4.ts V4) on the reports of Table 1, so its numbers differ from docs/model-v4.md's, which read the 5 PM reports. It keeps its own settings in every season, and its plan chose them with these seasons in view, so the comparison favours version 4."
        : `Each season is scored with the candidate's settings chosen from the seasons before it; the pooled row takes every scored game. The baseline is ${theirs} (scripts/candidates/${versus}.ts), its settings chosen from the same seasons.`,
      table(
        ["Season", "Settings chosen from", "Candidate's settings", "Games", `${them} log loss`, "Candidate log loss", `Candidate minus ${theirs} [95%]`, "Verdict"],
        [
          ...board.seasons.map((s) => [s.season, span(s.chosenFrom), s.settings.candidate, s.logLoss.n, f4(s.logLoss.b), f4(s.logLoss.a), ci(s.logLoss), verdict(s.logLoss)]),
          ["Pooled", "", "", board.pooled.logLoss.n, f4(board.pooled.logLoss.b), f4(board.pooled.logLoss.a), ci(board.pooled.logLoss), verdict(board.pooled.logLoss)],
        ],
      ),
    );
    if (versus === BASELINE_FILE) {
      const lines = markets.map(([market, chances]) => [market, marketLines(board, chances)] as const);
      section(
        `${name} beside Vegas and Polymarket`,
        "On the games each market has a chance for. The markets are reported, never used to choose a setting or to judge.",
        table(
          ["Season", "Market", "Games", "Market log loss", "Version 4 log loss", "Candidate log loss"],
          [
            ...board.seasons.flatMap((s) => lines.flatMap(([market, m]) => m.seasons.filter((x) => x.season === s.season).map((x) => [s.season, market, x.games, f4(x.market), f4(x.baseline), f4(x.candidate)]))),
            ...lines.filter(([, m]) => m.pooled.games).map(([market, m]) => ["Pooled", market, m.pooled.games, f4(m.pooled.market), f4(m.pooled.baseline), f4(m.pooled.candidate)]),
          ],
        ),
      );
    }
    const lineupRow = (season: string, l: Line) =>
      l.lineups.teamGames
        ? [season, l.lineups.teamGames, f2(l.lineups.misplaced.b), f2(l.lineups.misplaced.a), ci2(l.lineups.misplaced), f3(l.lineups.valueError.baseline), f3(l.lineups.valueError.candidate)]
        : [season, 0, "", "", "", "", ""];
    section(
      `${title}: lineup minutes against the minutes played`,
      "Over the team-games with a box score, played minutes scaled to 240 a side. Minutes misplaced is half the summed gap between each player's predicted and played minutes: the minutes of a team-game the lineup put on the wrong players. Value error is the root mean square of the sum over players of (predicted - played) / 48 times the player's value, at each version's own values, in margin units.",
      table(
        ["Season", "Team-games", `${them} minutes misplaced`, "Candidate minutes misplaced", `Candidate minus ${theirs} [95%]`, `${them} value error`, "Candidate value error"],
        [...board.seasons.map((s) => lineupRow(s.season, s)), lineupRow("Pooled", board.pooled)],
      ),
    );
    if (file === BASELINE_FILE) {
      const off = differences(board).filter((d) => d !== 0);
      out.push(`### Check\n\nVersion 4 against itself: ${off.length ? `${off.length} differences are NOT exactly 0` : "every difference is exactly 0"}.`);
      if (off.length) {
        console.error(`backtest:v5: version 4 against itself has ${off.length} differences that are not exactly 0`);
        process.exitCode = 1;
      }
    }
  }
  if (file !== BASELINE_FILE) {
    const settings = candidate.choose(finished).settings;
    const differs = frozen !== undefined && frozen !== settings;
    out.push(`### ${name}: settings from every finished season\n\nChosen from ${span(finished.map((s) => s.data.season))}, the settings the season after them would run with: ${settings}.${frozen === undefined ? "" : differs ? ` They are NOT the settings on file for the site: ${frozen}.` : " They are the settings on file for the site."}`);
    if (differs) {
      console.error(`backtest:v5: ${name}'s settings on file for the site are not the ones it chooses from every finished season`);
      process.exitCode = 1;
    }
  }
}

const body = out.join("\n\n");
console.log(body);
if (!asked.length) {
  const doc = readFileSync(DOC, "utf8");
  const START_MARK = "<!-- results:start -->";
  const END_MARK = "<!-- results:end -->";
  const a = doc.indexOf(START_MARK), b = doc.indexOf(END_MARK);
  if (a >= 0 && b > a) writeFileSync(DOC, `${doc.slice(0, a + START_MARK.length)}\n${body}\n${doc.slice(b)}`);
  else console.error("docs/model-v5.md has no results markers, so it is left as it is");
}

console.error(`backtest:v5: ${((performance.now() - started) / 1000).toFixed(1)} s`);
