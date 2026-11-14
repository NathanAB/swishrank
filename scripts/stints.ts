// Rebuild the play-by-play record (src/lib/stints.ts) of every final game of a season into scripts/stints/<season>.json
// from ESPN's game summaries, and print one row a season of how it went: final games, games with a record, over the
// recorded games whose box score has minutes the share where every player's rebuilt minutes are within two of his
// box-score MIN, over those whose box score has threes the share where both sides' three-point attempts and makes
// equal its totals, and the games without a record by reason. The morning refresh (scripts/fetch-season.mjs) adds
// new games; this rebuilds a past season.
//
//   node scripts/stints.ts                       every season in src/data/seasons.json
//   node scripts/stints.ts 2017-18 2018-19       those seasons
//   node scripts/stints.ts --cache <dir>         read each summary from <dir>/<season>/<gameId>.json.gz, and keep
//                                                there, cut to what EspnSummary declares, any it has to fetch
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import type { SeasonData } from "../src/lib/elo.ts";
import { fetchJson, summaryUrl, type EspnSummary } from "../src/lib/espn.ts";
import { boxThrees, formatStints, minutesGap, parseStints, stints, threes, type SeasonStints } from "../src/lib/stints.ts";

const ROOT = new URL("../", import.meta.url);
const OUT_DIR = new URL("scripts/stints/", ROOT);

/** The summary cut to the fields EspnSummary declares, so a cached game is a few kilobytes. */
const trim = (d: EspnSummary): EspnSummary => ({
  header: { competitions: [{ competitors: (d.header?.competitions?.[0]?.competitors ?? []).map((c) => ({ homeAway: c.homeAway, score: c.score, team: { id: c.team?.id } })) }] },
  boxscore: {
    players: (d.boxscore?.players ?? []).map((p) => ({
      team: { id: p.team.id, abbreviation: p.team.abbreviation },
      statistics: (p.statistics ?? []).map((s) => ({
        labels: s.labels,
        athletes: (s.athletes ?? []).map((a) => ({ athlete: { id: a.athlete?.id, displayName: a.athlete?.displayName }, starter: a.starter, didNotPlay: a.didNotPlay, stats: a.stats })),
      })),
    })),
  },
  plays: (d.plays ?? []).map((p) => ({
    period: { number: p.period?.number },
    clock: { displayValue: p.clock?.displayValue },
    type: { text: p.type?.text },
    text: p.text,
    participants: p.participants?.map((x) => ({ athlete: x.athlete && { id: x.athlete.id } })),
    team: { id: p.team?.id },
    shootingPlay: p.shootingPlay,
    scoringPlay: p.scoringPlay,
    pointsAttempted: p.pointsAttempted,
    scoreValue: p.scoreValue,
    homeScore: p.homeScore,
    awayScore: p.awayScore,
  })),
});

async function summaryOf(season: string, id: string, cache: string | undefined): Promise<EspnSummary> {
  const file = cache && `${cache}/${season}/${id}.json.gz`;
  if (file) {
    const cached = await readFile(file).then((buf) => JSON.parse(gunzipSync(buf).toString()) as EspnSummary, () => null);
    if (cached) return cached;
  }
  const summary = (await fetchJson(summaryUrl(id))) as EspnSummary;
  if (file) {
    await mkdir(`${cache}/${season}`, { recursive: true });
    await writeFile(`${file}.tmp`, gzipSync(JSON.stringify(trim(summary))));
    await rename(`${file}.tmp`, file);
  }
  return summary;
}

async function rebuild(season: string, cache: string | undefined): Promise<string> {
  const finals = (JSON.parse(await readFile(new URL(`src/data/games/${season}.json`, ROOT), "utf8")) as SeasonData).games.filter((g) => g.final);
  const file = new URL(`${season}.json`, OUT_DIR);
  const before = await readFile(file, "utf8").then((text) => parseStints(JSON.parse(text), season), (err) => {
    if (err.code === "ENOENT") return { season, games: {} };
    throw err;
  });
  const record: SeasonStints = { season, games: {} };
  const without: Record<string, number> = {};
  let checked = 0, within = 0, noMinutes = 0, withThrees = 0, sameThrees = 0;
  for (let i = 0; i < finals.length; i += 8) {
    await Promise.all(finals.slice(i, i + 8).map(async (g) => {
      let summary: EspnSummary;
      try {
        summary = await summaryOf(season, g.id, cache);
      } catch (err) {
        // A summary ESPN fails to send this time keeps the game's record on file.
        if (before.games[g.id]) record.games[g.id] = before.games[g.id];
        else without["no summary from ESPN"] = (without["no summary from ESPN"] ?? 0) + 1;
        return console.warn(`${season}: no summary for game ${g.id}: ${(err as Error).message}`);
      }
      try {
        const game = stints(summary);
        record.games[g.id] = game;
        const gap = minutesGap(game, summary);
        if (gap === null) noMinutes++;
        else {
          checked++;
          if (gap <= 2) within++;
        }
        const box = boxThrees(summary);
        if (box) {
          withThrees++;
          if (threes(game).every((n, i) => n === box[i])) sameThrees++;
        }
      } catch (err) {
        const reason = (err as Error).message;
        without[reason] = (without[reason] ?? 0) + 1;
      }
    }));
  }
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(file, formatStints(record, finals.map((g) => g.id)));
  const reasons = Object.entries(without).map(([reason, n]) => `${n} ${reason}`).join("; ") || "none";
  const recorded = Object.keys(record.games).length;
  const share = (n: number, of: number) => `${(n / Math.max(1, of) * 100).toFixed(1).padStart(5)}%`;
  return `${season}  ${String(finals.length).padStart(5)}  ${String(recorded).padStart(5)}  ${share(within, checked)} of ${String(checked).padStart(4)}  ${String(noMinutes).padStart(10)}  ${share(sameThrees, withThrees)} of ${String(withThrees).padStart(4)}  ${reasons}`;
}

const args = process.argv.slice(2);
const at = args.indexOf("--cache");
const cache = at < 0 ? undefined : args.splice(at, 2)[1];
if (at >= 0 && !cache) throw new Error("--cache needs a directory");
const all = (JSON.parse(await readFile(new URL("src/data/seasons.json", ROOT), "utf8")) as { id: string }[]).map((s) => s.id);
const unknown = args.filter((s) => !all.includes(s));
if (unknown.length) throw new Error(`Unknown season ${unknown.join(", ")}`);
console.log("season   finals  record  within 2 min     no minutes  threes as box    without a record, by reason");
for (const season of args.length ? args : all) console.log(await rebuild(season, cache));
