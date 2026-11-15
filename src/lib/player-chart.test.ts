import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dayView, fitSteps, frame, LABEL_PX, parseChartData, positions, rangeFrom, rangeLabel, ranking, reignStart, rowSteps, runsAtTop, segments, spread, weeksAtTop } from "./player-chart.ts";
import type { PlayerTimeline, TimelinePlayer } from "./player-timeline.ts";

const player = (name: string, v: (number | null)[], stints: [number, string][] = [[0, "A"]]): TimelinePlayer => ({ id: name.charCodeAt(0), name, v, stints });
/** Eight players rated 0 throughout, so with two more every sample has a full list of ten. */
const fillers = (n: number) => Array.from({ length: 8 }, (_, k) => ({ ...player(`f${k}`, Array(n).fill(0)), id: 1000 + k }));

// Two seasons of three samples each: Oct 1, 8 and 15 of 2024, then Oct 1, 8 and 22 of 2025.
const days = ["2024-10-01", "2024-10-08", "2024-10-15", "2025-10-01", "2025-10-08", "2025-10-22"];
const seasons = [{ id: "2024-25", label: "2024–25", from: 0, to: 2 }, { id: "2025-26", label: "2025–26", from: 3, to: 5 }];
const table = (...players: TimelinePlayer[]): PlayerTimeline => ({ days, seasons, players: [...players, ...fillers(days.length)] });

test("a day's ranking runs best first, an exact tie going to the name first in the alphabet, and leaves out the unranked", () => {
  const t = table(player("Bo", [10, 0, 0, 0, 0, 0]), player("Al", [10, 0, 0, 0, 0, 0]), player("Cy", [12, 0, 0, 0, 0, 0]), player("Di", [null, 0, 0, 0, 0, 0]));
  assert.deepEqual(ranking(t, 0).slice(0, 3).map((p) => p.name), ["Cy", "Al", "Bo"]);
  assert.equal(ranking(t, 0).length, 11, "Di has no rating on the first day");
});

test("runs at No. 1 join the samples one player led in a row, and break where another leads", () => {
  // Al leads the first two samples and the last two, Bo the two between.
  const t = table(player("Al", [9, 9, 1, 1, 9, 9]), player("Bo", [5, 5, 5, 5, 5, 5]));
  assert.deepEqual(runsAtTop(t, 0, 5).map((r) => [r.player.name, r.from, r.to]), [["Al", 0, 1], ["Bo", 2, 3], ["Al", 4, 5]]);
  assert.equal(reignStart(t, 5), 4, "Al's latest run began at sample 4");
  assert.equal(reignStart(t, 3), 2);
});

test("time at No. 1 adds each stretch from a sample a player led to the next, and leaves the summer out", () => {
  // Al leads every sample: 7 + 7 days in 2024-25, the summer to Oct 1, 2025 not counted, then 7 + 14 days.
  const t = table(player("Al", [9, 9, 9, 9, 9, 9]), player("Bo", [5, 5, 5, 5, 5, 5]));
  const al = t.players[0];
  assert.equal(weeksAtTop(t, al, 5), 5);
  assert.equal(weeksAtTop(t, al, 4), 3, "only time already passed by the day counts");
});

test("the timeline sets seasons end to end, each as long as its days, with a 10-day gap for the summer", () => {
  assert.deepEqual(positions(table()), [0, 7, 14, 24, 31, 45]);
});

test("a range starts at the newest season's first sample, or the first sample with a full list", () => {
  // With Al rated from the second sample on, the list is full of ten from there.
  const t = table(player("Al", [null, 9, 9, 9, 9, 9]), player("Bo", [5, 5, 5, 5, 5, 5]));
  assert.equal(rangeFrom(t, "season"), 3);
  assert.equal(rangeFrom(t, "all"), 1);
});

test("a line is cut into one stretch per team, the two sharing the point where he changed, and broken where he has no rating", () => {
  // The axis runs from its floor, 20, to 85, five above the top rating rounded up to ten, down the plot's 420 px. The
  // samples sit 0, 7, 14, 24, 31 and 45 days along the 45 the timeline spans, across its 1000.
  const p = player("Al", [40, 40, 40, null, 80, 80], [[0, "A"], [2, "B"]]);
  const f = frame(table(p), "all");
  assert.deepEqual(segments(p, f), [
    { team: "A", points: "0.0,290.8 155.6,290.8 311.1,290.8" },
    { team: "B", points: "311.1,290.8" },
    { team: "B", points: "688.9,32.3 1000.0,32.3" },
  ]);
});

