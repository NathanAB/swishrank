// The players heatmap, laid out at build time like a stock market map: each team a block of its rotation's minutes,
// best rating first, and each player its rating counts a tile as big as the minutes it counts him for, coloured by
// his value per 48 or by its move over the week (Season.players in src/lib/elo.ts). Everything is in a canvas's own
// px, which the page draws in percentages and container units, so a layout scales with its card and a label that fits
// here fits on every screen. Labels are measured with Public Sans Bold's own glyph widths, so none is ever clipped:
// one shrinks to fit its tile, and a tile too small for any gets none.
import type { Abbr, PlayerPart, Season } from "./elo.ts";
import { rating, signed } from "./format.ts";
import { playerName } from "./names.ts";
import { inset, squarify, type Rect } from "./treemap.ts";

/** What a tile's colour shows: its player's value per 48, or how far it moved over the week. */
export type Mode = "value" | "week";
export const MODES: readonly Mode[] = ["value", "week"];
/** A colour step on the site's diverging pair: 0 the neutral grey, 1 to 4 stronger rises, −1 to −4 stronger drops. */
export type Bin = -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4;
/** Where each step starts, in Elo points per 48: within 3 of an average player is neutral, and a week's move within 0.5. */
export const CUTS: Record<Mode, readonly [number, number, number, number]> = { value: [3, 10, 20, 30], week: [0.5, 1.5, 3, 5] };

const UP: readonly Bin[] = [0, 1, 2, 3, 4];
const DOWN: readonly Bin[] = [0, -1, -2, -3, -4];
/** The step a value falls in: a value on a cut point takes the step that starts there. */
export const binOf = (v: number, cuts: readonly number[]): Bin => (v < 0 ? DOWN : UP)[cuts.filter((c) => Math.abs(v) >= c).length] ?? 0;

/**
 * A layout's size in its own px, the height of each team's header strip, 0 for a single team, and how much larger
 * than the wide layout's its labels run. A phone draws on a tall, narrow canvas rather than shrinking the wide one,
 * and its canvas px are smaller on screen, so its labels run larger to stay as readable.
 */
export type Canvas = { w: number; h: number; head: number; scale: number };
export const LEAGUE_WIDE: Canvas = { w: 1400, h: 860, head: 18, scale: 1 };
export const LEAGUE_TALL: Canvas = { w: 600, h: 2200, head: 30, scale: 1.5 };
export const TEAM_WIDE: Canvas = { w: 1200, h: 420, head: 0, scale: 1 };
export const TEAM_TALL: Canvas = { w: 600, h: 560, head: 0, scale: 1.5 };

/** A tile's label in canvas px: its name alone, or its name over the figure the colour shows. */
export type Label = { name: string; size: number; lines: 1 | 2 };
export type Tile = Rect & {
  part: PlayerPart;
  /** His full name, for the tooltip and the table. */
  name: string;
  label: Label | null;
  bins: Record<Mode, Bin>;
  figures: Record<Mode, string>;
  /** The tooltip: his name, then a line each for his team and minutes, his value and what it adds, and the week. */
  tip: readonly [string, string, string, string];
};
/** A team's header strip: its short name and its rating, the rating dropped where both do not fit. */
export type Head = Rect & { short: string; rating: string | null; size: number };
export type Group = Rect & { abbr: Abbr; short: string; rating: number; head: Head | null; tiles: Tile[] };

/** What the layout reads of a season. */
export type Rated = Pick<Season, "data" | "r" | "order" | "players">;

// Public Sans Bold's advance widths in thousandths of an em for ASCII from the space to the tilde, read from the face
// the site serves; labels are bold or lighter, and lighter weights run narrower. Kerning only narrows a word.
const BOLD = [
  226, 282, 480, 616, 681, 939, 784, 261, 333, 337, 473, 589, 277, 393, 270, 381, 645, 428, 635, 665, 656, 675, 661, 626, 671, 659, 270, 279,
  578, 589, 578, 535, 828, 727, 685, 718, 720, 635, 614, 759, 770, 308, 402, 717, 578, 918, 782, 761, 653, 773, 696, 692, 616, 724, 704, 969,
  717, 668, 670, 337, 381, 337, 484, 553, 264, 567, 609, 547, 609, 577, 397, 629, 593, 267, 289, 580, 329, 896, 593, 576, 607, 607, 412, 527,
  417, 595, 521, 789, 588, 563, 497, 385, 269, 384, 612,
];
const MINUS_WIDTH = 589;
const WIDEST = 969;

/** A text's width in em, bold, its accents left off as they sit over their letters; a glyph outside the table counts as the widest. */
export function textWidth(text: string): number {
  let w = 0;
  for (const ch of text.normalize("NFD")) {
    if (/\p{M}/u.test(ch)) continue;
    w += ch === "−" ? MINUS_WIDTH : (BOLD[(ch.codePointAt(0) ?? 0) - 32] ?? WIDEST);
  }
  return w / 1000;
}

