import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SURFACE, coloursOf, lineColor, pairStyles, tintStyles } from "./tint.ts";

test("a team draws in its exact primary colour where it shows clearly: the Celtics' green", () => {
  const celtics = { name: "Boston Celtics", short: "Celtics", color: "008348", alternateColor: "ffffff" };
  assert.deepEqual(tintStyles({ BOS: celtics }), { BOS: "--tint: #008348" });
});

test("a primary too dark to show draws as a lighter shade of itself, not the alternate: the Jazz stay purple and the Knicks blue", () => {
  assert.equal(lineColor({ color: "4e008e", alternateColor: "79a3dc" }), "#8d02ff");
  assert.equal(lineColor({ color: "1d428a", alternateColor: "f58426" }), "#2a60c9");
  assert.equal(lineColor({ color: "98002e", alternateColor: "000000" }), "#cb003d");
});

test("a black primary, which has no shade but grey, gives way to the exact alternate: the Spurs draw silver", () => {
  assert.equal(lineColor({ color: "000000", alternateColor: "C4CED4" }), "#c4ced4");
});

test("two teams whose colours read as one on a bar split them: the away side takes its other colour", () => {
  const knicks = { color: "1d428a", alternateColor: "f58426" };
  assert.deepEqual(pairStyles({ color: "1d428a", alternateColor: "c8102e" }, knicks), ["--tint: #c8102e", "--tint: #2a60c9"]);
  assert.deepEqual(pairStyles(knicks, { color: "1d428a", alternateColor: "e01234" }), ["--tint: #f58426", "--tint: #2a60c9"]);
});

test("a bar never switches a team to a colour that vanishes: the Nets stay white beside the Spurs' silver, not black", () => {
  assert.deepEqual(pairStyles({ color: "000000", alternateColor: "ffffff" }, { color: "000000", alternateColor: "c4ced4" }), ["--tint: #ffffff", "--tint: #c4ced4"]);
});

test("where the away side has no other colour that shows, the home side switches", () => {
  const spurs = { color: "000000", alternateColor: "c4ced4" };
  assert.deepEqual(pairStyles(spurs, { color: "c4ced4", alternateColor: "c8102e" }), ["--tint: #c4ced4", "--tint: #c8102e"]);
});

test("the surface tint.ts reads against is the chart's --surface in styles/global.css", () => {
  const css = readFileSync(new URL("../styles/global.css", import.meta.url), "utf8");
  const surfaces = [...css.matchAll(/--surface:\s*#([0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase());
  assert.deepEqual(surfaces, [SURFACE]);
});

test("a past season draws each franchise in this season's colours, and keeps its own for a team gone since", () => {
  const team = (name: string, color: string) => ({ name, short: name, color, alternateColor: "1d428a" });
  const past = { GS: team("Warriors 2022", "1d428a"), SEA: team("SuperSonics", "00653a") };
  const out = coloursOf(past, { GS: team("Warriors", "fdb927") });
  assert.deepEqual([out.GS.name, out.GS.color, out.SEA.color], ["Warriors 2022", "fdb927", "00653a"]);
});
