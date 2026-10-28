// The site's interactions. A team shown in several places on a page is highlighted in all of them while the
// reader points at or focuses one. Every element that shows a team carries data-team. Two kinds of element
// preview a team: a rating chart's plot (data-plot) previews the team whose line is nearest the pointer, and
// an element that names a team (data-preview: a league table row, its link, a dot on its scale) previews it
// while pointed at or focused; the nearest data-preview decides, so one without a team (the table's scale
// cell) previews none. A click on a link just follows it; a click on a plot, a row or a dot opens the
// previewed team's page. Every rating chart (data-chart) also reads out the day under the pointer: a thin
// line at that day and a box with the team's rating and rank, the nearest team's or, on a team's page, that
// team's (data-own). On a touch screen a tap shows the readout and a second tap on the same team opens its
// page.
import { ordinal } from "../lib/format.ts";
import { dayAt, nearestLine, type PlotLine } from "../lib/pick.ts";
import { parseScale, readout, type Scale } from "../lib/readout.ts";

const closestOf = (t: EventTarget | null, selector: string) => (t instanceof Element ? t.closest<HTMLElement | SVGElement>(selector) : null);
const chartOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<SVGSVGElement>("svg[data-chart]") : null);

type Chart = {
  lines: PlotLine[];
  names: Record<string, string>;
  hrefs: Record<string, string>;
  scale: Scale | null;
  days: string[];
  own: string | null;
  previewsNearest: boolean;
  cross: SVGPathElement | null;
  tip: HTMLElement | null;
};

const parseDays = (attr: string | undefined): string[] => {
  const v: unknown = JSON.parse(attr ?? "[]");
  return Array.isArray(v) ? v.map(String) : [];
};

const charts = new Map<SVGSVGElement, Chart>(
  [...document.querySelectorAll<SVGSVGElement>("svg[data-chart]")].map((svg) => {
    const polys = [...svg.querySelectorAll<SVGPolylineElement>("polyline[data-team]")];
    const by = (key: "name" | "href") => Object.fromEntries(polys.map((l) => [l.dataset.team ?? "", l.dataset[key] ?? ""]));
    return [
      svg,
      {
        lines: polys.map((l) => ({ team: l.dataset.team ?? "", ys: Array.from(l.points, (p) => p.y) })),
        names: by("name"),
        hrefs: by("href"),
        scale: parseScale(svg.dataset.scale ?? ""),
        days: parseDays(svg.dataset.days),
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
  // Lines and curves are drawn in order, so the previewed one moves last to sit on top, under a team page's own line.
  for (const c of ["hov", "own"]) for (const el of document.querySelectorAll(`[data-raise].${c}`)) el.parentNode?.appendChild(el);
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
  rank.textContent = `${r.tied ? "tied " : ""}${ordinal(r.rank)}`;
  const line = document.createElement("span");
  line.append(name, value, rank);
  const when = document.createElement("span");
  when.textContent = c.days[day] ?? "";
  c.tip.replaceChildren(when, line);
  c.tip.hidden = false;

  const area = c.tip.offsetParent?.getBoundingClientRect();
  if (!area) return;
  const px = e.clientX - area.left;
  const py = e.clientY - area.top;
  const w = c.tip.offsetWidth;
  const h = c.tip.offsetHeight;
  const left = px + 12 + w > area.width ? px - 12 - w : px + 12;
  const top = Math.min(Math.max(0, py - h - 12), Math.max(0, area.height - h));
  c.tip.style.transform = `translate(${Math.max(0, left)}px, ${top}px)`;
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
  preview(closestOf(e.target, "[data-preview]")?.dataset.team ?? null);
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
