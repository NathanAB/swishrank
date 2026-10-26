// The one interaction on the site: a team shown in several places on a page is highlighted in all of them
// while the reader points at or focuses one. Every element that shows a team carries data-team. Two kinds of
// element preview a team: a rating chart's plot (data-plot) previews the team whose line is nearest the
// pointer, and an element that names a team (data-preview: a league table row's link, a dot on its scale)
// previews it while pointed at or focused. A click on a link just follows it.
import { nearestLine, type PlotLine } from "../lib/pick.ts";

const closestOf = (t: EventTarget | null, selector: string) => (t instanceof Element ? t.closest<HTMLElement | SVGElement>(selector) : null);
const plotOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<SVGSVGElement>("svg[data-plot]") : null);

// Each plot's lines as drawn, read once before any line is raised, so ties go the same way all session.
const plots = new Map<SVGSVGElement, PlotLine[]>(
  [...document.querySelectorAll<SVGSVGElement>("svg[data-plot]")].map((plot) => [
    plot,
    [...plot.querySelectorAll<SVGPolylineElement>("polyline[data-team]")].map((l) => ({ team: l.dataset.team ?? "", ys: Array.from(l.points, (p) => p.y) })),
  ]),
);

/** The team whose line on `plot` is nearest the pointer. */
function lineAt(e: MouseEvent, plot: SVGSVGElement) {
  const box = plot.getBoundingClientRect();
  const y = ((e.clientY - box.top) / box.height) * plot.viewBox.baseVal.height;
  return nearestLine(plots.get(plot) ?? [], (e.clientX - box.left) / box.width, y);
}

let previewed: string | null = null;
const preview = (team: string | null) => {
  if (team === previewed) return;
  previewed = team;
  for (const el of document.querySelectorAll<HTMLElement | SVGElement>("[data-team]")) el.classList.toggle("hov", el.dataset.team === team);
  // Lines and curves are drawn in order, so the previewed one moves last to sit on top, under a team page's own line.
  for (const c of ["hov", "own"]) for (const el of document.querySelectorAll(`[data-raise].${c}`)) el.parentNode?.appendChild(el);
};
const pointed = (e: PointerEvent) => {
  const plot = plotOf(e.target);
  preview(plot ? lineAt(e, plot) : (closestOf(e.target, "[data-preview]")?.dataset.team ?? null));
};
document.addEventListener("pointerover", pointed);
for (const plot of plots.keys()) plot.addEventListener("pointermove", pointed);
document.addEventListener("focusin", (e) => preview(closestOf(e.target, "[data-preview]")?.dataset.team ?? null));
document.addEventListener("focusout", (e) => preview(closestOf(e.relatedTarget, "[data-preview]")?.dataset.team ?? null));
