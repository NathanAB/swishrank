// What the players page shows, worked out from the one table (lib/player-timeline.ts) and nothing else: the ranking
// on a day, who was No. 1 and for how long, where each sample and rating falls on the plot, each line cut where its
// player changes team, and the markup of every part that changes with the day or the range. The page draws its
// default view with these at build time and its script draws every other day and range with the same ones in the
// browser, so the two never disagree. It imports only types from server modules, so it ships to the browser.
import type { Abbr } from "./elo.ts";
import { dayWithYear, monthShort, monthYear, rating, signed } from "./format.ts";
import type { PlayerTimeline, TimelinePlayer } from "./player-timeline.ts";
import { textWidth } from "./text-width.ts";

/** A team as the page draws it: its short name and its line colour (lib/tint.ts lineColor). */
export type TeamLook = { short: string; tint: string };
/** What the page's script fetches: the table and every team it names. */
export type ChartData = PlayerTimeline & { teams: Record<Abbr, TeamLook> };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isRating = (v: unknown): v is number | null => v === null || typeof v === "number";
const isStint = (v: unknown): v is [number, Abbr] => Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && typeof v[1] === "string";

/** The page's fetched table, checked whole, or null when it is not one. */
export function parseChartData(raw: unknown): ChartData | null {
  if (!isRecord(raw) || !Array.isArray(raw.days) || !Array.isArray(raw.seasons) || !Array.isArray(raw.players) || !isRecord(raw.teams)) return null;
  const days = raw.days.filter((d): d is string => typeof d === "string");
  const seasons = raw.seasons.flatMap((s) =>
    isRecord(s) && typeof s.id === "string" && typeof s.label === "string" && typeof s.from === "number" && typeof s.to === "number" ? [{ id: s.id, label: s.label, from: s.from, to: s.to }] : [],
  );
  const players = raw.players.flatMap((p) =>
    isRecord(p) && typeof p.id === "number" && typeof p.name === "string" && Array.isArray(p.v) && p.v.length === days.length && p.v.every(isRating) && Array.isArray(p.stints) && p.stints.every(isStint)
      ? [{ id: p.id, name: p.name, v: p.v, stints: p.stints }]
      : [],
  );
  const teams = Object.entries(raw.teams).flatMap(([a, t]) => (isRecord(t) && typeof t.short === "string" && typeof t.tint === "string" ? [[a, { short: t.short, tint: t.tint }] as const] : []));
  const whole = days.length === raw.days.length && seasons.length === raw.seasons.length && players.length === raw.players.length && teams.length === Object.keys(raw.teams).length;
  return whole && days.length > 0 && seasons.length > 0 ? { days, seasons, players, teams: Object.fromEntries(teams) } : null;
}

/** Players in the day's list, and the fewest ranked players a sample needs before the page shows it. */
export const BOARD = 10;
/** Players whose lines are drawn in full and named at the day's line. */
export const FRONT = 5;
/** Days the timeline leaves for each summer between two seasons, so a season starts just right of the last. */
export const SUMMER_GAP = 10;
/** The plot's viewBox; the page stretches it across the card at this height in px. */
export const PLOT = { w: 1000, h: 420 } as const;
/** The rating axis's floor and its tick step, in rating points. A line that falls below the floor runs off the plot. */
export const AXIS = { lo: 20, step: 20 } as const;
/** The widths, in px, at which the strip under the plot is laid out again: a name shows from the first that fits it. */
export const STRIP_STEPS = [240, 360, 480, 600, 720, 840, 960, 1080] as const;

/** How far back the plot reaches: the newest season, the last three, or everything since the first full sample. */
export type Range = "season" | "three" | "all";
/** The ranges in the order the switch lists them. */
export const RANGES: readonly Range[] = ["season", "three", "all"];
/** The range the page opens on, and the one its league-lines file draws. */
export const DEFAULT_RANGE: Range = "all";

const memo = <K extends object, V>(make: (k: K) => V) => {
  const cache = new WeakMap<K, V>();
  return (k: K) => (cache.has(k) ? cache.get(k)! : (cache.set(k, make(k)), cache.get(k)!));
};
const rankings = memo((_: PlayerTimeline) => new Map<number, TimelinePlayer[]>());

