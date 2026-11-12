// What every drawing of a season's ratings shares: the rating charts on the home, team and game pages, the
// league-lines file, the league table's chart, the share images and How it works draw on one plot (seasonPlot),
// each at its own size, and label their dates and mark the end of the regular season the same way.
import { ranksOf, START, type Abbr, type Season } from "./elo.ts";
import { ratingRange } from "./facts.ts";
import { monthShort, shortDay } from "./format.ts";
import { ranksAttr, type Place } from "./readout.ts";
import { regularSeasonEnd, runEnds } from "./teams.ts";

/**
 * Date labels on one step that lands on the last day: month starts for a long season, days for a short one.
 * `tick` is a day label's width as a fraction of the narrowest plot that shows them. The last day's label
 * ends at the plot's edge while the others centre on their day, so days at least two labels apart leave
 * half a label of air before the last.
 */
export function dateTicks(days: readonly string[], tick: number): { i: number; text: string }[] {
  const n = days.length;
  const out: { i: number; text: string }[] = [];
  if (n > 60) {
    const firsts = days.flatMap((d, i) => (d.endsWith("-01") ? [i] : []));
    const k = Math.ceil(firsts.length / 4);
    firsts.forEach((i, j) => { if (j % k === 0) out.push({ i, text: monthShort(days[i].slice(0, 7)) }); });
  } else {
    const k = Math.max(1, Math.ceil((n - 1) / 4), Math.ceil(2 * tick * (n - 1)));
    for (let i = n - 1; i >= 1; i -= k) out.unshift({ i, text: shortDay(days[i]) });
  }
  return out;
}

/** A rating axis: 3 to 6 round ticks that include 1000, the top one above the highest rating. */
export function ratingTicks(min: number, max: number): { lo: number; hi: number; ticks: number[] } {
  for (const step of [25, 50, 100, 150, 200, 250, 300, 500]) {
    const lo = START - Math.ceil((START - min) / step) * step;
    let hi = START + Math.ceil((max - START) / step) * step;
    if (hi <= max) hi += step;
    const ticks: number[] = [];
    for (let v = lo; v <= hi; v += step) ticks.push(v);
    if (ticks.length <= 6 || step === 500) return { lo, hi, ticks };
  }
  throw new Error("unreachable: the last step always returns");
}

/**
 * The regular season's last day, as an index into the daily series, with its label; null until the postseason
 * has a game. The lines of the teams it ended stop at this mark.
 */
export function seasonEndMark(model: Season): { i: number; label: string } | null {
  const day = regularSeasonEnd(model);
  const i = day ? model.series.findIndex((d) => d.day === day) : -1;
  return day && i >= 0 ? { i, label: `Regular season ends ${shortDay(day)}` } : null;
}

/**
 * The date labels that keep clear of the season-end label, where both share the plot's top edge: that label
 * ends just left of its marker. Places and widths are fractions of the plot's width; give the widths at the
 * narrowest plot that shows the labels, so they stay apart at every wider one.
 */
export function clearOfMark<T extends { i: number }>(ticks: readonly T[], n: number, mark: { i: number } | null, widths: { mark: number; tick: number }): T[] {
  if (!mark || n < 2) return [...ticks];
  const end = mark.i / (n - 1);
  const start = end - widths.mark;
  return ticks.filter((t) => {
    const at = t.i / (n - 1);
    return at + widths.tick / 2 < start || at - widths.tick / 2 > end;
  });
}

/**
 * A team's line split at the last day of its run (lib/teams.ts runEnds): solid through its games, then a
 * dotted trail as the daily refits move it without any. Each day's point is drawn once; the trail starts on
 * the run's last point so the two meet. No trail while the team still plays, or played on the latest day.
 */
export function runAndTrail(model: Season): (a: Abbr, pts: string[]) => { run: string; trail: string | null } {
  const ends = runEnds(model);
  const last = model.series.length - 1;
  return (a, pts) => {
    const end = model.series.findIndex((d) => d.day === ends[a]);
    return end > 0 && end < last ? { run: pts.slice(0, end + 1).join(" "), trail: pts.slice(end).join(" ") } : { run: pts.join(" "), trail: null };
  };
}

/**
 * A rating axis over a season's range (lib/facts.ts ratingRange): it hugs the ratings with a margin of a twentieth of their
 * range, so the lines fill the plot rather than leaving bands empty above and below them, and is labelled by
 * the round ticks (ratingTicks) that fall inside it. Every drawing of a season's ratings uses it (seasonPlot);
 * the league table's leaves no margin, so its top and bottom ratings sit level with its first and last rows.
 */
