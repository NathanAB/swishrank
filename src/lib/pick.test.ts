import { test } from "node:test";
import assert from "node:assert/strict";
import { nearestLine } from "./pick.ts";

test("the day comes from x: where two lines cross, the same height picks a different team on each side", () => {
  const lines = [
    { team: "UP", ys: [100, 60, 0] },
    { team: "DOWN", ys: [0, 40, 100] },
  ];
  assert.deepEqual([nearestLine(lines, 0, 90), nearestLine(lines, 1, 90)], ["UP", "DOWN"]);
});

test("the whole plot is the target: a point far from every line still picks the nearest one", () => {
  const lines = [
    { team: "TOP", ys: [60, 60] },
    { team: "MID", ys: [150, 150] },
    { team: "LOW", ys: [240, 240] },
  ];
  assert.deepEqual([nearestLine(lines, 0.3, 0), nearestLine(lines, 0.3, 110), nearestLine(lines, 0.3, 300)], ["TOP", "MID", "LOW"]);
  assert.equal(nearestLine([], 0.3, 120), null);
});

test("a point just past either edge of the plot reads the first or the last day", () => {
  const lines = [
    { team: "UP", ys: [100, 50, 0] },
    { team: "DOWN", ys: [0, 50, 100] },
  ];
  assert.deepEqual([nearestLine(lines, -0.3, 90), nearestLine(lines, 1.3, 90)], ["UP", "DOWN"]);
});

test("lines that start together are told apart just past the first day, where they are drawn apart", () => {
  const lines = [
    { team: "UP", ys: [100, 0, 0] },
    { team: "DOWN", ys: [100, 200, 200] },
  ];
  assert.equal(nearestLine(lines, 0.2, 150), "DOWN");
});

test("lines that coincide go to the earlier line", () => {
  const lines = [
    { team: "A", ys: [40, 40] },
    { team: "B", ys: [40, 40] },
    { team: "C", ys: [40, 40] },
  ];
  assert.equal(nearestLine(lines, 0.5, 40), "A");
});

