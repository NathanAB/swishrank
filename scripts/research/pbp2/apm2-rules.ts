// Research only. Copy of scripts/research/pbp/apm-rules.ts's `run` with each variant described in a spec file:
//   node scripts/research/pbp2/apm2-rules.ts <spec.json> <out.json>
// spec: {name: {apm?: path, b?: number, a?: number, np?: number, rookieNp?: number, margins?: path}}. The fit's player
// centre is a * box + b * apm.resid (apm2.py), a and np replace version 4's player settings, and `margins`
// ({gameId: [homePts, awayPts]} to take out) changes the final scores the fit sees, never the scored results.
// Writes {name: {gameId: expected home margin}} for score2.py. Everything else is the site's version 4, untouched.
import { readFileSync, writeFileSync } from "node:fs";
import { expected, fitSeason, PARAMS, seasonRule, type SeasonData, type SeasonInputs } from "../../../src/lib/elo.ts";
import { parseArchive } from "../../../src/lib/injuries.ts";
import { modelInputs } from "../../../src/lib/inputs.ts";
import { parseNbaArchive, type NbaArchive } from "../../../src/lib/nba-report.ts";
import { boxRatings, lineups, parseBox, type BoxRatings, type SeasonBox } from "../../../src/lib/players.ts";
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
const rookies = new Map(ALL.map((id) => [id, inputs.get(id)!.players!.rookies!]));
const P = PARAMS.players;
const box = boxRatings(walked, P.halfLife, topThreeStart(walked, rookies, draft));

type Apm = { athletes: number[]; start: number[]; after: Record<string, number[]> };
type Variant = { apm?: string; b?: number; a?: number; np?: number; rookieNp?: number; margins?: string };
const spec = JSON.parse(readFileSync(process.argv[2], "utf8")) as Record<string, Variant>;
const apms = new Map<string, Record<string, Apm>>();
const apmOf = (path: string) => {
  if (!apms.has(path)) apms.set(path, (JSON.parse(readFileSync(path, "utf8")) as { kinds: Record<string, Record<string, Apm>> }).kinds.resid);
  return apms.get(path)!;
};
const rule = V4 as LineupRule;
const previous = lineups(walked, rule.recent);
const fallback = (season: string) => reportLineups(walked.find((w) => w.data.season === season)!.data, previous.get(season)!.previous, espn.get(season));
const avail = availability(walked, reports, fallback, rule);

/** rating = box + wApm * apm, per athlete and day; a missing apm counts 0. */
const mixed = (season: string, apm: Record<string, Apm> | null, wApm: number): BoxRatings => {
  const b = box.get(season)!;
  if (!apm || !wApm) return b;
  const k = apm[season];
  const pos = new Map(k.athletes.map((a, j) => [a, j]));
  const mix = (bv: Float64Array, av: number[]) => Float64Array.from(b.athletes, (a, j) => bv[j] + wApm * (pos.has(a) ? av[pos.get(a)!] : 0));
  return { athletes: b.athletes, start: mix(b.start, k.start), after: new Map([...b.after].map(([d, v]) => [d, mix(v, k.after[d])])) };
};

const out: Record<string, Record<string, number>> = {};
for (const [name, v] of Object.entries(spec)) {
  const a = v.a ?? P.a;
  const apm = v.apm ? apmOf(v.apm) : null;
  const take = v.margins ? (JSON.parse(readFileSync(v.margins, "utf8")) as Record<string, [number, number]>) : null;
  const es: Record<string, number> = {};
  for (const { data, box: sb } of walked) {
    const inp = inputs.get(data.season)!;
    const av = avail.get(data.season)!;
    const base = seasonRule(inp);
    const fr = { ...base, players: { ...base.players!, a, np: v.np ?? P.np, rookieNp: v.rookieNp ?? P.rookieNp } };
    const fitData: SeasonData = take ? { ...data, games: data.games.map((g) => (take[g.id] && g.hs !== null && g.as !== null ? { ...g, hs: g.hs - take[g.id][0], as: g.as - take[g.id][1] } : g)) } : data;
    const season: SeasonInputs = { centres: inp.centres, players: { box: sb as SeasonBox, ratings: mixed(data.season, apm, (v.b ?? 0) / a), lineups: av.lineups, rookies: inp.players!.rookies }, extra: av.extra };
    for (const d of fitSeason(fitData, fr, season)) for (const pg of d.games) es[pg.game.id] = +expected(d.before, pg).toFixed(5);
  }
  out[name] = es;
  console.error(name);
}
writeFileSync(process.argv[3], JSON.stringify(out));
