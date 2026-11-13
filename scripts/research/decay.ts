// node scripts/research/rules.ts <out.json>: every final game's expected margin under variants of version 4's lineup
// rule and fit settings, for scoring against Vegas (scripts/research/). Research only.
import { readFileSync, writeFileSync } from "node:fs";
import { expected, fitSeason, PARAMS, seasonRule, type FitRule, type SeasonData, type SeasonInputs } from "./elo-decay.ts";
import { parseArchive } from "../../src/lib/injuries.ts";
import { modelInputs } from "../../src/lib/inputs.ts";
import { parseNbaArchive, type NbaArchive } from "../../src/lib/nba-report.ts";
import { boxRatings, lineups, parseBox, type SeasonBox } from "../../src/lib/players.ts";
import { reportLineups } from "../../src/lib/report-lineup.ts";
import { availability, topThreeStart, V4, type LineupRule } from "../../src/lib/v4.ts";
import type { DraftFile } from "../../src/lib/draft.ts";

const read = (path: string): unknown => {
  try { return JSON.parse(readFileSync(new URL(`../../src/data/${path}`, import.meta.url), "utf8")); } catch { return undefined; }
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

type Variant = { rule?: Partial<LineupRule>; fit?: (r: FitRule) => FitRule; halfLife?: number };
const P = PARAMS.players;
const variants: Record<string, Variant> = {
  v4: {},
  ...Object.fromEntries([30, 45, 60, 90, 150].flatMap((h) => [96, 48, 24].map((n0) => [`decay${h}_n${n0}`, { fit: (r: FitRule) => ({ ...r, decay: h, n0 }) }]))),
  decay60_n48_np160: { fit: (r) => ({ ...r, decay: 60, n0: 48, players: { ...P, np: 160 } }) },
  decay60_n48_fade60: { fit: (r) => ({ ...r, decay: 60, n0: 48, seed: { ...r.seed!, fade: 60 } }) },
};
const only = process.argv[3]?.split(",");
const out: Record<string, Record<string, number>> = {};
const ratingsCache = new Map<number, ReturnType<typeof ratingsOf>>();
for (const [name, v] of Object.entries(variants)) {
  if (only && !only.includes(name)) continue;
  const rule = { ...V4, ...v.rule } as LineupRule;
  const hl = v.halfLife ?? P.halfLife;
  if (!ratingsCache.has(hl)) ratingsCache.set(hl, ratingsOf(hl));
  const ratings = ratingsCache.get(hl)!;
  const avail = availability(walked, reports, fallbackOf(rule.recent), rule);
  const es: Record<string, number> = {};
  for (const { data, box } of walked) {
    const inp = inputs.get(data.season)!;
    const a = avail.get(data.season)!;
    const season: SeasonInputs = { centres: inp.centres, players: { box: box as SeasonBox, ratings: ratings.get(data.season)!, lineups: a.lineups, rookies: inp.players!.rookies }, extra: a.extra };
    const fr = seasonRule(inp);
    for (const d of fitSeason(data, v.fit ? v.fit(fr) : fr, season)) for (const pg of d.games) es[pg.game.id] = +expected(d.before, pg).toFixed(5);
  }
  out[name] = es;
  console.error(name);
}
writeFileSync(process.argv[2], JSON.stringify(out));
