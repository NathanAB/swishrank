import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SURFACE, lineColor, tintStyles, type Theme } from "./tint.ts";

const knicks = { name: "New York Knicks", short: "Knicks", color: "1d428a", alternateColor: "f58426" };

test("a team draws in its primary where that reads and its alternate where only that does: the Knicks are blue on light, orange on dark", () => {
  assert.deepEqual(tintStyles({ NY: knicks }), { NY: "--tint-light: #1d428a; --tint-dark: #f58426" });
});

// WCAG 2's contrast ratio, worked out here rather than taken from tint.ts.
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

test("when neither colour reads, the primary moves away from the surface just until it does, keeping its hue", () => {
  const cases: [Theme, { color: string; alternateColor: string }, (c: number[]) => boolean][] = [
    // The Heat's dark red and black both sink into the dark surface: it lightens, still red.
    ["dark", { color: "98002e", alternateColor: "000000" }, ([r, g, b]) => r > g && r > b],
    // Yellow and white both wash out on the light surface: it darkens, still yellow.
    ["light", { color: "fdb927", alternateColor: "ffffff" }, ([r, g, b]) => r > b && g > b],
  ];
  for (const [theme, team, sameHue] of cases) {
    const c = lineColor(team, theme);
    const k = ratio(c, `#${SURFACE[theme]}`);
    assert.ok(k >= 3 && k < 3.3, `${c} on the ${theme} surface is ${k.toFixed(2)}:1, just past 3:1`);
    assert.ok(sameHue(rgb(c)), `${c} keeps the hue of #${team.color}`);
  }
});

test("the surfaces tint.ts reads against are the chart's --surface in styles/global.css, light then dark", () => {
  const css = readFileSync(new URL("../styles/global.css", import.meta.url), "utf8");
  const surfaces = [...css.matchAll(/--surface:\s*#([0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase());
  assert.deepEqual(surfaces, [SURFACE.light, SURFACE.dark]);
});
