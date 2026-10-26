// Each team's colour for drawing its line on the chart, per theme: its exact primary brand colour, unless that
// all but vanishes into the theme's surface (a black primary on the dark one), where it draws in its exact
// alternate instead. The pages show it as the --tint-light and --tint-dark custom properties, and
// styles/global.css picks the theme's one as --tint.
import type { Abbr, Team } from "./elo.ts";

/** The chart's surface in each theme: --surface in styles/global.css. */
export const SURFACE = { light: "f6f6f6", dark: "131313" } as const;
export type Theme = keyof typeof SURFACE;
/** Below this contrast against the surface a line can hardly be seen. */
const MIN_CONTRAST = 1.5;

const channels = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** The team's line colour on `theme`'s chart surface, as "#rrggbb". */
export function lineColor(team: Pick<Team, "color" | "alternateColor">, theme: Theme) {
  const surface = SURFACE[theme];
  const pick = contrast(team.color, surface) >= MIN_CONTRAST ? team.color : team.alternateColor;
  return `#${pick.toLowerCase()}`;
}

/** Each team's style attribute for what draws it on a chart: its line colour in both themes. */
export const tintStyles = (teams: Record<Abbr, Team>): Record<Abbr, string> =>
  Object.fromEntries(Object.entries(teams).map(([a, t]) => [a, `--tint-light: ${lineColor(t, "light")}; --tint-dark: ${lineColor(t, "dark")}`]));
