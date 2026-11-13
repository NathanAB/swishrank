// Research only. Version 4 with stints as the fit's own observations (idea 9, a rough version): fitSeason() and
// playerSolver() copied from src/lib/elo.ts, with each game that has stints (stints2.py or pbp/stints.py) entering
// the least squares as one row per stint and side instead of one row per side: the side's team column and its five on
// the floor at f = secs / 2880 each, weight 1 / f, target f / F * Y + kappa * slope * (m_s - f / F * M), where Y is the
// game's counted margin (less back-to-back and home edge), M its raw margin, m_s the stint's margin, F the game's sum
// of f, and slope = d counted / d margin at M. kappa 0 splits the game's target by time only; kappa 1 lets the swing
// inside a game, priced at the counted margin's local slope, move the players on the floor. Sides held as v4 does.
//   node scripts/research/pbp2/stintfit.ts <stintsDir> <spec.json> <out.json>
// spec: {name: {kappa: number, np?: number, a?: number}}; {} as a spec entry is version 4 itself.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { counted, dayKey, expected, finalDays, PARAMS, pregameOf, secondNights, seasonRule, type Abbr, type Fit, type FinalGame, type FitRule, type Pregame, type SeasonData, type SeasonInputs } from "../../../src/lib/elo.ts";
import { parseArchive } from "../../../src/lib/injuries.ts";
import { modelInputs } from "../../../src/lib/inputs.ts";
import { parseNbaArchive, type NbaArchive } from "../../../src/lib/nba-report.ts";
import { boxRatings, lineups, parseBox, type Athlete, type SeasonBox } from "../../../src/lib/players.ts";
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

type Stint = [string[], string[], number, number, number, ...unknown[]];
const [sdir, specPath, outPath] = process.argv.slice(2);
const stints = new Map<string, Stint[]>();
for (const id of ALL) {
  const p = `${sdir}/${id}.json`;
  if (!existsSync(p)) continue;
  for (const [gid, g] of Object.entries(JSON.parse(readFileSync(p, "utf8")) as Record<string, { stints: Stint[] }>)) stints.set(gid, g.stints);
}

type Players = NonNullable<SeasonInputs["players"]>;
type Free = { teams: ReadonlySet<Abbr>; players: ReadonlySet<Athlete> };
function dayFree(games: readonly FinalGame[], sb: SeasonBox | undefined): Free {
  const teams = new Set<Abbr>(), players = new Set<Athlete>();
  for (const g of games) {
    teams.add(g.home); teams.add(g.away);
    for (const lines of Object.values(sb?.games[g.id] ?? {})) for (const l of lines ?? []) players.add(l[0]);
  }
  return { teams, players };
}

function fitSeason(data: SeasonData, fr: FitRule, inp: SeasonInputs, kappa: number | null) {
  const abbrs = Object.keys(data.teams);
  const players = { rule: fr.players!, ...inp.players! };
  const second = secondNights(data);
  const days = finalDays(data);
  const first = days.length ? Date.parse(days[0].day) : 0;
  const strength = (day: string) => fr.n0 * Math.exp(-Math.round((Date.parse(day) - first) / 86_400_000) / fr.seed!.fade);
  const pregame = pregameOf(fr, second, inp);
  const solver = playerSolver(abbrs, fr, inp.centres, players, kappa);
  let fit = solver.start;
  const out: { day: string; games: Pregame[]; before: Fit }[] = [];
  for (const { day, games } of days) {
    const pre = games.map(pregame);
    for (const p of pre) solver.add(p);
    const before = fit;
    fit = solver.fit(day, strength(day), dayFree(games, players.box));
    out.push({ day, games: pre, before });
  }
  return out;
}

