// How wide a label sets in the site's face, worked out at build time or in the browser without measuring the page:
// the heatmap's tile labels (lib/heatmap.ts) and the players chart's strip names (lib/player-chart.ts) are sized or
// left out by it, so none is ever clipped.

// Public Sans Bold's advance widths in thousandths of an em for ASCII from the space to the tilde, read from the face
// the site serves by scripts/glyph-widths.mjs; labels are bold or lighter, and lighter weights run narrower. Kerning
// only narrows a word.
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
