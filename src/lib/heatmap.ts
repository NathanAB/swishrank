// A team's players heatmap, laid out at build time like a stock market map: each player its rating counts a tile as
// big as the minutes it counts him for, coloured by the rating points he adds to his team's rating, or by how far that
// moved over the past 7 days (Season.players in src/lib/elo.ts). Everything is in a canvas's own px, which the
// page draws in percentages and container units, so a layout scales with its card and a label that fits here fits on
// every screen. Labels are measured with Public Sans Bold's own glyph widths, so none is ever clipped: one shrinks to
// fit its tile, and a tile too small for any gets none.
import { winProb, type PlayerPart } from "./elo.ts";
import { signed, signedPercent } from "./format.ts";
import { playerName } from "./names.ts";
import { textWidth } from "./text-width.ts";
import { inset, squarify, type Rect } from "./treemap.ts";

/** A colour step on the site's diverging pair: 0 the neutral grey, 1 to 4 stronger rises, −1 to −4 stronger drops. */
export type Bin = -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4;
/**
 * What a tile shows: the rating points he adds to his team's rating, over an average player in his minutes, or how far
 * that moved over the past 7 days.
 */
export type Mode = "game" | "week";
export const MODES: readonly Mode[] = ["game", "week"];
/** Where each step starts, in rating points. */
export const CUTS: Record<Mode, readonly [number, number, number, number]> = { game: [4, 8, 20, 40], week: [1, 2, 4, 8] };

const UP: readonly Bin[] = [0, 1, 2, 3, 4];
const DOWN: readonly Bin[] = [0, -1, -2, -3, -4];
/** The step a value falls in: a value on a cut point takes the step that starts there. */
export const binOf = (v: number, cuts: readonly number[]): Bin => (v < 0 ? DOWN : UP)[cuts.filter((c) => Math.abs(v) >= c).length] ?? 0;

/**
 * A layout's size in its own px, and how many times MIN_FONT its smallest label is. A heatmap 640px wide or narrower,
 * as on a phone, draws on the tall canvas rather than shrinking the wide one. Each scale keeps every label at about 7px
 * or more on screen at its layout's narrowest: the tall one at a 320px phone's 256px, the wide one at 641px, as on a
 * tablet.
 */
export type Canvas = { w: number; h: number; scale: number };
export const TEAM_WIDE: Canvas = { w: 1200, h: 420, scale: 1.5 };
export const TEAM_TALL: Canvas = { w: 600, h: 640, scale: 2 };

/** A tile's label in canvas px: its name alone, or its name over the figure the colour shows. */
export type Label = { name: string; size: number; lines: 1 | 2 };
export type Tile = Rect & {
  part: PlayerPart;
  /** His full name, for the tooltip and the table. */
  name: string;
  label: Label | null;
  /** The step each figure's colour is in, or "out" for his points while he is out, which is striped. */
  bins: { game: Bin | "out"; week: Bin };
  /** His rating points added and their 7-day move, as the tooltip and the table print them. */
  text: Record<Mode, string>;
  /** The win chance a game his points add against an average team, which the tooltip and the table print beside them. */
  chance: string;
  /** The tile's figure in each mode: the text, or "out" for his points while he is out. */
  figures: Record<Mode, string>;
};
// The page's tile box model, in canvas px and em, which Heatmap.astro's styles draw with.
export const PAD = { x: 3, y: 2 };
export const LINE = 1.15;
/** The figure under a name, as a share of the name's size. */
export const FIGURE = 0.85;
/** The wide layout's smallest and largest label, in canvas px. */
export const MIN_FONT = 9;
const MAX_FONT = 24;
/** Headroom for the face's fallback, which draws until the face loads. */
const SAFETY = 1.05;
const TILE_GAP = 1;

/**
 * The largest label that fits a `w` by `h` tile, up to a size that grows with the tile, trying each name in turn;
 * null when none fits at the smallest size.
 */
function fitLabel(w: number, h: number, names: readonly string[], figures: readonly string[], scale: number): Label | null {
  const inner = w - 2 * PAD.x;
  const min = MIN_FONT * scale;
  const natural = scale * Math.min(MAX_FONT, Math.sqrt(w * h) / 5);
  const byFigure = inner / (SAFETY * FIGURE * Math.max(...figures.map(textWidth)));
  for (const name of names) {
    const across = Math.min(natural, inner / (SAFETY * textWidth(name)));
    const two = Math.min(across, byFigure, (h - 2 * PAD.y) / (LINE * (1 + FIGURE)));
    if (two >= min) return { name, size: two, lines: 2 };
    const one = Math.min(across, (h - 2 * PAD.y) / LINE);
    if (one >= min) return { name, size: one, lines: 1 };
  }
  return null;
}

const SUFFIX = /^(Jr\.?|Sr\.?|II|III|IV|V)$/;
const words = (name: string) => name.split(" ").filter((w) => !SUFFIX.test(w));
const lastName = (name: string) => words(name).at(-1) ?? name;
const initialled = (name: string) => `${name[0]}. ${lastName(name)}`;

/**
 * Each of a team's players as his tile names him: his last name, his initial before it when a teammate shares it,
 * and his whole name, less any suffix, when a teammate shares that too.
 */
export function tileNames(names: readonly string[]): string[] {
  return names.map((name) => {
    const last = lastName(name);
    if (names.filter((n) => lastName(n) === last).length < 2) return last;
    const short = initialled(name);
    return names.filter((n) => initialled(n) === short).length < 2 ? short : words(name).join(" ");
  });
}

/** A team's players as tiles over the whole canvas, largest first. */
export function teamMap(players: readonly PlayerPart[], canvas: Canvas): Tile[] {
  const parts = [...players].sort((x, y) => y.minutes - x.minutes);
  const names = parts.map((p) => playerName(p.athlete) ?? `#${p.athlete}`);
  const shown = tileNames(names);
  return squarify(parts.map((p) => p.minutes), { x: 0, y: 0, w: canvas.w, h: canvas.h }).map((r, i) => {
    const part = parts[i];
    const t = inset(r, TILE_GAP);
    const week = part.adds - part.weekAgo;
    const text = { game: signed(Math.round(part.adds)), week: signed(Math.round(week)) };
    const figures = { game: part.out ? "out" : text.game, week: text.week };
    // A hyphenated name too long for its tile falls back to its first half.
    const tries = shown[i].includes("-") ? [shown[i], shown[i].split("-")[0]] : [shown[i]];
    return {
      ...t,
      part,
      name: names[i],
      label: fitLabel(t.w, t.h, tries, [figures.game, figures.week], canvas.scale),
      bins: { game: part.out ? "out" : binOf(part.adds, CUTS.game), week: binOf(week, CUTS.week) },
      text,
      chance: signedPercent(winProb(part.adds) - 0.5),
      figures,
    };
  });
}