function playerSolver(abbrs: Abbr[], fr: FitRule, centres: Record<Abbr, number> | undefined, players: Players & { rule: NonNullable<FitRule["players"]> }, kappa: number | null) {
  const n = abbrs.length;
  const home = fr.home as { kind: "fixed"; value: number };
  const p0 = n;
  const { athletes } = players.ratings;
  const dim = p0 + athletes.length;
  const col = new Map<string | Athlete, number>([...abbrs.map((a, i) => [a, i] as const), ...athletes.map((a, j) => [a, p0 + j] as const)]);
  const centre = new Float64Array(dim);
  const { rookieNp } = players.rule;
  const hold = Float64Array.from(athletes, (a) => (rookieNp !== undefined && players.rookies?.has(a) ? rookieNp : players.rule.np));
  const setPlayerCentres = (rating: Float64Array) => { for (let j = 0; j < athletes.length; j++) centre[p0 + j] = players.rule.a * rating[j]; };
  abbrs.forEach((a, i) => (centre[i] = centres?.[a] ?? 0));
  setPlayerCentres(players.ratings.start);
  const x = centre.slice();
  // The normal matrix itself, sparse (pairs of columns that ever share a row), instead of the rows: stints make many.
  const XX = new Map<number, number>();
  let dirty = true, ei = new Int32Array(0), ej = new Int32Array(0), ev = new Float64Array(0);
  const D = new Float64Array(dim), diag = new Float64Array(dim), xty = new Float64Array(dim);
  const A = new Float64Array(dim), r = new Float64Array(dim), z = new Float64Array(dim), q = new Float64Array(dim), b = new Float64Array(dim);
  const on = new Uint8Array(dim).fill(1);
  const matvec = (v: Float64Array, o: Float64Array) => {
    if (dirty) {
      ei = new Int32Array(XX.size); ej = new Int32Array(XX.size); ev = new Float64Array(XX.size);
      let k = 0;
      for (const [key, w] of XX) { ei[k] = Math.floor(key / dim); ej[k] = key % dim; ev[k] = w; k++; }
      dirty = false;
    }
    for (let i = 0; i < dim; i++) o[i] = D[i] * v[i];
    for (let k = 0; k < ev.length; k++) { const i = ei[k], j = ej[k]; o[i] += ev[k] * v[j]; if (i !== j) o[j] += ev[k] * v[i]; }
  };
  const snapshot = (): Fit => ({ r: Object.fromEntries(abbrs.map((a, i) => [a, x[i]])), home: home.value, v: new Map(athletes.map((a, j) => [a, x[p0 + j]])) });
  const push = (row: Map<number, number>, y: number, w = 1) => {
    const e = [...row];
    for (const [c, v] of e) { diag[c] += v * v * w; xty[c] += v * w * y; }
    for (const [c1, v1] of e) for (const [c2, v2] of e) if (c1 <= c2) { const key = c1 * dim + c2; XX.set(key, (XX.get(key) ?? 0) + v1 * v2 * w); }
    dirty = true;
  };
  let opened = "", dayStart = x.slice();
  return {
    start: snapshot(),
    add({ game: g, b2b }: Pregame) {
      const was = dayKey(g.t) === opened ? dayStart : x;
      const part = (row: Map<number, number>) => { let s = 0; for (const [c, v] of row) s += v * was[c]; return s; };
      const M = g.hs - g.as;
      const Y = counted(M, fr.margin) - b2b - (g.neutral ? 0 : home.value);
      const st = kappa === null ? undefined : stints.get(g.id);
      if (st && st.length) {
        const F = st.reduce((s, x) => s + x[2], 0) / 2880;
        const slope = 0.5 / Math.sqrt(Math.abs(M) + 3);
        for (const s of st) {
          const f = s[2] / 2880;
          if (f <= 0) continue;
          const y = (f / F) * Y + kappa * slope * (s[3] - s[4] - (f / F) * M);
          const [hr, ar] = ([[g.home, 1, s[0]], [g.away, -1, s[1]]] as const).map(([abbr, sign, five]) => {
            const row = new Map<number, number>([[col.get(abbr)!, sign * f]]);
            for (const a of five) { const c = col.get(Number(a)); if (c !== undefined) row.set(c, sign * f); }
            return row;
          });
          push(hr, y - part(ar), 1 / f);
          push(ar, y - part(hr), 1 / f);
        }
        return;
      }
      const sides = players.box.games[g.id] ?? {};
      const [homeRow, awayRow] = ([[g.home, 1], [g.away, -1]] as const).map(([abbr, sign]) => {
        const row = new Map<number, number>([[col.get(abbr)!, sign]]);
        for (const l of sides[abbr] ?? []) { const c = col.get(l[0])!; row.set(c, (row.get(c) ?? 0) + (sign * l[1]) / 48); }
        return row;
      });
      push(homeRow, Y - part(awayRow));
      push(awayRow, Y - part(homeRow));
    },
    fit(day: string, strength: number, free: Free) {
      if (day !== opened) { opened = day; dayStart = x.slice(); }
      setPlayerCentres(players.ratings.after.get(day)!);
      for (let k = 0; k < dim; k++) {
        D[k] = k < n ? strength : hold[k - p0];
        b[k] = xty[k] + D[k] * centre[k];
      }
      for (let k = 0; k < dim; k++) on[k] = k < n ? Number(free.teams.has(abbrs[k])) : Number(free.players.has(athletes[k - p0]));
      matvec(x, A);
      let rz = 0, bb = 0;
      for (let k = 0; k < dim; k++) { r[k] = on[k] ? b[k] - A[k] : 0; z[k] = r[k] / (diag[k] + D[k]); q[k] = z[k]; rz += r[k] * z[k]; if (on[k]) bb += b[k] * b[k]; }
      for (let it = 0; it < 2000; it++) {
        let rr = 0;
        for (let k = 0; k < dim; k++) rr += r[k] * r[k];
        if (rr <= 1e-24 * bb) break;
        matvec(q, A);
        let qa = 0;
        for (let k = 0; k < dim; k++) qa += q[k] * A[k];
        const alpha = rz / qa;
        let rz2 = 0;
        for (let k = 0; k < dim; k++) { x[k] += alpha * q[k]; r[k] = on[k] ? r[k] - alpha * A[k] : 0; z[k] = r[k] / (diag[k] + D[k]); rz2 += r[k] * z[k]; }
        const beta = rz2 / rz;
        rz = rz2;
        for (let k = 0; k < dim; k++) q[k] = z[k] + beta * q[k];
      }
      return snapshot();
    },
  };
}

const spec = JSON.parse(readFileSync(specPath, "utf8")) as Record<string, { kappa?: number; np?: number; a?: number; off?: boolean }>;
const out: Record<string, Record<string, number>> = {};
for (const [name, v] of Object.entries(spec)) {
  const es: Record<string, number> = {};
  for (const { data, box: sb } of walked) {
    const inp = inputs.get(data.season)!;
    const av = avail.get(data.season)!;
    const base = seasonRule(inp);
    const fr: FitRule = { ...base, players: { ...base.players!, a: v.a ?? P.a, np: v.np ?? P.np } };
    const season: SeasonInputs = { centres: inp.centres, players: { box: sb as SeasonBox, ratings: box.get(data.season)!, lineups: av.lineups, rookies: inp.players!.rookies }, extra: av.extra };
    for (const d of fitSeason(data, fr, season, v.off ? null : v.kappa ?? 0)) for (const pg of d.games) es[pg.game.id] = +expected(d.before, pg).toFixed(5);
  }
  out[name] = es;
  console.error(name);
}
writeFileSync(outPath, JSON.stringify(out));
