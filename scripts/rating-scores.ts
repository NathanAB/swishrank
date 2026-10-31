// npm run ratings: scores definitions of a team's shown rating on how well each predicts the team's next 10
// games (docs/model-v2.md, What the reader sees). For every finished season it compares
//   A  results only: the team fit with its seeds, no players;
//   B  the usual rotation the site shows: minutes per team game over the last 10, with last season as one more
//      game, times the share of those games the player played in and at no more than his most minutes in one,
//      until the team has played 10;
//   C  expected minutes from the games-missed curve, the injury report left out (src/lib/rotation.ts).
// `npm run ratings -- 2026-27` instead judges the injury report as docs/model-v2.md declares: D, which is C with
// each player the report gives a return for counted for the share of the next 10 games on or after it, against
// B, from the first archived day through the last regular-season game day, with the 95% interval of D minus B
// from version 1's weekly block bootstrap.
//
// The score: after each game day, for each team with 10 games still to play, the miss between the mean counted
// margin of those games, less home court and the back-to-back, and the team's rating less the mean rating of
// the 10 opponents, all as they stood that day. Lower root mean square is better.
import { readFileSync, existsSync } from "node:fs";
import { b2bTerm, compute, counted, EARLY, ELO_PER_SIGMA, fitModel, PARAMS, phi, playerPart, secondNights, shownChange, type Abbr, type ModelInputs, type Season, type SeasonData } from "../src/lib/elo.ts";
import { beforeTip, parseArchive } from "../src/lib/injuries.ts";
import { modelInputs } from "../src/lib/inputs.ts";
import { usualRotations, type Lineup, type SeasonRotations } from "../src/lib/players.ts";
import { missedCurves, rotations, type SeasonFiles } from "../src/lib/rotation.ts";
import { regularSeasonEnd } from "../src/lib/teams.ts";
import { blockBootstrap, loadBox } from "./evaluate.ts";

const SCALE = ELO_PER_SIGMA / PARAMS.sigma;
const NEXT = 10;
const read = (path: string): unknown => {
  const url = new URL(`../src/data/${path}`, import.meta.url);
  return existsSync(url) ? JSON.parse(readFileSync(url, "utf8")) : undefined;
};
const list = read("seasons.json") as { id: string; end?: string }[];
const ids = list.map((s) => s.id).sort();
const files = ids.map((id) => ({ data: read(`games/${id}.json`) as SeasonData, box: read(`box/${id}.json`), preseason: read(`preseason/${id}.json`) }));
const inputs = modelInputs(files);
const walked: SeasonFiles[] = ids.map((id, i) => {
  const injuries = read(`injuries/${id}.json`);
  return { data: files[i].data, box: loadBox(id), injuries: injuries === undefined ? undefined : parseArchive(injuries, id) };
});
const curves = missedCurves(walked);
const withReport = rotations(walked, curves);
const curveOnly = rotations(walked.map(({ data, box }) => ({ data, box })), curves);

const usual = usualRotations(walked);

type Definition = { name: string; inputs: (id: string) => ModelInputs };
const withRotation = (rotation: Map<string, SeasonRotations>) => (id: string): ModelInputs => {
  const own = inputs.get(id)!;
  return { ...own, players: { ...own.players!, rotation: rotation.get(id)! } };
};
const A: Definition = { name: "A results only", inputs: (id) => ({ centres: inputs.get(id)!.centres }) };
const B: Definition = { name: "B usual rotation", inputs: withRotation(usual) };
const C: Definition = { name: "C curve", inputs: withRotation(curveOnly) };
const D: Definition = { name: "D with report", inputs: withRotation(withReport) };

