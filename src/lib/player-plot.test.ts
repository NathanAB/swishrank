import { test } from "node:test";
import assert from "node:assert/strict";
import { fitAxis, teamLabels } from "./player-plot.ts";
import { textWidth } from "./text-width.ts";

test("the rating axis fits his line closely, on round ticks", () => {
  // 115 to 126 with a point of room either side: 114 to 127, on fives.
  assert.deepEqual(fitAxis(115, 126), { lo: 110, hi: 130, step: 5, ticks: [110, 115, 120, 125, 130] });
  // A negative line keeps its own range rather than reaching up to zero.
  assert.deepEqual(fitAxis(-15.2, -10.4), { lo: -18, hi: -8, step: 2, ticks: [-18, -16, -14, -12, -10, -8] });
});

test("a team's name sits after its start, is left out where it would run into the last, and never runs past the plot", () => {
  const marks = [{ x: 34, text: "Pistons" }, { x: 40, text: "Clippers" }, { x: 300, text: "Cavaliers" }, { x: 990, text: "Knicks" }];
  const at = teamLabels(marks, 34, 1000, 11);
  assert.deepEqual(at.slice(0, 3), [34, null, 304]);
  assert.ok(Math.abs(at[3]! + textWidth("Knicks") * 11 - 1000) < 1e-9, "the last ends at the plot's right edge");
  assert.deepEqual(teamLabels([{ x: 34, text: "Pistons" }], 34, 60, 11), [null], "a name wider than the plot is left out");
});