export function ratingScale(min: number, max: number, margin = Math.max(1, max - min) / 20): { lo: number; hi: number; ticks: number[] } {
  const lo = min - margin;
  const hi = max + margin;
  return { lo, hi, ticks: ratingTicks(min, max).ticks.filter((t) => t >= lo && t <= hi) };
}

/**
 * A short tag that changes with a file's content, for its URL's ?v=, so a page never draws over a stale copy of a
 * file it reuses from the cache. FNV-1a, 32 bits: enough to tell one day's file from the next.
 */
export function contentVersion(content: string): string {
  let v = 0x811c9dc5;
  for (const ch of content) v = Math.imul(v ^ ch.charCodeAt(0), 0x01000193);
  return (v >>> 0).toString(36);
}

/** A rating chart's plot: its viewBox width, its height in px (the same at every width) and its inner padding. */
export const PLOT = { w: 1000, h: 300, pad: 8 };

/**
 * A season drawn on a plot `w` by `h`: the scale, where each day and rating falls, each team's line, each team's
 * league rank by day for the readout, and the league-lines file, every team's line once for the season's pages
 * that draw only some teams in front of the rest (src/pages/lines/[season].svg.ts), with a version that changes
 * with its content so a page never draws over a stale copy. A rating chart's plot is PLOT; the league table,
 * the share images and How it works give their own size. `flush` leaves the scale no margin (ratingScale).
 * Worked out once per season and size, as some fifteen thousand pages draw them.
 */
export type SeasonPlot = {
  n: number;
  lo: number;
  hi: number;
  ticks: number[];
  x: (i: number) => number;
  y: (v: number) => number;
  /** A team's line through its displayed (rounded) ratings, one "x,y" point a day. */
  pts: (a: Abbr) => string[];
  /** A team's league rank on each day, as the readout's data-ranks takes it (lib/readout.ts ranksAttr). */
  ranks: (a: Abbr) => string;
  leagueLines: () => string;
  version: () => string;
};

type Size = { w?: number; h?: number; pad?: number; flush?: boolean };

const plots = new WeakMap<Season, Map<string, SeasonPlot>>();

export function seasonPlot(model: Season, { w = PLOT.w, h = PLOT.h, pad = PLOT.pad, flush = false }: Size = {}): SeasonPlot {
  const bySize = plots.get(model) ?? new Map<string, SeasonPlot>();
  plots.set(model, bySize);
  const key = `${w} ${h} ${pad} ${flush}`;
  const hit = bySize.get(key);
  if (hit) return hit;

  const ser = model.series;
  const n = ser.length;
  const range = ratingRange(model);
  const { lo, hi, ticks } = ratingScale(range.lo, range.hi, flush ? 0 : undefined);
  // A flush scale before the first game is one rating, drawn halfway down.
  const y = (v: number) => (hi === lo ? h / 2 : pad + ((h - 2 * pad) * (hi - v)) / (hi - lo));
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * w);
  const pts = (a: Abbr) => ser.map((d, i) => `${x(i).toFixed(1)},${y(Math.round(d.r[a])).toFixed(1)}`);
  const once = <T>(make: () => T) => {
    let v: T | undefined;
    return () => (v ??= make());
  };
  const dayRanks = once(() =>
    ser.map((d) => {
      const rank = ranksOf(d.r);
      const count = new Map<number, number>();
      for (const r of Object.values(rank)) count.set(r, (count.get(r) ?? 0) + 1);
      return Object.fromEntries(Object.entries(rank).map(([a, r]): [Abbr, Place] => [a, { rank: r, tied: (count.get(r) ?? 0) > 1 }]));
    }),
  );
  // Each line keeps its width however far the page stretches the plot, as the page's own lines do.
  const leagueLines = once(() => {
    const lines = model.abbrs.map((a) => `<polyline vector-effect="non-scaling-stroke" points="${pts(a).join(" ")}"/>`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><g id="lines" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">${lines}</g></svg>`;
  });
  const version = once(() => contentVersion(leagueLines()));
  const plot: SeasonPlot = { n, lo, hi, ticks, x, y, pts, ranks: (a) => ranksAttr(dayRanks().map((r) => r[a])), leagueLines, version };
  bySize.set(key, plot);
  return plot;
}