/** Each team-day's counted miss, in margin units, for game days `from` to `to`. */
function misses(model: Season, from = "", to = "9999"): { day: string; abbr: Abbr; miss: number }[] {
  const second = secondNights(model.data);
  const byDay = new Map(model.series.map((s) => [s.day, s.r]));
  const days = [...new Set(model.results.map((r) => r.day))].filter((d) => d >= from && d <= to);
  const out: { day: string; abbr: Abbr; miss: number }[] = [];
  for (const day of days) {
    const r = byDay.get(day)!;
    for (const abbr of model.abbrs) {
      const next = model.log[abbr].filter((g) => g.result.day > day).slice(0, NEXT);
      if (next.length < NEXT) continue;
      let margin = 0, opponents = 0;
      for (const { result: { game }, side } of next) {
        const sign = side === "h" ? 1 : -1;
        const edge = (game.neutral ? 0 : model.home / SCALE) + b2bTerm(PARAMS, second.get(game.id)!);
        margin += sign * (counted(game.hs! - game.as!, PARAMS.margin) - edge);
        opponents += r[side === "h" ? game.away : game.home];
      }
      out.push({ day, abbr, miss: margin / NEXT - (r[abbr] - opponents / NEXT) / SCALE });
    }
  }
  return out;
}
const rms = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);

/** The expected home margin, in counted units, that a home chance `p` came from. */
const expectedMargin = (p: number, widen: number) => {
  let lo = -20, hi = 20;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (phi(mid) < p) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * PARAMS.sigma * widen;
};

/** The display's behaviour: wrong-way changes in the game log and on the chart, the largest moves, and every-game.test.ts's three caps. */
function behaviour(model: Season, def: Definition) {
  let wrong = 0, worstWrong = 0, chartWrong = 0, chartWorst = 0, move = 0, against = 0, idle = 0;
  const played: Record<Abbr, number> = Object.fromEntries(model.abbrs.map((a) => [a, 0]));
  for (const { game, p, pre, post } of model.results) {
    const widen = Math.min(played[game.home], played[game.away]) < EARLY.games ? EARLY.widen : 1;
    const surprise = counted(game.hs! - game.as!, PARAMS.margin) - expectedMargin(p, widen);
    for (const [side, sign] of [["h", 1], ["a", -1]] as const) {
      const change = shownChange(pre[side], post[side]);
      const won = sign * (game.hs! - game.as!) > 0;
      if (won ? change < 0 : change > 0) { wrong++; worstWrong = Math.max(worstWrong, Math.abs(change)); }
      against = Math.max(against, sign * surprise > 0 ? -change : change);
    }
    played[game.home]++;
    played[game.away]++;
  }
  const first = Math.max(...model.abbrs.map((a) => model.log[a][0]).filter((g) => g).map((g) => Math.abs(shownChange(g.result.pre[g.side], g.result.post[g.side]))));
  const gameDays = new Set(model.results.map((r) => r.day));
  for (let i = 1; i < model.series.length; i++) {
    const { day, r } = model.series[i];
    if (!gameDays.has(day)) continue;
    const today = model.results.filter((x) => x.day === day);
    for (const a of model.abbrs) {
      const change = shownChange(model.series[i - 1].r[a], r[a]);
      move = Math.max(move, Math.abs(change));
      const g = today.find((x) => x.game.home === a || x.game.away === a)?.game;
      if (!g) { idle = Math.max(idle, Math.abs(change)); continue; }
      const won = (g.home === a) === (g.hs! > g.as!);
      if (won ? change < 0 : change > 0) { chartWrong++; chartWorst = Math.max(chartWorst, Math.abs(change)); }
    }
  }
  let rotation = 0;
  const own = def.inputs(model.data.season);
  if (own.players) {
    const was: Partial<Record<Abbr, Lineup>> = {};
    for (const { day, after } of fitModel(model.data, own)) {
      for (const [abbr, lineup] of Object.entries(own.players.rotation.get(day) ?? {})) {
        const before = was[abbr];
        if (before && lineup) rotation = Math.max(rotation, Math.abs(playerPart(after, lineup) - playerPart(after, before)) * SCALE);
        was[abbr] = lineup;
      }
    }
  }
  return { wrong, worstWrong, chartWrong, chartWorst, move, idle, first, against, rotation };
}

