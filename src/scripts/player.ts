// A player's rating chart (src/pages/players/[player].astro), drawn at its card's size and again whenever that
// changes: his line in the colour of each team he played for, a dashed line and the team's name where he changed team,
// his stretches at No. 1 shaded, and a readout of any sample under the pointer, a finger or the arrow keys.
import { dayWithYear, figure, monthShort, placeLabel } from "../lib/format.ts";
import type { Sample } from "../lib/player-page.ts";
import { fitAxis, teamLabels } from "../lib/player-plot.ts";
import { placeTip } from "./tip.ts";

/** What the page hands the chart: his samples, his teams by day, each season's first day and the teams' looks. */
export type ChartIn = {
  name: string;
  series: Sample[];
  stints: [string, string][];
  /** The first day of the season under way, or null for a player out of the league: his chart is his career. */
  seasonFrom: string | null;
  seasons: { label: string; from: string; to: string }[];
  teams: Record<string, { short: string; tint: string }>;
};

const num = (v: number) => figure(Math.round(v));
const PAD = { left: 34, right: 8, bottom: 24, top: 8, named: 22 };
const LABEL = 11;

function start(root: HTMLElement) {
  const d = JSON.parse(root.querySelector("[data-chart-data]")!.textContent!) as ChartIn;
  const area = root.querySelector<HTMLElement>("[data-chart]")!;
  const tip = root.querySelector<HTMLElement>("[data-tip]")!;
  const live = root.querySelector<HTMLElement>("[data-live]")!;
  const legend = root.querySelector<HTMLElement>("[data-legend]")!;
  const look = (a: string | undefined) => (a && d.teams[a]) || { short: a ?? "", tint: "var(--line-other)" };
  const teamOn = (day: string) => {
    let t = d.stints[0]?.[1];
    for (const [k, a] of d.stints) if (k <= day) t = a;
    return t;
  };
  let range = d.seasonFrom ? "season" : "career";
  for (const b of root.querySelectorAll<HTMLButtonElement>("button[data-value]")) {
    b.addEventListener("click", () => {
      range = b.dataset.value!;
      for (const o of root.querySelectorAll("button[data-value]")) o.setAttribute("aria-pressed", String(o === b));
      draw();
    });
  }

  function draw() {
    const pts = range === "season" && d.seasonFrom ? d.series.filter(([day]) => day >= d.seasonFrom!) : d.series;
    if (!pts.length) return;
    const W = area.clientWidth, H = area.clientHeight;
    const vs = pts.map((p) => p[1]);
    const segs: { team: string | undefined; i: number; p: [number, number][] }[] = [];
    const top = new Set(pts.map(([day]) => teamOn(day))).size > 1 ? PAD.named : PAD.top;
    const axis = fitAxis(Math.min(...vs), Math.max(...vs));
    const x = (i: number) => PAD.left + (i / Math.max(1, pts.length - 1)) * (W - PAD.left - PAD.right);
    const y = (v: number) => top + (1 - (v - axis.lo) / (axis.hi - axis.lo)) * (H - top - PAD.bottom);
    let g = "";
    for (const v of axis.ticks) g += `<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v)}" y2="${y(v)}" class="${v === 0 ? "zero" : "grid"}"/><text x="${PAD.left - 8}" y="${y(v) + 4}" text-anchor="end">${num(v)}</text>`;
    let from: number | null = null;
    pts.forEach(([, , rank], i) => {
      const one = rank === 1;
      if (one && from === null) from = i;
      if ((!one || i === pts.length - 1) && from !== null) {
        const to = one ? i : i - 1;
        g += `<rect class="one" x="${x(from)}" y="${top}" width="${Math.max(2, x(to) - x(from))}" height="${H - top - PAD.bottom}"/><line class="one-edge" x1="${x(from)}" x2="${x(to)}" y1="${top}" y2="${top}"/>`;
        from = null;
      }
    });
    let last = "";
    pts.forEach(([day], i) => {
      if (range === "season") {
        const month = day.slice(0, 7);
        if (month !== last) {
          last = month;
          if (x(i) < W - 24) g += `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : "middle"}">${monthShort(month)}</text>`;
        }
      } else {
        const s = d.seasons.find((s) => day >= s.from && day <= s.to);
        if (s && s.label !== last) {
          last = s.label;
          if (x(i) < W - 30) g += `<line class="tick" x1="${x(i)}" x2="${x(i)}" y1="${H - PAD.bottom}" y2="${H - PAD.bottom + 4}"/><text x="${x(i) + 2}" y="${H - 6}">’${s.label.slice(2, 4)}</text>`;
        }
      }
    });
    pts.forEach(([day, v], i) => {
      const team = teamOn(day);
      if (!segs.length || segs.at(-1)!.team !== team) segs.push({ team, i, p: segs.length ? [segs.at(-1)!.p.at(-1)!] : [] });
      segs.at(-1)!.p.push([x(i), y(v)]);
    });
    if (segs.length > 1) {
      const at = teamLabels(segs.map((s, k) => ({ x: k === 0 ? PAD.left : x(s.i), text: look(s.team).short })), PAD.left, W - PAD.right, LABEL);
      segs.forEach((s, k) => {
        if (k > 0) g += `<line class="trade" x1="${x(s.i)}" x2="${x(s.i)}" y1="${top - 4}" y2="${H - PAD.bottom}"/>`;
        if (at[k] !== null) g += `<text class="team" x="${at[k]}" y="${top - 8}">${look(s.team).short}</text>`;
      });
    }
    const lines = segs.map((s) => `<path d="M${s.p.map((q) => q.map((n) => n.toFixed(1)).join(",")).join("L")}" stroke="${look(s.team).tint}"/>`).join("");
    const label = `${d.name}'s rating${pts.length > 1 ? `, from ${num(pts[0][1])} on ${dayWithYear(pts[0][0])} to ${num(pts.at(-1)![1])} on ${dayWithYear(pts.at(-1)![0])}` : ""}. Use the arrow keys to read each day.`;
    area.querySelector("svg")?.remove();
    area.insertAdjacentHTML("afterbegin", `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" tabindex="0" role="img" aria-label="${label}">${g}<g class="line">${lines}</g><circle class="end" cx="${x(pts.length - 1)}" cy="${y(pts.at(-1)![1])}" r="4" fill="${look(segs.at(-1)!.team).tint}"/><line class="cross" y1="${top}" y2="${H - PAD.bottom}" opacity="0"/><circle class="dot" r="4" opacity="0"/><rect class="hit" x="${PAD.left}" y="0" width="${W - PAD.left - PAD.right}" height="${H}"/></svg>`);
    const svg = area.querySelector("svg")!, cross = svg.querySelector(".cross")!, dot = svg.querySelector(".dot")!;
    let cur = pts.length - 1;
    const show = (i: number, at?: PointerEvent) => {
      cur = i;
      const [day, v, rank] = pts[i];
      cross.setAttribute("x1", String(x(i)));
      cross.setAttribute("x2", String(x(i)));
      cross.setAttribute("opacity", "1");
      dot.setAttribute("cx", String(x(i)));
      dot.setAttribute("cy", String(y(v)));
      dot.setAttribute("opacity", "1");
      const place = rank === null ? "" : placeLabel(rank, false), when = `${dayWithYear(day)}, ${look(teamOn(day)).short}`;
      tip.innerHTML = `<span><b>${num(v)}</b>${place && `<i>${place}</i>`}</span><span>${when}</span>`;
      tip.hidden = false;
      const box = svg.getBoundingClientRect();
      placeTip({ tip, area, at: at ?? { clientX: box.left + x(i), clientY: box.top + y(v) }, side: "above-or-below" });
      if (!at) live.textContent = [num(v), place, when].filter(Boolean).join(", ");
    };
    const hide = () => {
      tip.hidden = true;
      cross.setAttribute("opacity", "0");
      dot.setAttribute("opacity", "0");
    };
    const sampleAt = (e: PointerEvent) => {
      const box = svg.getBoundingClientRect();
      const share = (e.clientX - box.left - PAD.left) / (W - PAD.left - PAD.right);
      return Math.max(0, Math.min(pts.length - 1, Math.round(share * (pts.length - 1))));
    };
    const hit = svg.querySelector(".hit")!;
    hit.addEventListener("pointerdown", (e) => show(sampleAt(e as PointerEvent), e as PointerEvent));
    hit.addEventListener("pointermove", (e) => show(sampleAt(e as PointerEvent), e as PointerEvent));
    hit.addEventListener("pointerleave", (e) => (e as PointerEvent).pointerType === "mouse" && hide());
    svg.addEventListener("focus", () => show(cur));
    svg.addEventListener("blur", hide);
    svg.addEventListener("keydown", (e) => {
      const step = ({ ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity } as Record<string, number>)[e.key];
      if (step === undefined) return;
      e.preventDefault();
      show(Math.max(0, Math.min(pts.length - 1, cur + step)));
    });
    legend.hidden = !pts.some((p) => p[2] === 1);
  }

  let size = "";
  new ResizeObserver(() => {
    const now = `${area.clientWidth}x${area.clientHeight}`;
    if (now !== size) {
      size = now;
      draw();
    }
  }).observe(area);
}

for (const root of document.querySelectorAll<HTMLElement>("[data-player-chart]")) start(root);
