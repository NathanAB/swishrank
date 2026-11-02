// The site's interactions. A team shown in several places on a page is highlighted in all of them while the
// reader points at or focuses one. Every element that shows a team carries data-team. Two kinds of element
// preview a team: a rating chart's plot (data-plot) previews the team whose line is nearest the pointer, and
// an element that names a team (data-preview: a league table row, its link, a dot on its scale) previews it
// while pointed at or focused; the nearest data-preview decides, so one without a team (the table's scale
// cell) previews none. A click on a link just follows it; a click on a plot, a row or a dot opens the
// previewed team's page. Every rating chart (data-chart) also reads out the day under the pointer: a thin line
// at that day and a box with the team's rating and rank, the nearest team's or, on a team's page, that team's
// (data-own). A line may carry its team's league rank for each day (data-ranks), for a chart that draws
// only some teams, such as a game's page; otherwise the rank is among the lines drawn. On a touch screen a tap
// shows the readout and a second tap on the same team opens its page. There only a chart previews: a finger on a
// row or a dot is as likely the start of a scroll as a choice, so it clears the preview, and a tap opens the team.
import { addDays } from "../lib/elo.ts";
import { placeLabel, weekdayDay } from "../lib/format.ts";
import { dayAt, nearestLine, type PlotLine } from "../lib/pick.ts";
import { parseRanks, parseScale, readout, type Place, type Scale } from "../lib/readout.ts";
import { placeTip } from "./tip.ts";

const closestOf = (t: EventTarget | null, selector: string) => (t instanceof Element ? t.closest<HTMLElement | SVGElement>(selector) : null);
const chartOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<SVGSVGElement>("svg[data-chart]") : null);

type Chart = {
  lines: PlotLine[];
  names: Record<string, string>;
  hrefs: Record<string, string>;
  /** Each line's league rank by day, where its data-ranks gives one. */
  ranks: Record<string, Place[]>;
  scale: Scale | null;
  days: string[];
  own: string | null;
  previewsNearest: boolean;
  cross: SVGPathElement | null;
  tip: HTMLElement | null;
};

/** A chart's days as its readout names them: one a calendar day from its first (data-from), one per point. */
const daysOf = (svg: SVGSVGElement, count: number): string[] =>
  svg.dataset.from ? Array.from({ length: count }, (_, i) => weekdayDay(addDays(svg.dataset.from!, i))) : [];

const charts = new Map<SVGSVGElement, Chart>(
  [...document.querySelectorAll<SVGSVGElement>("svg[data-chart]")].map((svg) => {
    const polys = [...svg.querySelectorAll<SVGPolylineElement>("polyline[data-team]:not([data-trail])")];
    // A line whose team's run has ended goes on in a trail of its own, which starts on the run's last point.
    const ys = (l: SVGPolylineElement) => {
      const trail = svg.querySelector<SVGPolylineElement>(`polyline[data-trail][data-team="${l.dataset.team}"]`);
      return [...Array.from(l.points, (p) => p.y), ...Array.from(trail?.points ?? [], (p) => p.y).slice(1)];
    };
    const lines = polys.map((l) => ({ team: l.dataset.team ?? "", ys: ys(l) }));
    const by = (key: "name" | "href") => Object.fromEntries(polys.map((l) => [l.dataset.team ?? "", l.dataset[key] ?? ""]));
    return [
      svg,
      {
        lines,
        names: by("name"),
        hrefs: by("href"),
        ranks: Object.fromEntries(polys.flatMap((l) => (l.dataset.ranks ? [[l.dataset.team ?? "", parseRanks(l.dataset.ranks)]] : []))),
        scale: parseScale(svg.dataset.scale ?? ""),
        days: daysOf(svg, lines[0]?.ys.length ?? 0),
        own: svg.dataset.own ?? null,
        previewsNearest: svg.hasAttribute("data-plot"),
        cross: svg.querySelector<SVGPathElement>("[data-cross]"),
        tip: svg.parentElement?.querySelector<HTMLElement>("[data-tip]") ?? null,
      },
    ];
  }),
);

function placeOn(e: MouseEvent, svg: SVGSVGElement) {
  const box = svg.getBoundingClientRect();
  return { fx: (e.clientX - box.left) / box.width, y: ((e.clientY - box.top) / box.height) * svg.viewBox.baseVal.height };
}

