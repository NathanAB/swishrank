// The one interaction on the site: pick a team to highlight it everywhere on the page. Every element
// that shows a team carries data-team; the ones a reader can pick (table rows, chart labels) also carry
// data-pick. The page is rendered with a team already highlighted, so without this script it still reads.
const marks = () => document.querySelectorAll<HTMLElement | SVGElement>("[data-team]");

function paint(cls: "sel" | "hov", team: string | null) {
  for (const el of marks()) el.classList.toggle(cls, el.dataset.team === team);
  // Lines and curves are drawn in order, so the highlighted one moves last to sit on top.
  for (const c of ["hov", "sel"]) for (const el of document.querySelectorAll(`[data-raise].${c}`)) el.parentNode?.appendChild(el);
}

const pickOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement | SVGElement>("[data-pick]") : null);

// Table rows are the keyboard way in; chart labels are a pointer shortcut to the same choice.
for (const row of document.querySelectorAll<HTMLTableRowElement>("tr[data-pick]")) row.tabIndex = 0;

document.addEventListener("click", (e) => {
  const pick = pickOf(e.target);
  if (pick && !(e.target instanceof Element && e.target.closest("a"))) paint("sel", pick.dataset.team ?? null);
});
document.addEventListener("keydown", (e) => {
  const pick = pickOf(e.target);
  if (pick && pick === e.target && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    paint("sel", pick.dataset.team ?? null);
  }
});
let hovered: string | null = null;
document.addEventListener("pointerover", (e) => {
  const team = pickOf(e.target)?.dataset.team ?? null;
  if (team !== hovered) paint("hov", (hovered = team));
});
