// Each team's colour for drawing its line on the chart, per theme: its exact primary brand colour, unless that
// is too faint on the theme's surface (navy on the dark one, gold on the light one), where it draws in its exact
// alternate instead, if that shows better. The pages show it as the --tint-light and --tint-dark custom properties, and
// styles/global.css picks the theme's one as --tint.
import type { Abbr, Team } from "./elo.ts";

/** The chart's surface in each theme: --surface in styles/global.css. */
export const SURFACE = { light: "ffffff", dark: "191919" } as const;
export type Theme = keyof typeof SURFACE;
/** Below this contrast against the surface a line is hard to pick out: WCAG's minimum for graphics. */
const MIN_CONTRAST = 3;

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
  const primary = contrast(team.color, surface);
  const pick = primary >= MIN_CONTRAST || contrast(team.alternateColor, surface) <= primary ? team.color : team.alternateColor;
  return `#${pick.toLowerCase()}`;
}

/**
 * `teams` drawn in `now`'s colours wherever `now` has the franchise. ESPN gives each season the colours of its
 * day, so a past season would draw most teams in other colours than this one: the Warriors blue through
 * 2023-24 and gold since.
 */
export const coloursOf = (teams: Record<Abbr, Team>, now: Record<Abbr, Team>): Record<Abbr, Team> =>
  Object.fromEntries(Object.entries(teams).map(([a, t]) => [a, now[a] ? { ...t, color: now[a].color, alternateColor: now[a].alternateColor } : t]));

const style = (light: string, dark: string) => `--tint-light: ${light}; --tint-dark: ${dark}`;

/** Each team's style attribute for what draws it on a chart: its line colour in both themes. */
export const tintStyles = (teams: Record<Abbr, Team>): Record<Abbr, string> =>
  Object.fromEntries(Object.entries(teams).map(([a, t]) => [a, style(lineColor(t, "light"), lineColor(t, "dark"))]));

/** Below this distance in RGB, 0 to 441, two colours side by side read as one. */
const MIN_APART = 100;
const apart = (a: string, b: string) => Math.hypot(...channels(a.slice(1)).map((c, i) => (c - channels(b.slice(1))[i]) * 255));

/** Below this contrast against the surface a colour all but vanishes, as black does on the dark one. */
const MIN_VISIBLE = 1.5;

/**
 * Two teams' style attributes for one bar, away then home. Where their line colours would read as one, such as
 * the Pistons' and the Knicks' blues, one side draws in its other colour instead: the away side first, then the
 * home side, then both, the first pair that tells them apart, or else the furthest apart. That colour may be
 * faint on its own, since beside the other team's it still tells the two apart, but never one that vanishes, so
 * the Spurs never turn black on dark.
 */
export function pairStyles(away: Pick<Team, "color" | "alternateColor">, home: Pick<Team, "color" | "alternateColor">): [string, string] {
  const side = (theme: Theme) => {
    const line = [lineColor(away, theme), lineColor(home, theme)];
    const other = [away, home].map((t, i) => `#${(line[i] === `#${t.color.toLowerCase()}` ? t.alternateColor : t.color).toLowerCase()}`);
    const visible = (c: string) => contrast(c.slice(1), SURFACE[theme]) >= MIN_VISIBLE;
    const pairs = [line, [other[0], line[1]], [line[0], other[1]], other].filter((p) => p.every(visible));
    const gap = (p: string[]) => apart(p[0], p[1]);
    return pairs.find((p) => gap(p) >= MIN_APART) ?? pairs.reduce((best, p) => (gap(p) > gap(best) ? p : best), line);
  };
  const [light, dark] = [side("light"), side("dark")];
  return [style(light[0], dark[0]), style(light[1], dark[1])];
}
