// Research only. Version 4 with the player prior centre built from adjusted plus-minus (scripts/research/pbp/).
//   node scripts/research/pbp/apm-rules.ts dump <box.json>
//     each season's box ratings (the site's, half-life 365) on every final day, for apm.py's prior and residuals.
//   node scripts/research/pbp/apm-rules.ts run <apm.json> <out.json> [variant,...]
//     every final game's expected margin per variant, {variant: {gameId: e}}, as scripts/research/rules.ts writes.
// apm.json: {kinds: {kind: {season: {athletes: [...], start: [...], after: {day: [...]}}}}}, ratings in points per
// 100 possessions, on the box ratings' athletes and days, each day's value using stints from that day or earlier.
// A variant hands the fit `rating = box + (b / a) * apm[kind]` (or `(c / a) * apm[kind]` with the box dropped), so the
// fit's centre a * rating is a * box + b * apm. Everything else is the site's version 4, untouched.
import { readFileSync, writeFileSync } from "node:fs";
import { expected, finalDays, fitSeason, PARAMS, seasonRule, type SeasonData, type SeasonInputs } from "../../../src/lib/elo.ts";
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
const r3 = (x: number) => Math.round(x * 1000) / 1000;

if (process.argv[2] === "dump") {
  const out: Record<string, unknown> = {};
  for (const { data } of walked) {
    const b = box.get(data.season)!;
    out[data.season] = { athletes: b.athletes, start: [...b.start].map(r3), days: finalDays(data).map((d) => d.day), games: Object.fromEntries(finalDays(data).flatMap((d) => d.games.map((g) => [g.id, d.day]))), after: Object.fromEntries([...b.after].map(([d, v]) => [d, [...v].map(r3)])) };
  }
  writeFileSync(process.argv[3], JSON.stringify(out));
  process.exit(0);
}

type Apm = { athletes: number[]; start: number[]; after: Record<string, number[]> };
const apm = JSON.parse(readFileSync(process.argv[3], "utf8")) as { kinds: Record<string, Record<string, Apm>> };
const rule = V4 as LineupRule;
const previous = lineups(walked, rule.recent);
const fallback = (season: string) => reportLineups(walked.find((w) => w.data.season === season)!.data, previous.get(season)!.previous, espn.get(season));
const avail = availability(walked, reports, fallback, rule);

/** rating = wBox * box + wApm * apm, per athlete and day; a missing apm counts 0 (the ridge's centre). */
const mixed = (season: string, kind: string | null, wBox: number, wApm: number): BoxRatings => {
  const b = box.get(season)!;
  if (!kind) return b;
  const k = apm.kinds[kind][season];
  const pos = new Map(k.athletes.map((a, j) => [a, j]));
  const mix = (bv: Float64Array, av: number[]) => Float64Array.from(b.athletes, (a, j) => wBox * bv[j] + wApm * (pos.has(a) ? av[pos.get(a)!] : 0));
  return { athletes: b.athletes, start: mix(b.start, k.start), after: new Map([...b.after].map(([d, v]) => [d, mix(v, k.after[d])])) };
};

type Variant = { kind: string | null; wBox: number; wApm: number };
const variants: Record<string, Variant> = { v4: { kind: null, wBox: 1, wApm: 0 } };
const a = P.a;
for (const kind of Object.keys(apm.kinds)) {
  for (const c of [0.05, 0.1, 0.15, 0.2]) variants[`${kind}_only_c${c}`] = { kind, wBox: 0, wApm: c / a };
  for (const bb of [0.02, 0.04, 0.08, 0.12, 0.16]) variants[`${kind}_plus_b${bb}`] = { kind, wBox: 1, wApm: bb / a };
}
const only = process.argv[5]?.split(",");
const out: Record<string, Record<string, number>> = {};
for (const [name, v] of Object.entries(variants)) {
  if (only && !only.some((o) => name === o || (o.endsWith("*") && name.startsWith(o.slice(0, -1))))) continue;
  const es: Record<string, number> = {};
  for (const { data, box: sb } of walked) {
    const inp = inputs.get(data.season)!;
    const av = avail.get(data.season)!;
    const season: SeasonInputs = { centres: inp.centres, players: { box: sb as SeasonBox, ratings: mixed(data.season, v.kind, v.wBox, v.wApm), lineups: av.lineups, rookies: inp.players!.rookies }, extra: av.extra };
    for (const d of fitSeason(data, seasonRule(inp), season)) for (const pg of d.games) es[pg.game.id] = +expected(d.before, pg).toFixed(5);
  }
  out[name] = es;
  console.error(name);
}
writeFileSync(process.argv[4], JSON.stringify(out));
