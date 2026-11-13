// node scripts/research/luck-rules.ts <out.json> <adjDir> [variants]: every final game's expected margin under version 4,
// with the fit learning from luck-adjusted final scores (<adjDir>/<adj>.json, {gameId: [home, away]}, written by
// scripts/research/luck/luck.py) instead of the real ones. Predictions are made for the real games; only the scores
// the fit reads change. Research only.
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

const adjDir = process.argv[3];
type Variant = { adj?: string; fit?: (r: FitRule) => FitRule };
const P = PARAMS.players;
// `_venue`: a diagnostic with the whole sample's mean home-minus-away luck put back, so adjusted margins keep the home edge.
const ADJ = [...["3", "3ft"].flatMap((k) => ["lg", "tm"].flatMap((b) => [50, 100].map((w) => `adj_${k}_${b}_w${w}`))), "adj_3ft_tm_w50_venue", "adj_3ft_tm_w100_venue"];
const SETTINGS: Record<string, (r: FitRule) => FitRule> = {
  q06: (r) => ({ ...r, margin: { kind: "power", q: 0.6 } }),
  n64: (r) => ({ ...r, n0: 64 }),
  d90: (r) => ({ ...r, decay: 90 }),
};
const variants: Record<string, Variant> = {
  v4: {},
  ...Object.fromEntries(ADJ.map((a) => [a, { adj: a }])),
  ...Object.fromEntries(Object.entries(SETTINGS).map(([k, f]) => [`raw_${k}`, { fit: f }])),
  ...Object.fromEntries(ADJ.flatMap((a) => Object.entries(SETTINGS).map(([k, f]) => [`${a}_${k}`, { adj: a, fit: f }]))),
};
const only = process.argv[4]?.split(",");
const out: Record<string, Record<string, number>> = {};
const rule = V4 as LineupRule;
const ratings = ratingsOf(P.halfLife);
const avail = availability(walked, reports, fallbackOf(rule.recent), rule);
for (const [name, v] of Object.entries(variants)) {
  if (only && !only.includes(name)) continue;
  const adj = v.adj ? (JSON.parse(readFileSync(`${adjDir}/${v.adj}.json`, "utf8")) as Record<string, [number, number]>) : undefined;
  const es: Record<string, number> = {};
  for (const { data, box } of walked) {
    const inp = inputs.get(data.season)!;
    const a = avail.get(data.season)!;
    const season: SeasonInputs = { centres: inp.centres, players: { box: box as SeasonBox, ratings: ratings.get(data.season)!, lineups: a.lineups, rookies: inp.players!.rookies }, extra: a.extra };
    const fr = seasonRule(inp);
    // The fit reads adjusted scores where a game has them; a game without shooting numbers keeps its real score.
    const fed: SeasonData = adj ? { ...data, games: data.games.map((g) => (g.final && adj[g.id] ? { ...g, hs: adj[g.id][0], as: adj[g.id][1] } : g)) } : data;
    for (const d of fitSeason(fed, v.fit ? v.fit(fr) : fr, season)) for (const pg of d.games) es[pg.game.id] = +expected(d.before, pg).toFixed(5);
  }
  out[name] = es;
  console.error(name);
}
writeFileSync(process.argv[2], JSON.stringify(out));