/** The players with a rating at sample `i`, best first; an exact tie goes to the name first in the alphabet. */
export function ranking(t: PlayerTimeline, i: number): TimelinePlayer[] {
  const cache = rankings(t);
  const hit = cache.get(i);
  if (hit) return hit;
  const order = t.players.filter((p) => p.v[i] !== null).sort((a, b) => b.v[i]! - a.v[i]! || a.name.localeCompare(b.name));
  cache.set(i, order);
  return order;
}

/** The first sample with a full list: before it, too few players have their minutes for a ranking to mean much. */
export const firstFull = memo((t: PlayerTimeline) => Math.max(0, t.days.findIndex((_, i) => ranking(t, i).length >= BOARD)));

/** The player ranked first at sample `i`, from the first full sample on. */
export const leaderAt = (t: PlayerTimeline, i: number): TimelinePlayer | undefined => (i < firstFull(t) ? undefined : ranking(t, i)[0]);

/** The team a player was on at sample `i`: his stint then, or his first before it. */
export function teamAt(p: TimelinePlayer, i: number): Abbr | undefined {
  let team = p.stints[0]?.[1];
  for (const [k, abbr] of p.stints) if (k <= i) team = abbr;
  return team;
}

/** "Jokic" from "Nikola Jokic": everything after the first name. */
export const surname = (name: string) => name.split(" ").slice(1).join(" ") || name;

const epochDay = (day: string) => Date.parse(day) / 86_400_000;

/** Where each sample falls on the timeline, in days: seasons end to end, each as long as its days, SUMMER_GAP apart. */
export const positions = memo((t: PlayerTimeline) => {
  const u: number[] = [];
  let offset = 0;
  for (const s of t.seasons) {
    for (let i = s.from; i <= s.to; i++) u[i] = offset + epochDay(t.days[i]) - epochDay(t.days[s.from]);
    offset = u[s.to] + SUMMER_GAP;
  }
  return u;
});

/** A range's first sample: this season's, the last three seasons', or the first full sample's. */
export function rangeFrom(t: PlayerTimeline, range: Range): number {
  const at = range === "season" ? t.seasons.length - 1 : range === "three" ? Math.max(0, t.seasons.length - 3) : 0;
  return range === "all" ? firstFull(t) : Math.max(firstFull(t), t.seasons[at].from);
}

/**
 * A range's name on the switch: "Since 2015" for the whole table, and the newest season by its own label, since
 * before a new season's first game the newest one with ratings is still the last.
 */
export function rangeLabel(t: PlayerTimeline, range: Range): string {
  switch (range) {
    case "season":
      return t.seasons[t.seasons.length - 1].label;
    case "three":
      return "3 seasons";
    case "all":
      return `Since ${t.days[firstFull(t)].slice(0, 4)}`;
    default: {
      const _exhaustive: never = range;
      return _exhaustive;
    }
  }
}

/** A range drawn on PLOT: its samples, where each falls across, where each rating falls down, and the axis's ticks. */
export type Frame = { from: number; to: number; x: (i: number) => number; y: (v: number) => number; ticks: number[] };

/** The frame of `range`, its rating axis reaching just past the highest rating in it. */
export function frame(t: PlayerTimeline, range: Range): Frame {
  const from = rangeFrom(t, range), to = t.days.length - 1;
  const u = positions(t);
  const span = u[to] - u[from] || 1;
  let max = AXIS.lo;
  for (const p of t.players) for (let i = from; i <= to; i++) if (p.v[i] !== null && p.v[i]! > max) max = p.v[i]!;
  const hi = Math.ceil(max / 10) * 10 + 5;
  const ticks: number[] = [];
  for (let v = AXIS.lo + AXIS.step; v <= hi; v += AXIS.step) ticks.push(v);
  return { from, to, x: (i) => ((u[i] - u[from]) / span) * PLOT.w, y: (v) => (1 - (v - AXIS.lo) / (hi - AXIS.lo)) * PLOT.h, ticks };
}

