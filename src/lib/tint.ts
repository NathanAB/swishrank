// Each team's colour for drawing its line on the chart: its primary brand colour, or where that is too dark to show
// on the dark surface, such as the Jazz's purple or the Knicks' blue, a lighter shade of it. Black has no shade but
// grey, so a black primary draws in its exact alternate instead, if that shows better. The pages show it as the
// --tint custom property.
import type { Abbr, Team } from "./elo.ts";

/** The chart's surface: --surface in styles/global.css. */
export const SURFACE = "191919";
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

/** Below this HSL saturation a colour reads as grey, and a lighter shade of it is only a lighter grey. */
const MIN_SATURATION = 0.15;

const toHsl = (hex: string) => {
  const [r, g, b] = channels(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};
const fromHsl = (h: number, s: number, l: number) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + l - c / 2) * 255).toString(16).padStart(2, "0")).join("");
};

/** The team's primary as six hex digits, lightened just enough to show on the surface if it can be. */
function primaryShade(team: Pick<Team, "color">) {
  let hex = team.color.toLowerCase();
  const [h, s, l] = toHsl(hex);
  if (s < MIN_SATURATION) return hex;
  for (let up = l; contrast(hex, SURFACE) < MIN_CONTRAST && up < 1; up += 0.005) hex = fromHsl(h, s, Math.min(up, 1));
  return hex;
}

/** The team's line colour on the chart's surface, as "#rrggbb". */
export function lineColor(team: Pick<Team, "color" | "alternateColor">) {
  const shade = primaryShade(team);
  const primary = contrast(shade, SURFACE);
  const pick = primary >= MIN_CONTRAST || contrast(team.alternateColor, SURFACE) <= primary ? shade : team.alternateColor;
  return `#${pick.toLowerCase()}`;
}

/**
 * `teams` drawn in `now`'s colours wherever `now` has the franchise. ESPN gives each season the colours of its
 * day, so a past season would draw most teams in other colours than this one: the Warriors blue through
 * 2023-24 and gold since.
 */
export const coloursOf = (teams: Record<Abbr, Team>, now: Record<Abbr, Team>): Record<Abbr, Team> =>
  Object.fromEntries(Object.entries(teams).map(([a, t]) => [a, now[a] ? { ...t, color: now[a].color, alternateColor: now[a].alternateColor } : t]));

const style = (colour: string) => `--tint: ${colour}`;

/** Each team's style attribute for what draws it on a chart: its line colour. */
export const tintStyles = (teams: Record<Abbr, Team>): Record<Abbr, string> =>
  Object.fromEntries(Object.entries(teams).map(([a, t]) => [a, style(lineColor(t))]));

/** Below this distance in RGB, 0 to 441, two colours side by side read as one. */
const MIN_APART = 100;
const apart = (a: string, b: string) => Math.hypot(...channels(a.slice(1)).map((c, i) => (c - channels(b.slice(1))[i]) * 255));

/** Below this contrast against the surface a colour all but vanishes, as black does. */
const MIN_VISIBLE = 1.5;

/**
 * Two teams' style attributes for one bar, away then home. Where their line colours would read as one, such as
 * the Pistons' and the Knicks' blues, one side draws in its other colour instead: the away side first, then the
 * home side, then both, the first pair that tells them apart, or else the furthest apart. That colour may be
 * faint on its own, since beside the other team's it still tells the two apart, but never one that vanishes, so
 * the Spurs never turn black.
 */
export function pairStyles(away: Pick<Team, "color" | "alternateColor">, home: Pick<Team, "color" | "alternateColor">): [string, string] {
  const line = [lineColor(away), lineColor(home)];
  const other = [away, home].map((t, i) => {
    const shade = `#${primaryShade(t)}`;
    return line[i] === shade ? `#${t.alternateColor.toLowerCase()}` : shade;
  });
  const visible = (c: string) => contrast(c.slice(1), SURFACE) >= MIN_VISIBLE;
  const pairs = [line, [other[0], line[1]], [line[0], other[1]], other].filter((p) => p.every(visible));
  const gap = (p: string[]) => apart(p[0], p[1]);
  const [a, h] = pairs.find((p) => gap(p) >= MIN_APART) ?? pairs.reduce((best, p) => (gap(p) > gap(best) ? p : best), line);
  return [style(a), style(h)];
}

