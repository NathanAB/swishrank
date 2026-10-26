// The one interaction on the site: a team shown in several places on a page is highlighted in all of them.
// Every element that shows a team carries data-team. Three kinds of element act on it: a rating chart's plot
// (data-plot) previews the team whose line is nearest the pointer and picks it on a click or tap; a chart's
// team menu (data-pick-select) picks the team chosen in it; and an element that names a team (data-preview: a
// league table row's link, a dot on its scale) only previews it while pointed at or focused, and a click on a
// link just follows it. A page with a rating chart is rendered with a team already picked, so without this
// script it still reads; a page without one highlights nothing until the reader picks. The URL hash names the pick: #okc picks the Thunder on load and whenever the hash
// changes, and a pick rewrites the hash in place, so a reload or a shared link shows the same team and
// picking adds no history entries.
import { nearestLine, type PlotLine } from "../lib/pick.ts";
import { hashTeam, teamSlug } from "../lib/routes.ts";

const marks = () => document.querySelectorAll<HTMLElement | SVGElement>("[data-team]");

function paint(cls: "sel" | "hov", team: string | null) {
  for (const el of marks()) el.classList.toggle(cls, el.dataset.team === team);
  // Lines and curves are drawn in order, so the highlighted one moves last to sit on top.
  for (const c of ["hov", "sel"]) for (const el of document.querySelectorAll(`[data-raise].${c}`)) el.parentNode?.appendChild(el);
}

const closestOf = (t: EventTarget | null, selector: string) => (t instanceof Element ? t.closest<HTMLElement | SVGElement>(selector) : null);
const plotOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<SVGSVGElement>("svg[data-plot]") : null);

// Each plot's lines as drawn, read once before any line is raised, so ties go the same way all session.
const plots = new Map<SVGSVGElement, PlotLine[]>(
  [...document.querySelectorAll<SVGSVGElement>("svg[data-plot]")].map((plot) => [
    plot,
    [...plot.querySelectorAll<SVGPolylineElement>("polyline[data-team]")].map((l) => ({ team: l.dataset.team ?? "", ys: Array.from(l.points, (p) => p.y) })),
  ]),
);
const pickable = [...document.querySelectorAll<SVGElement>("svg[data-plot] [data-team]")].flatMap((el) => el.dataset.team ?? []);
const menus = document.querySelectorAll<HTMLSelectElement>("[data-pick-select]");
let picked = document.querySelector<SVGElement>("svg[data-plot] .sel")?.dataset.team ?? null;

function pick(team: string | null) {
  if (!team) return;
  picked = team;
  paint("sel", team);
  for (const menu of menus) menu.value = team;
  history.replaceState(history.state, "", `#${teamSlug(team)}`);
}

/** The team whose line on `plot` is nearest the pointer. */
function lineAt(e: MouseEvent, plot: SVGSVGElement) {
  const box = plot.getBoundingClientRect();
  const y = ((e.clientY - box.top) / box.height) * plot.viewBox.baseVal.height;
  return nearestLine(plots.get(plot) ?? [], (e.clientX - box.left) / box.width, y, picked);
}

const fromHash = () => pick(hashTeam(location.hash, pickable));
fromHash();
window.addEventListener("hashchange", fromHash);

// The team menu is the keyboard way in; the plot is the pointer's.
for (const menu of menus) menu.addEventListener("change", () => pick(menu.value));

document.addEventListener("click", (e) => {
  const plot = plotOf(e.target);
  if (plot) pick(lineAt(e, plot));
});

let previewed: string | null = null;
const preview = (team: string | null) => {
  if (team !== previewed) paint("hov", (previewed = team));
};
const pointed = (e: PointerEvent) => {
  const plot = plotOf(e.target);
  preview(plot ? lineAt(e, plot) : (closestOf(e.target, "[data-preview]")?.dataset.team ?? null));
};
document.addEventListener("pointerover", pointed);
for (const plot of plots.keys()) plot.addEventListener("pointermove", pointed);
document.addEventListener("focusin", (e) => preview(closestOf(e.target, "[data-preview]")?.dataset.team ?? null));
document.addEventListener("focusout", (e) => preview(closestOf(e.relatedTarget, "[data-preview]")?.dataset.team ?? null));
