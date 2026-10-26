import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SURFACE, coloursOf, lineColor, tintStyles } from "./tint.ts";

test("a team draws in its exact primary colour in both themes, even one that reads faintly: the Knicks are blue on light and dark", () => {
  const knicks = { name: "New York Knicks", short: "Knicks", color: "1d428a", alternateColor: "f58426" };
  assert.deepEqual(tintStyles({ NY: knicks }), { NY: "--tint-light: #1d428a; --tint-dark: #1d428a" });
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
