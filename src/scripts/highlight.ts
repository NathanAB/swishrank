// The one interaction on the site: a team shown in several places on a page is highlighted in all of them.
// Every element that shows a team carries data-team. Two kinds of element act on it, each with one action:
// a pick target (data-pick: a chart line or end label, a row of the graph page's table) picks the team on a
// click or Enter and holds no link; a link that names a team (data-preview) only previews it while pointed at
// or focused, and a click just follows it. A page with a rating chart is rendered with a team already picked,
// so without this script it still reads; a page without one highlights nothing until the reader picks. A URL
// hash such as #okc picks that team on load.
import { hashTeam } from "../lib/routes.ts";

const marks = () => document.querySelectorAll<HTMLElement | SVGElement>("[data-team]");

function paint(cls: "sel" | "hov", team: string | null) {
  for (const el of marks()) el.classList.toggle(cls, el.dataset.team === team);
  // Lines and curves are drawn in order, so the highlighted one moves last to sit on top.
  for (const c of ["hov", "sel"]) for (const el of document.querySelectorAll(`[data-raise].${c}`)) el.parentNode?.appendChild(el);
}

const closestOf = (t: EventTarget | null, selector: string) => (t instanceof Element ? t.closest<HTMLElement | SVGElement>(selector) : null);
const pickOf = (t: EventTarget | null) => closestOf(t, "[data-pick]");

const linked = hashTeam(location.hash, [...document.querySelectorAll<HTMLElement | SVGElement>("[data-pick]")].flatMap((el) => el.dataset.team ?? []));
if (linked) paint("sel", linked);

// Table rows that pick are the keyboard way in; chart lines and labels are the pointer's.
for (const row of document.querySelectorAll<HTMLTableRowElement>("tr[data-pick]")) row.tabIndex = 0;

document.addEventListener("click", (e) => {
  const pick = pickOf(e.target);
  if (pick) paint("sel", pick.dataset.team ?? null);
});
document.addEventListener("keydown", (e) => {
  const pick = pickOf(e.target);
  if (pick && pick === e.target && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    paint("sel", pick.dataset.team ?? null);
  }
});

let previewed: string | null = null;
const preview = (t: EventTarget | null) => {
  const team = closestOf(t, "[data-pick], [data-preview]")?.dataset.team ?? null;
  if (team !== previewed) paint("hov", (previewed = team));
};
document.addEventListener("pointerover", (e) => preview(e.target));
document.addEventListener("focusin", (e) => preview(e.target));
document.addEventListener("focusout", (e) => preview(e.relatedTarget));