/** The sample of `f` nearest a point `share` of the way across the plot. */
export function nearest(f: Frame, share: number): number {
  const at = share * PLOT.w;
  let best = f.from;
  for (let i = f.from; i <= f.to; i++) if (Math.abs(f.x(i) - at) < Math.abs(f.x(best) - at)) best = i;
  return best;
}

/** One stretch of a player's line: the team he played for then, and its points as an SVG points list. */
export type Segment = { team: Abbr | undefined; points: string };

/**
 * A player's line over a frame, cut where he has no rating; with `byTeam`, also cut where he changes team, the two
 * stretches sharing the point where he changed so the line stays whole.
 */
export function segments(p: TimelinePlayer, f: Frame, byTeam = true): Segment[] {
  const out: { team: Abbr | undefined; pts: string[] }[] = [];
  let run: (typeof out)[number] | null = null;
  for (let i = f.from; i <= f.to; i++) {
    const v = p.v[i];
    if (v === null) {
      run = null;
      continue;
    }
    const team = byTeam ? teamAt(p, i) : undefined;
    const pt = `${f.x(i).toFixed(1)},${f.y(v).toFixed(1)}`;
    if (run && run.team !== team) run.pts.push(pt);
    if (!run || run.team !== team) out.push((run = { team, pts: [] }));
    run.pts.push(pt);
  }
  return out.map((s) => ({ team: s.team, points: s.pts.join(" ") }));
}

/** An unbroken stretch of samples, `from` to `to`, with one player first in every one. */
export type Run = { player: TimelinePlayer; from: number; to: number };

/** Who was No. 1 from sample `from` to `to`, joined into runs. */
export function runsAtTop(t: PlayerTimeline, from: number, to: number): Run[] {
  const runs: Run[] = [];
  for (let i = from; i <= to; i++) {
    const lead = leaderAt(t, i);
    const last = runs.at(-1);
    if (!lead) continue;
    if (last && last.player === lead && last.to === i - 1) last.to = i;
    else runs.push({ player: lead, from: i, to: i });
  }
  return runs;
}

/** The first sample of the run at No. 1 that sample `i` is in. */
export function reignStart(t: PlayerTimeline, i: number): number {
  const lead = leaderAt(t, i);
  let k = i;
  while (k > firstFull(t) && leaderAt(t, k - 1) === lead) k--;
  return k;
}

/** Weeks a player had been No. 1 by sample `i`: each stretch from a sample he led to the next one, summers left out. */
export function weeksAtTop(t: PlayerTimeline, p: TimelinePlayer, i: number): number {
  let days = 0;
  for (const s of t.seasons) {
    for (let k = Math.max(s.from, firstFull(t)); k < Math.min(s.to, i); k++) {
      if (leaderAt(t, k) === p) days += epochDay(t.days[k + 1]) - epochDay(t.days[k]);
    }
  }
  return days / 7;
}

/** Labels' tops, in plot px, from their points' `ys`: each at least `pitch` below the one above, all inside `h`. */
export function spread(ys: readonly number[], pitch: number, h: number): number[] {
  const order = ys.map((y, k) => ({ y, k })).sort((a, b) => a.y - b.y);
  const at = order.map((o) => o.y);
  for (let j = 0; j < at.length; j++) at[j] = Math.max(at[j], j ? at[j - 1] + pitch : pitch / 2);
  for (let j = at.length - 1; j >= 0; j--) at[j] = Math.min(at[j], j < at.length - 1 ? at[j + 1] - pitch : h - pitch / 2);
  const out: number[] = [];
  order.forEach((o, j) => (out[o.k] = at[j]));
  return out;
}

/** px a label keeps clear of the end of its block. */
const LABEL_AIR = 6;
/** px between two blocks of the strip. */
const STRIP_GAP = 2;

/** A label's width in px set at `size` px, with its air. Measured bold, wider than it sets, so one shown is never cut. */
const labelWidth = (text: string, size: number) => textWidth(text) * size + LABEL_AIR;

