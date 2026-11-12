// The players page's interactions (src/pages/players/index.astro). The page arrives drawn for today over the newest
// season; once it has loaded, this fetches the table behind it and draws any other day or range with the same
// functions the build used (lib/player-chart.ts). Pointing across the plot shows that day everywhere: the header,
// the top five's lines and labels, the strip's run and the Top 10, whose rows slide to their new places. A click
// holds the day, and leaving the plot returns to the held day, today until one is held. A strip block holds the
// last day of its run. With the chart focused, the left and right arrows step a sample.
import {
  axisLabels, dayView, DEFAULT_RANGE, frame, greyLines, gridLines, nearest, parseChartData, RANGES, runsAtTop, strip, tickLabels,
  type ChartData, type Frame, type Range, type Run,
} from "../lib/player-chart.ts";

const root = document.querySelector<HTMLElement>("[data-players]");
if (root?.dataset.src) {
  fetch(root.dataset.src)
    .then((res) => (res.ok ? res.json() : null))
    .then((raw: unknown) => {
      const d = parseChartData(raw);
      if (d) start(root, d);
    })
    .catch(() => {
      // Without the table the page stays as the build drew it.
    });
}

const isRange = (v: string | undefined): v is Range => RANGES.some((r) => r === v);

function start(root: HTMLElement, d: ChartData) {
  const $ = <T extends Element = HTMLElement>(sel: string) => {
    const el = root.querySelector<T>(sel);
    if (!el) throw new Error(`players page: no ${sel}`);
    return el;
  };
  const top = $("[data-top]"), date = $("[data-date]"), name = $("[data-name]"), team = $("[data-team-name]"), back = $("[data-back]");
  const figures = [...root.querySelectorAll<HTMLElement>("[data-figure]")];
  const area = $("[data-chart-area]"), plot = $("[data-plot-area]"), ticks = $("[data-ticks]"), grid = $<SVGGElement>("[data-grid]");
  const bg = $<SVGGElement>("[data-bg]"), front = $<SVGGElement>("[data-front]"), day = $("[data-day]"), marks = $("[data-marks]");
  const stripEl = $("[data-strip]"), axis = $("[data-axis]"), board = $("[data-board]"), boardDate = $("[data-board-card] .meta");
  const switches = [...root.querySelectorAll<HTMLButtonElement>("[data-range] button")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const last = d.days.length - 1;
  const rows = () => [...board.querySelectorAll<HTMLElement>(":scope > li")];

  let f: Frame = frame(d, DEFAULT_RANGE);
  let runs: Run[] = runsAtTop(d, f.from, f.to);
  let held = last;
  let shown = last;
  let lines = front.innerHTML;

  function show(i: number) {
    if (i === shown) return;
    shown = i;
    const v = dayView(d, f, runs, i);
    date.textContent = v.date;
    name.textContent = v.lead.name;
    team.textContent = v.lead.team;
    top.style.setProperty("--tint", v.lead.tint);
    figures.forEach((el, k) => (el.textContent = v.figures[k]?.value ?? ""));
    back.hidden = i === last;
    // Most days keep the day before's top five, whose lines are then the same markup: it is not parsed again.
    if (v.lines !== lines) front.innerHTML = lines = v.lines;
    marks.innerHTML = v.marks;
    day.style.left = v.at;
    for (const b of stripEl.querySelectorAll<HTMLElement>("[data-run]")) b.classList.toggle("on", Number(b.dataset.run) === v.run);
    boardDate.textContent = v.date;

    // The Top 10: each row moves from where it was to its new place, and a row new to the list fades in.
    const was = new Map(rows().map((li) => [li.dataset.p, li.getBoundingClientRect().top]));
    const have = new Map(rows().map((li) => [li.dataset.p, li]));
    for (const row of v.board) {
      const li = have.get(String(row.id)) ?? document.createElement("li");
      have.delete(String(row.id));
      li.dataset.p = String(row.id);
      li.style.setProperty("--tint", row.tint);
      li.innerHTML = row.row;
      board.append(li);
    }
    for (const li of have.values()) li.remove();
    if (reduced) return;
    for (const li of rows()) {
      const before = was.get(li.dataset.p);
      if (before === undefined) li.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
      else {
        const dy = before - li.getBoundingClientRect().top;
        if (dy) li.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 240, easing: "cubic-bezier(.2,.7,.2,1)" });
      }
    }
  }

  function draw(range: Range) {
    f = frame(d, range);
    runs = runsAtTop(d, f.from, f.to);
    ticks.innerHTML = tickLabels(f);
    grid.innerHTML = gridLines(d, f);
    bg.innerHTML = greyLines(d, f);
    stripEl.innerHTML = strip(d, f, runs);
    axis.innerHTML = axisLabels(d, f);
    for (const b of switches) b.setAttribute("aria-pressed", String(b.dataset.value === range));
    if (held < f.from) held = last;
    shown = -1;
    show(held);
  }

  const sampleAt = (e: MouseEvent) => {
    const r = plot.getBoundingClientRect();
    return nearest(f, (Math.min(Math.max(e.clientX, r.left), r.right) - r.left) / r.width);
  };
  plot.addEventListener("pointermove", (e) => show(sampleAt(e)));
  plot.addEventListener("pointerleave", () => show(held));
  plot.addEventListener("click", (e) => show((held = sampleAt(e))));
  stripEl.addEventListener("click", (e) => {
    const b = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-run]") : null;
    const run = b ? runs[Number(b.dataset.run)] : undefined;
    if (run) show((held = run.to));
  });
  back.addEventListener("click", () => show((held = last)));
  area.addEventListener("keydown", (e) => {
    const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (!step) return;
    e.preventDefault();
    show((held = Math.min(f.to, Math.max(f.from, held + step))));
  });
  for (const b of switches) {
    b.addEventListener("click", () => {
      if (isRange(b.dataset.value)) draw(b.dataset.value);
    });
  }
}