/** A colour in OKLab: lightness 0 to 1, then the two colour axes. */
const okLab = (hex: string): [number, number, number] => {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

/**
 * A game page's team block: every team's at this one OKLab lightness and at most this colour strength
 * (chroma), in its own hue, so a loud red and a quiet navy read alike.
 */
const BLOCK = { l: 0.34, c: 0.06 };
/** Below this OKLab distance two blocks, once at BLOCK, read as one colour. */
const BLOCKS_APART = 0.05;

/** Where a colour lands on the block's colour plane once brought to BLOCK. */
const asBlock = (hex: string) => {
  const [, a, b] = okLab(hex);
  const c = Math.hypot(a, b);
  const k = c ? Math.min(c, BLOCK.c) / c : 0;
  return [a * k, b * k];
};

/** How far a colour's lightness moves when it is brought to a block's. */
const darkening = (hex: string) => Math.abs(okLab(hex)[0] - BLOCK.l);

/**
 * The colour each team takes on a game page, away then home, as six hex digits: its primary or its alternate.
 * Of the four pairs, those that still look apart as blocks qualify, and of those the pair that changes least
 * when darkened to the block's lightness wins, so a gold or a silver gives way to a darker partner: the
 * Cavaliers are wine and the Pacers navy. With no pair apart, the furthest apart wins.
 */
export function gameColours(away: Pick<Team, "color" | "alternateColor">, home: Pick<Team, "color" | "alternateColor">): [string, string] {
  const pairs = [away.color, away.alternateColor].flatMap((a) => [home.color, home.alternateColor].map((h) => [a.toLowerCase(), h.toLowerCase()]));
  const gap = ([a, h]: string[]) => Math.hypot(asBlock(a)[0] - asBlock(h)[0], asBlock(a)[1] - asBlock(h)[1]);
  const cost = (p: string[]) => p.reduce((t, hex) => t + darkening(hex), 0);
  const apart = pairs.filter((p) => gap(p) >= BLOCKS_APART).sort((p, q) => cost(p) - cost(q));
  const [a, h] = apart[0] ?? pairs.reduce((best, p) => (gap(p) > gap(best) ? p : best));
  return [a, h];
}

/**
 * A team's style attribute on a game page: --fill, its block, at BLOCK in the colour's hue, and --tint, the
 * colour lifted to at least 0.62 lightness to show on the dark card, for its block's edge and its chart line.
 * Both are written out as oklch() values, which every browser the site supports reads.
 */
function gameStyle(hex: string): string {
  const [l, a, b] = okLab(hex);
  const c = Math.hypot(a, b);
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return `--fill: oklch(${BLOCK.l} ${Math.min(c, BLOCK.c).toFixed(4)} ${h.toFixed(1)}); --tint: oklch(${Math.max(l, 0.62).toFixed(3)} ${c.toFixed(4)} ${h.toFixed(1)})`;
}

/** A team's style attribute on a page about it alone: of its two colours, the one that darkens least. */
export const teamPaint = (team: Pick<Team, "color" | "alternateColor">) =>
  gameStyle([team.color, team.alternateColor].map((hex) => hex.toLowerCase()).sort((a, b) => darkening(a) - darkening(b))[0]);

/** Two teams' style attributes for a game page, away then home, in the colours gameColours picks. */
export const gamePaint = (away: Pick<Team, "color" | "alternateColor">, home: Pick<Team, "color" | "alternateColor">) =>
  gameColours(away, home).map(gameStyle) as [string, string];