/** The strip widths, of STRIP_STEPS, at which a label `text` set at `size` px fits in a block `share` of the strip wide. */
export const fitSteps = (text: string, size: number, share: number): number[] =>
  STRIP_STEPS.filter((w) => share * w >= labelWidth(text, size) + STRIP_GAP);

/**
 * The strip widths at which each of a row of labels shows, `share` of the way across, set at `size` px: at each width
 * the labels are taken left to right, each kept where it starts clear of the last one kept and ends inside the row.
 */
export function rowSteps(marks: readonly { text: string; share: number }[], size: number): number[][] {
  const out = marks.map((): number[] => []);
  for (const w of STRIP_STEPS) {
    let end = -Infinity;
    marks.forEach((m, k) => {
      const x = m.share * w, right = x + labelWidth(m.text, size);
      if (x < end || right > w) return;
      out[k].push(w);
      end = right;
    });
  }
  return out;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ESCAPES[c]);
const pct = (px: number) => `${((px / PLOT.w) * 100).toFixed(3)}%`;
const look = (d: ChartData, abbr: Abbr | undefined): TeamLook => (abbr && d.teams[abbr]) || { short: abbr ?? "", tint: "var(--line-other)" };
/** A strip name's and a season label's size in px, as global.css sets --fs-tiny and --fs-small: a label is measured at the size it is set. */
export const LABEL_PX = { tiny: 11, small: 12 } as const;
const fit = (steps: readonly number[]) => (steps.length ? ` data-fit="${steps.join(" ")}"` : "");

/** Every kept player's line in grey, one polyline per stretch: the league-lines file's and the plot's background. */
export const greyLines = (t: PlayerTimeline, f: Frame) =>
  t.players.flatMap((p) => segments(p, f, false)).map((s) => `<polyline vector-effect="non-scaling-stroke" points="${s.points}"/>`).join("");