test("labels keep their points' heights where they can, at least a pitch apart and inside the plot", () => {
  assert.deepEqual(spread([300, 100, 105], 16, 420), [300, 100, 116]);
  assert.deepEqual(spread([410, 412], 16, 420), [396, 412], "two labels at the foot push up from it");
});

test("a strip name shows at the strip widths at which its block holds it with room to spare", () => {
  // "Al" is 0.727 + 0.329 em wide, 11.6 px at 11 px, plus 6 px of air and the 2 px gap: 19.6 px. A block a twentieth
  // of the strip is 18 px wide at 360 and 24 px at 480.
  assert.deepEqual(fitSteps("Al", 11, 0.05), [480, 600, 720, 840, 960, 1080]);
  assert.deepEqual(fitSteps("Al", 11, 0.01), [], "10.8 px even at 1080");
});

test("a row of labels keeps each that starts clear of the last one kept and ends inside the row", () => {
  // "Al" takes 17.6 px with its air. The second starts 3% across, clear of the first from 587 px; the third, 98% across,
  // ends inside the row from 880 px.
  const row = rowSteps([{ text: "Al", share: 0 }, { text: "Al", share: 0.03 }, { text: "Al", share: 0.98 }], 11);
  assert.deepEqual(row, [[240, 360, 480, 600, 720, 840, 960, 1080], [600, 720, 840, 960, 1080], [960, 1080]]);
});

test("the fetched table is taken only when every part of it has its shape", () => {
  const good = { days: ["2026-01-01"], seasons: [{ id: "x", label: "x", from: 0, to: 0 }], players: [{ id: 1, name: "Al", v: [9], stints: [[0, "A"]] }], teams: { A: { short: "Aces", tint: "#ffffff" } }, links: { 1: "/players/al-1/" } };
  assert.deepEqual(parseChartData(good), good);
  assert.equal(parseChartData({ ...good, links: { 1: 7 } }), null, "a link that is not a path");
  assert.equal(parseChartData({ ...good, players: [{ id: 1, name: "Al", v: [9, 8], stints: [] }] }), null, "a rating per day, no more");
  assert.equal(parseChartData({ ...good, teams: { A: { short: "Aces" } } }), null, "a team without its colour");
});

test("the switch names the newest season with ratings by its label, so it is right before a new season's first game too", () => {
  const t = table(player("Al", [9, 9, 9, 9, 9, 9]));
  assert.equal(rangeLabel(t, "season"), "2025–26");
  assert.equal(rangeLabel(t, "all"), "Since 2024");
});

test("a label is measured at the size global.css sets it", () => {
  const css = readFileSync(new URL("../styles/global.css", import.meta.url), "utf8");
  const px = (token: string) => Number(css.match(new RegExp(`--${token}: (\\d+)px;`))?.[1]);
  assert.deepEqual(LABEL_PX, { tiny: px("fs-tiny"), small: px("fs-small") });
});

test("a day's header gives the No. 1's rating, his lead as the gap between the two ratings shown, and his time at No. 1", () => {
  // Al, 9.6, shows as 10 and Bo, 5.4, as 5: the lead reads +5, though the ratings are 4.2 apart.
  const t = table(player("Al", [9.6, 9.6, 9.6, 9.6, 9.6, 9.6]), player("Bo", [5.4, 5.4, 5.4, 5.4, 5.4, 5.4]));
  const d = { ...t, teams: { A: { short: "Aces", tint: "#123456" } }, links: { 65: "/players/al-65/" } };
  const f = frame(d, "all");
  const view = dayView(d, f, runsAtTop(d, f.from, f.to), 5);
  assert.equal(view.date, "Oct 22, 2025");
  assert.deepEqual(view.lead, { name: "Al", team: "Aces", tint: "#123456", rating: "10", since: "Oct 2024" });
  assert.deepEqual(view.figures.map((fig) => fig.value), ["10", "+5", "Oct 2024", "5"]);
  assert.deepEqual(view.board.slice(0, 2).map((row) => row.id), [65, 66]);
  assert.equal(view.board.length, 10);
  assert.match(view.board[0].row, /<a class="nm" href="\/players\/al-65\/">Al<i>Aces<\/i><\/a>/, "a player with a page is a link to it");
  assert.match(view.board[1].row, /<span class="nm">Bo</, "a player without one is not");
});
