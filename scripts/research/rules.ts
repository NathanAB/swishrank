// node scripts/research/rules.ts <out.json>: every final game's expected margin under variants of version 4's lineup
// rule and fit settings, for scoring against Vegas (scripts/research/). Research only.
import { readFileSync, writeFileSync } from "node:fs";
import { expected, fitSeason, PARAMS, seasonRule, type FitRule, type SeasonData, type SeasonInputs } from "../../src/lib/elo.ts";
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
  site_unlisted25: { rule: { unlisted: 25 } },
  unlisted20: { rule: { unlisted: 20 } },
  unlisted15: { rule: { unlisted: 15 } },
  fill45: { rule: { fill: -0.45 } },
  fill60: { rule: { fill: -0.6 } },
  recent3: { rule: { recent: 3 } },
  recent8: { rule: { recent: 8 } },
  quest35: { rule: { questionable: 0.35 } },
  quest65: { rule: { questionable: 0.65 } },
  a10: { fit: (r) => ({ ...r, players: { ...P, a: 0.1 } }) },
  a065: { fit: (r) => ({ ...r, players: { ...P, a: 0.065 } }) },
  np160: { fit: (r) => ({ ...r, players: { ...P, np: 160 } }) },
  np640: { fit: (r) => ({ ...r, players: { ...P, np: 640 } }) },
  n0_64: { fit: (r) => ({ ...r, n0: 64 }) },
  n0_144: { fit: (r) => ({ ...r, n0: 144 }) },
  fade80: { fit: (r) => ({ ...r, seed: { ...r.seed!, fade: 80 } }) },
  fade200: { fit: (r) => ({ ...r, seed: { ...r.seed!, fade: 200 } }) },
  b2b55: { fit: (r) => ({ ...r, b2b: 0.55 }) },
  q06: { fit: (r) => ({ ...r, margin: { kind: "power", q: 0.6 } }) },
  q04: { fit: (r) => ({ ...r, margin: { kind: "power", q: 0.4 } }) },
  hl180: { halfLife: 180 },
  hl730: { halfLife: 730 },
  joint: { fit: (r) => ({ ...r, margin: { kind: "power", q: 0.5 } }) },
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