/** The league-lines file (src/pages/players/lines.svg.ts): the default range's grey lines, which the page draws through <use>. */
export const linesFile = (t: PlayerTimeline) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PLOT.w} ${PLOT.h}"><g id="lines" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round">${greyLines(t, frame(t, DEFAULT_RANGE))}</g></svg>`;

/** The rating axis's labels, each at its tick's height. */
export const tickLabels = (f: Frame) => f.ticks.map((v) => `<span style="top:${f.y(v).toFixed(1)}px">${v}</span>`).join("");

/** The plot's grid: a line at each tick and at each season's start inside the range. */
export const gridLines = (t: PlayerTimeline, f: Frame) =>
  [
    ...f.ticks.map((v) => `M0,${f.y(v).toFixed(1)}H${PLOT.w}`),
    ...t.seasons.filter((s) => s.from > f.from).map((s) => `M${f.x(s.from).toFixed(1)},0V${PLOT.h}`),
  ].map((d) => `<path class="grid" d="${d}"/>`).join("");

/** The strip of who was No. 1: a block per run in his team's colour then, named where the name fits. */
export function strip(d: ChartData, f: Frame, runs: readonly Run[]): string {
  return runs.map((r, k) => {
    const left = f.x(r.from), right = k + 1 < runs.length ? f.x(runs[k + 1].from) : f.x(r.to);
    const name = surname(r.player.name);
    return `<button type="button" tabindex="-1" data-run="${k}"${fit(fitSteps(name, LABEL_PX.tiny, (right - left) / PLOT.w))} title="${esc(`${r.player.name}, ${dayWithYear(d.days[r.from])}`)}" style="left:${pct(left)};width:calc(${pct(right - left)} - ${STRIP_GAP}px);--tint:${look(d, teamAt(r.player, r.from)).tint}"><span>${esc(name)}</span></button>`;
  }).join("");
}

/** The labels under the strip: each season at its start, or the months of a range inside one season. */
export function axisLabels(t: PlayerTimeline, f: Frame): string {
  const u = positions(t);
  const seasons = t.seasons.filter((s) => s.to > f.from);
  const at = (i: number, extra = 0) => ((u[i] + extra - u[f.from]) / (u[f.to] - u[f.from] || 1)) * PLOT.w;
  const marks = seasons.length > 1
    ? seasons.map((s) => ({ text: s.label, x: at(Math.max(s.from, f.from)) }))
    : monthsIn(t.days[f.from], t.days[f.to]).map((m) => ({ text: monthShort(m), x: at(f.from, epochDay(`${m}-01`) - epochDay(t.days[f.from])) }));
  const steps = rowSteps(marks.map((m) => ({ text: m.text, share: m.x / PLOT.w })), LABEL_PX.small);
  return marks.map((m, k) => `<span${fit(steps[k])} style="left:${pct(m.x)}">${esc(m.text)}</span>`).join("");
}

/** The months, YYYY-MM, whose first day falls from `from` to `to`. */
function monthsIn(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  if (!from.endsWith("-01")) m++;
  for (;;) {
    if (m > 12) { y++; m = 1; }
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (`${key}-01` > to) return out;
    out.push(key);
    m++;
  }
}

/** One day as the page shows it: the header's No. 1, the top five on the plot and the Top 10. */
export type DayView = {
  i: number;
  date: string;
  /** The No. 1: his name, his team's short name and line colour, his rating and the month his run at No. 1 began. */
  lead: { name: string; team: string; tint: string; rating: string; since: string };
  figures: { label: string; value: string }[];
  /** The top five's full lines, worst first so the best draws on top. */
  lines: string;
  /** Their dots and labels at the day's line. */
  marks: string;
  /** The day's line, across the plot as a share in percent. */
  at: string;
  board: { id: number; tint: string; row: string }[];
  /** The strip's run that holds the day, or -1. */
  run: number;
};

/** Labels flip to the left of the day's line past this share of the plot, so they stay inside it. */
const FLIP = 0.78;
/** px between two labels' tops. */
const PITCH = 16;

/** Sample `i` as the page shows it on frame `f`, whose runs at No. 1 are `runs`. */
export function dayView(d: ChartData, f: Frame, runs: readonly Run[], i: number): DayView {
  const order = ranking(d, i);
  const top = order.slice(0, BOARD), five = top.slice(0, FRONT);
  const [lead, second] = top;
  const lt = look(d, teamAt(lead, i));
  const x = f.x(i);
  const ys = five.map((p) => f.y(p.v[i]!));
  const ly = spread(ys, PITCH, PLOT.h);
  const flip = x / PLOT.w > FLIP;
  const best = lead.v[i]!;
  const since = monthYear(d.days[reignStart(d, i)].slice(0, 7));
  return {
    i,
    date: dayWithYear(d.days[i]),
    lead: { name: lead.name, team: lt.short, tint: lt.tint, rating: rating(best), since },
    figures: [
      { label: "Rating", value: rating(best) },
      { label: "Lead over No. 2", value: second ? signed(Math.round(best) - Math.round(second.v[i]!)) : "–" },
      { label: "No. 1 since", value: since },
      { label: "Total weeks at No. 1", value: String(Math.round(weeksAtTop(d, lead, i))) },
    ],
    lines: [...five].reverse().flatMap((p) => segments(p, f).map((s) => `<polyline class="hl" style="--tint:${look(d, s.team).tint}" points="${s.points}"/>`)).join(""),
    marks: five.map((p, k) => {
      const tint = look(d, teamAt(p, i)).tint;
      return `<i class="dot" style="left:${pct(x)};top:${ys[k].toFixed(1)}px;--tint:${tint}"></i><span class="lab${flip ? " flip" : ""}" style="left:${pct(x)};top:${ly[k].toFixed(1)}px"><b>${k + 1}</b> ${esc(surname(p.name))}</span>`;
    }).join(""),
    at: pct(x),
    board: top.map((p, k) => {
      const t = look(d, teamAt(p, i));
      const bar = Math.max(0, (p.v[i]! / best) * 100).toFixed(1);
      return { id: p.id, tint: t.tint, row: `<span class="rk">${k + 1}</span><span class="nm">${esc(p.name)}<i>${esc(t.short)}</i></span><span class="bar"><i style="width:${bar}%"></i></span><b class="num">${rating(p.v[i]!)}</b>` };
    }),
    run: runs.findIndex((r) => r.from <= i && i <= r.to),
  };
}
