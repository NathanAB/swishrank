// Builds src/data/nba-reports/<season>.json for seasons before the live fetch began (docs/model-v4.md): for each
// final game, the NBA's injury report from about two hours before its tip-off, as the league's archive keeps it.
//
//   node scripts/nba-report-history.ts 2019-20 2020-21 ...   [--cache <dir>]
//
// A game takes the latest report published on the hour at least 90 minutes before its tip, Eastern time, no later
// than 5 PM and no earlier than 11 AM; the league published three a day before 2021-22 (1, 5 and 8 PM), so a game
// takes the latest of those at or before that hour. A game before 12:30 PM takes the night before's 8 PM report,
// which lists only that night's games, so it has none. Each report is downloaded once into the cache directory as
// pdftotext -layout text, named <day>_<hour>.txt for the day and hour wanted. Needs curl and pdftotext (poppler-utils).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { addDays, dayKey, finalDays, TZ } from "../src/lib/elo.ts";
import { gameSides, nameMatcher, parseReportText, rosters, teamNames, type GameReport, type NbaArchive, type NbaReport } from "../src/lib/nba-report.ts";
import { loadBox, loadSeason } from "./evaluate.ts";

const args = process.argv.slice(2);
const at = args.indexOf("--cache");
const CACHE = at >= 0 ? args[at + 1] : new URL("../.cache/nba-reports/", import.meta.url).pathname;
const seasons = args.filter((a, i) => a !== "--cache" && i !== at + 1);
const names = JSON.parse(readFileSync(new URL("../src/data/players.json", import.meta.url), "utf8")) as Record<string, string>;
const OUT = new URL("../src/data/nba-reports/", import.meta.url);
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

const clock = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const easternHour = (iso: string) => { const [h, m] = clock.format(new Date(iso)).split(":").map(Number); return h + m / 60; };

/** The report a game wants: its day and hour, Eastern time. */
function wanted(t: string): [string, number] {
  const day = dayKey(t), hour = easternHour(t);
  if (hour < 12.5) return [addDays(day, -1), 20];
  return [day, Math.max(11, Math.min(17, Math.floor(hour - 1.5)))];
}

const fileNames = (h: number) => { const ap = h >= 12 ? "PM" : "AM", d = String(h > 12 ? h - 12 : h).padStart(2, "0"); return [`${d}${ap}`, `${d}_00${ap}`]; };
const URL_FOR = (day: string, name: string) => `https://ak-static.cms.nba.com/referee/injury/Injury-Report_${day}_${name}.pdf`;

/** The text of the latest report at or before `hour` on `day`, down to 11 AM, else the night before's 8 or 7 PM; null when none. */
function reportText(day: string, hour: number): string | null {
  const cached = `${CACHE}/${day}_${hour}.txt`;
  if (existsSync(cached)) return readFileSync(cached, "utf8");
  const pdf = `${CACHE}/${day}_${hour}.pdf`;
  const tries: [string, number][] = [];
  for (let h = hour; h >= 11; h--) tries.push([day, h]);
  if (hour !== 20) tries.push([addDays(day, -1), 20], [addDays(day, -1), 19]);
  for (const [d, h] of tries) for (const name of fileNames(h)) {
    try {
      execFileSync("curl", ["-sf", "--max-time", "30", "--retry", "2", "-o", pdf, URL_FOR(d, name)]);
      execFileSync("pdftotext", ["-layout", pdf, cached]);
      rmSync(pdf);
      return readFileSync(cached, "utf8");
    } catch { /* not published at that time */ }
  }
  return null;
}

for (const id of seasons) {
  const data = loadSeason(id), box = loadBox(id);
  const teams = teamNames(data);
  const matchers = new Map([...rosters(box, names)].map(([abbr, players]) => [abbr, nameMatcher(players)]));
  const match = (abbr: string, name: string) => matchers.get(abbr)?.(name) ?? null;
  const reports = new Map<string, NbaReport | null>();
  const games: Record<string, GameReport> = {};
  let covered = 0, finals = 0, unmatched = 0;
  for (const { games: today } of finalDays(data)) for (const g of today) {
    finals++;
    const [day, hour] = wanted(g.t);
    const key = `${day}_${hour}`;
    if (!reports.has(key)) { const text = reportText(day, hour); reports.set(key, text === null ? null : parseReportText(text, teams)); }
    const report = reports.get(key);
    const sides = report?.published ? gameSides(g, report, match) : null;
    if (!report?.published || !sides) continue;
    games[g.id] = { published: report.published, ...sides };
    if (sides.home && sides.away) covered++;
    unmatched += sides.unmatched?.length ?? 0;
  }
  const archive: NbaArchive = { season: id, games: Object.fromEntries(Object.entries(games).sort(([x], [y]) => x.localeCompare(y))) };
  writeFileSync(new URL(`${id}.json`, OUT), JSON.stringify(archive) + "\n");
  console.log(`${id}: ${finals} final games, ${Object.keys(games).length} with a report, ${covered} with both sides; ${reports.size} reports, ${[...reports.values()].filter((r) => r === null).length} missing; ${unmatched} names not matched to a player who played for the team`);
}