// The page's tile and header box model, in canvas px and em: keep in step with Heatmap.astro's styles.
export const PAD = { x: 4, y: 3 };
export const LINE = 1.15;
/** The figure under a name, as a share of the name's size. */
export const FIGURE = 0.85;
/** The wide layout's smallest and largest label, in canvas px. */
export const MIN_FONT = 9;
const MAX_FONT = 24;
/** Headroom for the face's fallback, which draws until the face loads. */
const SAFETY = 1.05;
const TILE_GAP = 1;
const HEAD_TRACKING = 0.03;
const HEAD_GAP = 4;

/**
 * The largest label that fits a `w` by `h` tile, up to a size that grows with the tile, trying each name in turn;
 * null when none fits at the smallest size.
 */
function fitLabel(w: number, h: number, names: readonly string[], figures: readonly string[], scale: number): Label | null {
  const inner = w - 2 * PAD.x;
  const min = MIN_FONT * scale;
  const natural = scale * Math.min(MAX_FONT, Math.sqrt(w * h) / 5);
  const figure = inner / (SAFETY * FIGURE * Math.max(...figures.map(textWidth)));
  for (const name of names) {
    const across = Math.min(natural, inner / (SAFETY * textWidth(name)));
    const two = Math.min(across, figure, (h - 2 * PAD.y) / (LINE * (1 + FIGURE)));
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

const tenth = (v: number) => signed(Math.round(v * 10) / 10);

function tiles(model: Rated, abbr: Abbr, box: Rect, scale: number): Tile[] {
  const parts = [...model.players[abbr]].sort((x, y) => y.minutes - x.minutes);
  const names = parts.map((p) => playerName(p.athlete) ?? `#${p.athlete}`);
  const shown = tileNames(names);
  const short = model.data.teams[abbr].short;
  return squarify(parts.map((p) => p.minutes), box).map((r, i) => {
    const part = parts[i];
    const t = inset(r, TILE_GAP);
    const figures = { value: part.out ? "out" : signed(Math.round(part.per48)), week: part.out ? "out" : tenth(part.week) };
    // A hyphenated name too long for its tile falls back to its first half.
    const tries = shown[i].includes("-") ? [shown[i], shown[i].split("-")[0]] : [shown[i]];
    const minutes = Math.round(part.minutes);
    return {
      ...t,
      part,
      name: names[i],
      label: fitLabel(t.w, t.h, tries, [figures.value, figures.week], scale),
      bins: { value: part.out ? 0 : binOf(part.per48, CUTS.value), week: part.out ? 0 : binOf(part.week, CUTS.week) },
      figures,
      tip: [
        names[i],
        part.out ? `${short} · out for weeks · his ${minutes} min to backups` : `${short} · ${minutes} min a game`,
        `${signed(Math.round(part.per48))} per 48 · adds ${signed(Math.round(part.adds))}`,
        `${tenth(part.week)} this week`,
      ],
    };
  });
}

/** A header strip's text at the largest size up to the strip's own that fits it, the rating dropped first. */
function head(strip: Rect, short: string, shown: string, scale: number): Head | null {
  const base = (strip.h * 11) / 18;
  const min = MIN_FONT * scale;
  const width = (text: string) => SAFETY * (textWidth(text.toUpperCase()) + HEAD_TRACKING * text.length);
  const both = Math.min(base, (strip.w - 2 * PAD.x - HEAD_GAP) / (width(short) + width(shown)));
  if (both >= min) return { ...strip, short, rating: shown, size: both };
  const alone = Math.min(base, (strip.w - 2 * PAD.x) / width(short));
  return alone >= min ? { ...strip, short, rating: null, size: alone } : null;
}

function group(model: Rated, abbr: Abbr, block: Rect, canvas: Canvas): Group {
  const { short } = model.data.teams[abbr];
  const r = model.r[abbr];
  const strip = { x: block.x, y: block.y, w: block.w, h: Math.min(canvas.head, block.h) };
  const body = inset({ x: block.x, y: block.y + strip.h, w: block.w, h: block.h - strip.h }, canvas.head ? 1 : 0);
  return {
    ...block, abbr, short, rating: r,
    head: canvas.head ? head(strip, short, rating(r), canvas.scale) : null,
    tiles: tiles(model, abbr, body, canvas.scale),
  };
}

/** Every team with a rotation, best rating first, each a block of its players' tiles. */
export function leagueMap(model: Rated, canvas: Canvas): Group[] {
  const teams = model.order.filter((a) => model.players[a].length > 0);
  const minutes = teams.map((a) => model.players[a].reduce((s, p) => s + p.minutes, 0));
  const blocks = squarify(minutes, { x: 0, y: 0, w: canvas.w, h: canvas.h });
  return teams.map((abbr, i) => group(model, abbr, blocks[i], canvas));
}

/** One team's tiles over the whole canvas, without a header; null when its rating counts no players. */
export const teamMap = (model: Rated, abbr: Abbr, canvas: Canvas): Group | null =>
  model.players[abbr].length > 0 ? group(model, abbr, { x: 0, y: 0, w: canvas.w, h: canvas.h }, { ...canvas, head: 0 }) : null;
