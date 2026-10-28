import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SURFACE, coloursOf, lineColor, pairStyles, tintStyles } from "./tint.ts";

test("a team draws in its exact primary colour where it shows clearly, and its alternate where it doesn't: the Knicks are blue on light and orange on dark", () => {
  const knicks = { name: "New York Knicks", short: "Knicks", color: "1d428a", alternateColor: "f58426" };
  assert.deepEqual(tintStyles({ NY: knicks }), { NY: "--tint-light: #1d428a; --tint-dark: #f58426" });
});

test("a faint primary keeps itself when its alternate is fainter still: the Heat stay red on dark rather than black", () => {
  assert.equal(lineColor({ color: "98002e", alternateColor: "000000" }, "dark"), "#98002e");
});

test("two teams whose colours read as one on a bar split them: the away side takes its other colour", () => {
  const pistons = { color: "1d42ba", alternateColor: "c8102e" };
  const knicks = { color: "1d428a", alternateColor: "f58426" };
  const [away, home] = pairStyles(pistons, knicks);
  assert.equal(away, "--tint-light: #c8102e; --tint-dark: #c8102e");
  assert.equal(home, "--tint-light: #1d428a; --tint-dark: #f58426");
  assert.deepEqual(pairStyles({ color: "007a33", alternateColor: "ba9653" }, knicks), ["--tint-light: #007a33; --tint-dark: #007a33", home]);
  const [warriors] = pairStyles({ color: "fdb927", alternateColor: "1d428a" }, { color: "266092", alternateColor: "79bc43" });
  assert.equal(warriors, "--tint-light: #fdb927; --tint-dark: #fdb927");
});

test("a bar never switches a team to a colour that vanishes: the Spurs stay silver beside the Jazz on dark, not black", () => {
  const [spurs] = pairStyles({ color: "000000", alternateColor: "c4ced4" }, { color: "4e008e", alternateColor: "79a3dc" });
  assert.equal(spurs, "--tint-light: #000000; --tint-dark: #c4ced4");
  const [celtics] = pairStyles({ color: "008348", alternateColor: "ffffff" }, { color: "008ca8", alternateColor: "1d1060" });
  assert.equal(celtics, "--tint-light: #008348; --tint-dark: #ffffff");
});

test("where the away side has no other colour that shows, the home side switches: the Nuggets turn gold beside the Nets' black on light", () => {
  const [nets, nuggets] = pairStyles({ color: "000000", alternateColor: "ffffff" }, { color: "0e2240", alternateColor: "fec524" });
  assert.equal(nets, "--tint-light: #000000; --tint-dark: #ffffff");
  assert.equal(nuggets, "--tint-light: #fec524; --tint-dark: #fec524");
});

test("a primary that vanishes into the surface gives way to the exact alternate: black on dark, white on light", () => {
  const team = { color: "000000", alternateColor: "C4CED4" };
  assert.equal(lineColor(team, "dark"), "#c4ced4");
  assert.equal(lineColor({ color: "FFFFFF", alternateColor: "002B5C" }, "light"), "#002b5c");
  assert.equal(lineColor(team, "light"), "#000000");
});

test("the surfaces tint.ts reads against are the chart's --surface in styles/global.css, light then dark", () => {
  const css = readFileSync(new URL("../styles/global.css", import.meta.url), "utf8");
  const surfaces = [...css.matchAll(/--surface:\s*#([0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase());
  assert.deepEqual(surfaces, [SURFACE.light, SURFACE.dark]);
});

test("a past season draws each franchise in this season's colours, and keeps its own for a team gone since", () => {
  const team = (name: string, color: string) => ({ name, short: name, color, alternateColor: "1d428a" });
  const past = { GS: team("Warriors 2022", "1d428a"), SEA: team("SuperSonics", "00653a") };
  const out = coloursOf(past, { GS: team("Warriors", "fdb927") });
  assert.deepEqual([out.GS.name, out.GS.color, out.SEA.color], ["Warriors 2022", "fdb927", "00653a"]);
});
