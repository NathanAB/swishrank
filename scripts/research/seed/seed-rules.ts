// Research only (scripts/research/seed/). Version 4 with its team seed, first-game lineups and seed pull swapped per variant.
//   node scripts/research/seed/seed-rules.ts dump <out.json> [apm.json]
//     per season: abbrs, first day, each team's first game id, the v4 box ratings at the season's start and after its last
//     day (athletes order), rookies, the win-total centres (baseline only) and the final team parts of the v4 fit
//     (and, with apm.json, of the resid_plus_b0.12 fit).
//   node scripts/research/seed/seed-rules.ts run <spec.json> <out.json> [apm.json] [variant,...]
//     every final game's expected margin per variant, {variant: {gameId: e}}, as scripts/research/rules.ts writes.
// spec.json: {variants: {name: Variant}}; see the Variant type. Everything not named is version 4 as rules.ts runs it.
import { readFileSync, writeFileSync } from "node:fs";
import { expected, finalDays, fitSeason, PARAMS, seasonRule, type FitRule, type SeasonData, type SeasonInputs } from "./seed-elo.ts";
import { parseArchive } from "../../../src/lib/injuries.ts";
import { modelInputs } from "../../../src/lib/inputs.ts";
import { parseNbaArchive, type NbaArchive } from "../../../src/lib/nba-report.ts";
import { boxRatings, lineups, parseBox, type BoxRatings, type Lineup, type SeasonBox, type Sides } from "../../../src/lib/players.ts";
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
const rule = V4 as LineupRule;
const previous = lineups(walked, rule.recent);
const fallback = (season: string) => reportLineups(walked.find((w) => w.data.season === season)!.data, previous.get(season)!.previous, espn.get(season));
const avail = availability(walked, reports, fallback, rule);
const r4 = (x: number) => Math.round(x * 10000) / 10000;

type Apm = { athletes: number[]; start: number[]; after: Record<string, number[]> };
const apmFile = process.argv[2] === "dump" ? process.argv[4] : process.argv[5];
const apm = apmFile ? (JSON.parse(readFileSync(apmFile, "utf8")) as { kinds: Record<string, Record<string, Apm>> }) : null;
/** rating = box + (b / a) * apm[kind], as scripts/research/pbp/apm-rules.ts mixes it. */
const mixed = (season: string, kind: string | undefined, b: number): BoxRatings => {
  const bx = box.get(season)!;
  if (!kind || !apm) return bx;
  const k = apm.kinds[kind][season];
  const w = b / P.a;
  const pos = new Map(k.athletes.map((a, j) => [a, j]));
  const mix = (bv: Float64Array, av: number[]) => Float64Array.from(bx.athletes, (a, j) => bv[j] + w * (pos.has(a) ? av[pos.get(a)!] : 0));
  return { athletes: bx.athletes, start: mix(bx.start, k.start), after: new Map([...bx.after].map(([d, v]) => [d, mix(v, k.after[d])])) };
};

/** One team's pull: base (the calendar fade) or n0 exp(-games / fade), times a per-season, per-team multiplier. */
type Strength = { kind: "games"; n0: number; fade: number } | { kind: "days"; n0: number; fade: number };
type Variant = {
  /** Team prior centres by season and team; a season left out keeps the win-total centres. */
  centres?: Record<string, Record<string, number>>;
  /** Each team's first-game lineup by season, [athlete, share of 48] pairs. */
  first?: Record<string, Record<string, [number, number][]>>;
  apm?: { kind: string; b: number };
  strength?: Strength;
  /** Multiplies each team's pull, by season and team. */
  mult?: Record<string, Record<string, number>>;
  /** Multiplier fades with games played: mult^(exp(-played / multFade)). */
  multFade?: number;
};

const firstGames = (data: SeasonData) => {
  const out = new Map<string, string>();
  for (const { games } of finalDays(data)) for (const g of games) for (const a of [g.home, g.away]) if (!out.has(a)) out.set(a, g.id);
  return out;
};

function runSeason(data: SeasonData, sb: SeasonBox, v: Variant) {
  const inp = inputs.get(data.season)!;
  const av = avail.get(data.season)!;
  let lineupsBy: ReadonlyMap<string, Sides<Lineup>> = av.lineups;
  const first = v.first?.[data.season];
  if (first) {
    const m = new Map(av.lineups);
    for (const [abbr, id] of firstGames(data)) {
      const l = first[abbr];
      if (!l) continue;
      const g = data.games.find((x) => x.id === id)!;
      const cur = m.get(id) ?? { home: [], away: [] };
      const lu = l.map(([athlete, share]) => ({ athlete, share }));
      m.set(id, g.home === abbr ? { ...cur, home: lu } : { ...cur, away: lu });
    }
    lineupsBy = m;
  }
  const centres = v.centres?.[data.season] ?? inp.centres;
  const season: SeasonInputs = { centres, players: { box: sb, ratings: mixed(data.season, v.apm?.kind, v.apm?.b ?? 0), lineups: lineupsBy, rookies: inp.players!.rookies }, extra: av.extra };
  let fr: FitRule = seasonRule(inp);
  const st = v.strength, mult = v.mult?.[data.season];
  if (st || mult) {
    fr = {
      ...fr,
      strengthOf: (abbr, days, played, base) => {
        let s = !st ? base : st.kind === "games" ? st.n0 * Math.exp(-played / st.fade) : st.n0 * Math.exp(-days / st.fade);
        if (mult && mult[abbr] !== undefined) s *= v.multFade ? mult[abbr] ** Math.exp(-played / v.multFade) : mult[abbr];
        return s;
      },
    };
  }
  return fitSeason(data, fr, season);
}

if (process.argv[2] === "dump") {
  const out: Record<string, unknown> = {};
  for (const { data, box: sb } of walked) {
    const b = box.get(data.season)!;
    const days = finalDays(data);
    const last = days.at(-1)?.day;
    const parts = (v: Variant) => runSeason(data, sb, v).at(-1)?.after.r ?? {};
    out[data.season] = {
      abbrs: Object.keys(data.teams), firstDay: days[0]?.day, lastDay: last,
      firstGames: Object.fromEntries(firstGames(data)),
      athletes: b.athletes, start: [...b.start].map(r4), end: last ? [...b.after.get(last)!].map(r4) : [],
      rookies: [...rookies.get(data.season)!],
      winCentres: inputs.get(data.season)!.centres,
      teamParts: Object.fromEntries(Object.entries(parts({})).map(([k, x]) => [k, r4(x)])),
      teamPartsApm: apm ? Object.fromEntries(Object.entries(parts({ apm: { kind: "resid", b: 0.12 } })).map(([k, x]) => [k, r4(x)])) : undefined,
    };
    console.error(data.season);
  }
  writeFileSync(process.argv[3], JSON.stringify(out));
  process.exit(0);
}

const spec = JSON.parse(readFileSync(process.argv[3], "utf8")) as { variants: Record<string, Variant> };
const only = process.argv[6]?.split(",");
const out: Record<string, Record<string, number>> = {};
for (const [name, v] of Object.entries(spec.variants)) {
  if (only && !only.includes(name)) continue;
  const es: Record<string, number> = {};
  for (const { data, box: sb } of walked) for (const d of runSeason(data, sb, v)) for (const pg of d.games) es[pg.game.id] = +expected(d.before, pg).toFixed(5);
  out[name] = es;
  console.error(name);
}
writeFileSync(process.argv[4], JSON.stringify(out));