let previewed: string | null = null;
const preview = (team: string | null) => {
  if (team === previewed) return;
  previewed = team;
  for (const el of document.querySelectorAll<HTMLElement | SVGElement>("[data-team]")) el.classList.toggle("hov", el.dataset.team === team);
  // Lines are drawn in order, so the previewed one moves last to sit on top.
  for (const el of document.querySelectorAll("[data-raise].hov")) el.parentNode?.appendChild(el);
};

function hideReadout(svg: SVGSVGElement) {
  const c = charts.get(svg);
  c?.cross?.classList.remove("on");
  if (c?.tip) c.tip.hidden = true;
}

function showReadout(e: MouseEvent, svg: SVGSVGElement, c: Chart, team: string | null) {
  const { fx } = placeOn(e, svg);
  const day = dayAt(fx, c.days.length);
  const r = team && c.scale ? readout(c.lines, c.scale, day, team) : null;
  if (!c.cross || !c.tip || !r) return hideReadout(svg);
  c.cross.setAttribute("transform", `translate(${(day / Math.max(1, c.days.length - 1)) * svg.viewBox.baseVal.width} 0)`);
  c.cross.classList.add("on");

  const name = document.createElement("b");
  name.textContent = c.names[team ?? ""] ?? team;
  const value = document.createElement("strong");
  value.textContent = String(r.rating);
  const rank = document.createElement("i");
  const { rank: n, tied } = c.ranks[team ?? ""]?.[day] ?? r;
  rank.textContent = placeLabel(n, tied);
  const line = document.createElement("span");
  line.append(name, value, rank);
  const when = document.createElement("span");
  when.textContent = c.days[day] ?? "";
  c.tip.replaceChildren(when, line);
  c.tip.hidden = false;

  const area = c.tip.offsetParent;
  if (area) placeTip({ tip: c.tip, area, at: e });
}

function onChart(e: PointerEvent, svg: SVGSVGElement) {
  const c = charts.get(svg);
  if (!c) return;
  const { fx, y } = placeOn(e, svg);
  const team = c.own ?? (c.previewsNearest ? nearestLine(c.lines, fx, y) : null);
  if (c.previewsNearest) preview(team);
  showReadout(e, svg, c, team);
}

const pointed = (e: PointerEvent) => {
  const svg = chartOf(e.target);
  if (svg) return onChart(e, svg);
  preview(e.pointerType === "touch" ? null : closestOf(e.target, "[data-preview]")?.dataset.team ?? null);
};
document.addEventListener("pointerover", pointed);

let firstTapTeam: string | null = null;
let lastPointer = "mouse";
document.addEventListener("pointerdown", (e) => {
  lastPointer = e.pointerType;
  if (chartOf(e.target)) return;
  firstTapTeam = null;
  for (const svg of charts.keys()) hideReadout(svg);
});

for (const [svg, c] of charts) {
  svg.addEventListener("pointermove", (e) => onChart(e, svg));
  // A finger lifting also leaves the plot, but its readout stays until the next touch elsewhere.
  svg.addEventListener("pointerleave", (e) => {
    if (e.pointerType !== "touch") hideReadout(svg);
  });
  if (!c.previewsNearest) continue;
  svg.addEventListener("click", (e) => {
    const { fx, y } = placeOn(e, svg);
    const team = nearestLine(c.lines, fx, y);
    const to = team ? c.hrefs[team] : undefined;
    if (!team || !to) return;
    if (lastPointer === "touch" && firstTapTeam !== team) {
      firstTapTeam = team;
      return;
    }
    location.assign(to);
  });
}

document.addEventListener("click", (e) => {
  if (closestOf(e.target, "a[href]")) return;
  const to = closestOf(e.target, "[data-preview]")?.dataset.href;
  if (!to) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey) window.open(to, "_blank");
  else location.assign(to);
});

// A middle click on a row or a dot opens its team in a new tab, as it would on a link.
document.addEventListener("auxclick", (e) => {
  if (e.button !== 1 || closestOf(e.target, "a[href]")) return;
  const to = closestOf(e.target, "[data-preview]")?.dataset.href;
  if (to) window.open(to, "_blank");
});

document.addEventListener("focusin", (e) => preview(closestOf(e.target, "[data-preview]")?.dataset.team ?? null));
document.addEventListener("focusout", (e) => preview(closestOf(e.relatedTarget, "[data-preview]")?.dataset.team ?? null));
