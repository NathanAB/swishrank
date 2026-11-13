// node scripts/research/newdata/rules_extra.ts <out.json> <terms.json> [names]: version 4 unchanged except a per-game term added
// through SeasonInputs.extra (counted-margin units, home minus away), one variant per key of terms.json
// ({variant: {gameId: term}}); "v4" is always run with no term. Copied from scripts/research/rules.ts. Research only.
import { readFileSync, writeFileSync } from "node:fs";
import { expected, fitSeason, PARAMS, seasonRule, type FitRule, type SeasonData, type SeasonInputs } from "../../../src/lib/elo.ts";
import { parseArchive } from "../../../src/lib/injuries.ts";
import { modelInputs } from "../../../src/lib/inputs.ts";
import { parseNbaArchive, type NbaArchive } from "../../../src/lib/nba-report.ts";
import { boxRatings, lineups, parseBox, type SeasonBox } from "../../../src/lib/players.ts";
import { reportLineups } from "../../../src/lib/report-lineup.ts";
import { availability, topThreeStart, V4, type LineupRule } from "../../../src/lib/v4.ts";
import type { DraftFile } from "../../../src/lib/draft.ts";

const read = (path: string): unknown => {
  try { return JSON.parse(readFileSync(new URL(`../../../src/data/${path}`, import.meta.url), "utf8")); } catch { return undefined; }
};
const ALL = (read("seasons.json") as { id: string }[]).map((s) => s.id).sort();
const draft = read("draft.json") as DraftFile;
const files = ALL.map((id) => ({ data: read(`games/${id}.json`) as SeasonData, box: read(`box/${id}.json`), preseason: read(`preseason/${id}.json`), injuries: read(`injuries/${id}.json`) }));
const inputs = modelInputs(files);
const walked = files.map((f) => ({ data: f.data, box: f.box === undefined ? { season: f.data.season, games: {} } : parseBox(f.box, f.data.season) }));
const reports = new Map<string, NbaArchive>();
for (const id of ALL) { const raw = read(`nba-reports/${id}.json`); if (raw !== undefined) reports.set(id, parseNbaArchive(raw, id)); }
const espn = new Map(files.flatMap((f) => (f.injuries === undefined ? [] : [[f.data.season, parseArchive(f.injuries, f.data.season)] as const])));
const fallbackOf = (recent: number) => {
  const previous = lineups(walked, recent);
  return (season: string) => reportLineups(walked.find((w) => w.data.season === season)!.data, previous.get(season)!.previous, espn.get(season));
};
const rookies = new Map(ALL.map((id) => [id, inputs.get(id)!.players!.rookies!]));
const ratingsOf = (halfLife: number) => boxRatings(walked, halfLife, topThreeStart(walked, rookies, draft));

const P = PARAMS.players;
const terms = JSON.parse(readFileSync(process.argv[3], "utf8")) as Record<string, Record<string, number>>;
const variants: Record<string, Record<string, number>> = { v4: {}, ...terms };
const only = process.argv[4]?.split(",");
const out: Record<string, Record<string, number>> = {};
const plus = (base: Map<string, number>, term: Record<string, number>) => {
  const m = new Map(base);
  for (const [id, x] of Object.entries(term)) if (x) m.set(id, (m.get(id) ?? 0) + x);
  return m;
};
const rule = V4 as LineupRule;
const ratings = ratingsOf(P.halfLife);
const avail = availability(walked, reports, fallbackOf(rule.recent), rule);
for (const [name, term] of Object.entries(variants)) {
  if (only && !only.includes(name)) continue;
  const es: Record<string, number> = {};
  for (const { data, box } of walked) {
    const inp = inputs.get(data.season)!;
    const a = avail.get(data.season)!;
    const season: SeasonInputs = { centres: inp.centres, players: { box: box as SeasonBox, ratings: ratings.get(data.season)!, lineups: a.lineups, rookies: inp.players!.rookies }, extra: plus(a.extra, term) };
    const fr = seasonRule(inp);
    for (const d of fitSeason(data, fr, season)) for (const pg of d.games) es[pg.game.id] = +expected(d.before, pg).toFixed(5);
  }
  out[name] = es;
  console.error(name);
}
writeFileSync(process.argv[2], JSON.stringify(out));