const pad = (x: string | number, n: number) => String(x).padStart(n);
const judged = process.argv[2];
if (judged) {
  const id = judged;
  const archive = walked.find((s) => s.data.season === id)?.injuries;
  if (!archive || !Object.keys(archive.days).length) throw new Error(`${id} has no archived injury report`);
  const reportDays = Object.keys(archive.days).sort();
  const from = reportDays[0];
  const data = files.find((f) => f.data.season === id)!.data;
  const [b, d] = [B, D].map((def) => compute(data, def.inputs(id)));
  const to = regularSeasonEnd(b);
  const [mb, md] = [b, d].map((model) => misses(model, from, to ?? undefined));
  console.log(`${id}, game days ${from} to ${to ?? "today (the regular season is still on)"}, teams with 10 games still to play`);
  if (!mb.length) {
    const usable = Object.keys(beforeTip(archive, data.games).days).length;
    console.log(`Too few report days to judge: ${reportDays.length} archived from ${from} to ${reportDays.at(-1)}, ${usable} of them fetched before the day's first tip-off, and no team has played 10 games since ${from}.`);
  } else {
    const first = Date.parse(b.results[0].day);
    const diff = blockBootstrap(mb.map((x, i) => {
      const y = md[i];
      if (x.day !== y.day || x.abbr !== y.abbr) throw new Error(`B's ${x.day} ${x.abbr} lines up with D's ${y.day} ${y.abbr}`);
      return { season: id, day: Math.round((Date.parse(x.day) - first) / 86_400_000), a: y.miss ** 2, b: x.miss ** 2 };
    }));
    for (const [def, m] of [[B, mb], [D, md]] as const) console.log(`${def.name.padEnd(16)} RMS miss ${rms(m.map((x) => x.miss)).toFixed(4)} over ${m.length} team-days`);
    console.log(`D minus B, mean squared miss ${diff.d.toFixed(5)}, 95% interval ${diff.lo.toFixed(5)} to ${diff.hi.toFixed(5)} over ${diff.blocks} weeks`);
    console.log(to === null ? "Not judged until the regular season ends." : diff.d < 0 && diff.hi < 0 ? "D replaces B." : "The site keeps B.");
  }
} else {
  const finished = list.filter((s) => s.end).map((s) => s.id).sort();
  console.log("Curve, share of the next 10 games played by games missed in a row, learned without 2026-27:", curves.get("2026-27")!.map((x) => x.toFixed(3)).join(" "));
  console.log(`\n${"".padEnd(18)} ${"pooled".padStart(8)} ${finished.map((id) => pad(id.slice(2), 6)).join(" ")}`);
  const behaviours = new Map<string, ReturnType<typeof behaviour>[]>();
  for (const def of [A, B, C]) {
    const all: number[] = [], per: string[] = [];
    behaviours.set(def.name, []);
    for (const id of finished) {
      const model = compute(files.find((f) => f.data.season === id)!.data, def.inputs(id));
      const m = misses(model).map((x) => x.miss);
      all.push(...m);
      per.push(pad(rms(m).toFixed(3), 6));
      behaviours.get(def.name)!.push(behaviour(model, def));
    }
    console.log(`${def.name.padEnd(18)} ${pad(rms(all).toFixed(4), 8)} ${per.join(" ")}`);
  }
  console.log("\nPer finished season, the range over seasons: wrong-way changes in the game log and on the chart (count, largest), largest one-day move on the chart, largest move on a day the team did not play, largest first-game change, largest change against the surprise, largest one-day rotation move");
  for (const [name, bs] of behaviours) {
    const range = (f: (b: ReturnType<typeof behaviour>) => number) => `${Math.min(...bs.map(f)).toFixed(0)}-${Math.max(...bs.map(f)).toFixed(0)}`;
    console.log(`${name.padEnd(18)} wrong ${range((b) => b.wrong)} by ${range((b) => b.worstWrong)}  chart ${range((b) => b.chartWrong)} by ${range((b) => b.chartWorst)}  move ${range((b) => b.move)}  idle ${range((b) => b.idle)}  first ${range((b) => b.first)}  against ${range((b) => b.against)}  rotation ${range((b) => b.rotation)}`);
  }
}
