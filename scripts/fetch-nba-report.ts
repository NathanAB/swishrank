// Saves the NBA's latest injury report onto every game still to come (docs/model-v4.md), into
// src/data/nba-reports/<season>.json for each season in progress. .github/workflows/nba-report.yml runs it every half
// hour through each game day, so a game keeps the latest report saved before its tip-off and none after.
//
//   node scripts/fetch-nba-report.ts
//
// The league publishes the report as a PDF at a fixed address for each time it was issued: on the hour until
// 2025-26, every quarter-hour since. This tries each quarter-hour back from now, in both spellings, for the latest,
// and reads it with pdftotext -layout (poppler-utils), downloading with curl. A missing or unreadable report is a
// warning and changes nothing: the next run tries again, and a game with no report keeps version 3's lineup.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dayKey, TZ, type SeasonData } from "../src/lib/elo.ts";
import { nameMatcher, parseNbaArchive, parseReportText, rosters, teamNames, withNbaReport, type NbaArchive } from "../src/lib/nba-report.ts";

const DATA = new URL("../src/data/", import.meta.url);
const OUT = new URL("nba-reports/", DATA);
const readJson = (url: URL): unknown => JSON.parse(readFileSync(url, "utf8"));
const seasons = (readJson(new URL("seasons.json", DATA)) as { id: string; end?: string }[]).filter((s) => !s.end);
const names = readJson(new URL("players.json", DATA)) as Record<string, string>;

const clock = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** The report's address for an Eastern day, hour and minute, in the spellings the league has used. */
function addresses(ms: number): string[] {
  const day = dayKey(new Date(ms).toISOString());
  const [h, m] = clock.format(new Date(ms)).split(":").map(Number);
  const quarter = m - (m % 15);
  const ap = h >= 12 ? "PM" : "AM", hh = String(h % 12 || 12).padStart(2, "0"), mm = String(quarter).padStart(2, "0");
  const base = `https://ak-static.cms.nba.com/referee/injury/Injury-Report_${day}_`;
  return [`${base}${hh}_${mm}${ap}.pdf`, ...(quarter === 0 ? [`${base}${hh}${ap}.pdf`] : [])];
}

/** The latest report's text, looking back up to four hours, or null. */
function latestReport(now: number): string | null {
  const dir = mkdtempSync(join(tmpdir(), "nba-report-"));
  try {
    const seen = new Set<string>();
    for (let back = 0; back <= 4 * 60; back += 15) {
      for (const url of addresses(now - back * 60_000)) {
        if (seen.has(url)) continue;
        seen.add(url);
        try {
          execFileSync("curl", ["-sf", "--max-time", "30", "--retry", "2", "-A", "Mozilla/5.0 (swishrank)", "-o", join(dir, "r.pdf"), url]);
        } catch {
          continue;
        }
        execFileSync("pdftotext", ["-layout", join(dir, "r.pdf"), join(dir, "r.txt")]);
        console.log(`read ${url}`);
        return readFileSync(join(dir, "r.txt"), "utf8");
      }
    }
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const now = new Date();
let text: string | null = null;
try {
  text = latestReport(now.getTime());
} catch (err) {
  console.warn(`no NBA injury report this time: ${(err as Error).message}`);
}
if (text === null) console.warn("no NBA injury report found in the last four hours");
else for (const { id } of seasons) {
  const data = readJson(new URL(`games/${id}.json`, DATA)) as SeasonData;
  const box = readJson(new URL(`box/${id}.json`, DATA)) as { games: Record<string, Record<string, number[][]>> };
  const file = new URL(`${id}.json`, OUT);
  let archive: NbaArchive;
  try {
    archive = parseNbaArchive(readJson(file), id);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    archive = { season: id, games: {} };
  }
  const report = parseReportText(text, teamNames(data));
  const matchers = new Map([...rosters(box, names)].map(([abbr, players]) => [abbr, nameMatcher(players)]));
  const { archive: next, changed } = withNbaReport(archive, data, report, (abbr, name) => matchers.get(abbr)?.(name) ?? null, now.toISOString());
  if (changed) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(file, JSON.stringify(next) + "\n");
  }
  console.log(`${id}: report published ${report.published ?? "at an unreadable time"}, ${report.entries.length} entries, ${changed} games still to come changed`);
}
