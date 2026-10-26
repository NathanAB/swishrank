// Each team's colour for drawing its line on the chart, per theme. A thin line needs the 3:1 contrast WCAG asks
// of graphics to read against the chart's surface, so a team draws in its primary colour where that reaches it,
// in its alternate where only that does, and otherwise in its primary lightened on the dark surface or
// darkened on the light one until it does. The pages show it as the --tint-light and --tint-dark custom
// properties, and styles/global.css picks the theme's one as --tint.
import type { Abbr, Team } from "./elo.ts";

/** The chart's surface in each theme: --surface in styles/global.css. */
export const SURFACE = { light: "f6f6f7", dark: "131217" } as const;
export type Theme = keyof typeof SURFACE;
const MIN_CONTRAST = 3;

const channels = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toHex = (rgb: number[]) => rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");

const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const toHsl = (hex: string) => {
  const [r, g, b] = channels(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: d / (1 - Math.abs(2 * l - 1)), l };
};
const fromHsl = (h: number, s: number, l: number) => {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([r + m, g + m, b + m]);
};

/** The colour with its lightness moved away from the surface's, a hundredth at a time, until it reads on it. */
function nudged(hex: string, surface: string) {
  const { h, s, l } = toHsl(hex);
  const step = luminance(surface) < 0.5 ? 0.01 : -0.01;
  for (let k = 1; k < 100; k++) {
    const c = fromHsl(h, s, Math.min(1, Math.max(0, l + k * step)));
    if (contrast(c, surface) >= MIN_CONTRAST) return c;
  }
  return step > 0 ? "ffffff" : "000000";
}

/** The team's line colour on `theme`'s chart surface, as "#rrggbb". */
export function lineColor(team: Pick<Team, "color" | "alternateColor">, theme: Theme) {
  const surface = SURFACE[theme];
  const pick = [team.color, team.alternateColor].find((c) => contrast(c, surface) >= MIN_CONTRAST) ?? nudged(team.color, surface);
  return `#${pick.toLowerCase()}`;
}

/** Each team's style attribute for what draws it on a chart: its line colour in both themes. */
export const tintStyles = (teams: Record<Abbr, Team>): Record<Abbr, string> =>
  Object.fromEntries(Object.entries(teams).map(([a, t]) => [a, `--tint-light: ${lineColor(t, "light")}; --tint-dark: ${lineColor(t, "dark")}`]));
