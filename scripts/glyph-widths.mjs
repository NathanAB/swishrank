// Prints Public Sans Bold's advance widths, in thousandths of an em, for ASCII from the space to the tilde and for the
// minus sign: the BOLD, MINUS_WIDTH and WIDEST tables src/lib/heatmap.ts measures labels with. Reads the woff files
// Astro downloads for the site's fonts, so run it after a build or `astro dev`: node scripts/glyph-widths.mjs [dir]
import { readFileSync, readdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
const dir = process.argv[2] ?? "node_modules/.astro/fonts";
for (const f of readdirSync(dir).filter((f) => f.endsWith(".woff"))) {
  const b = readFileSync(`${dir}/${f}`);
  const n = b.readUInt16BE(12);
  const tables = {};
  for (let i = 0; i < n; i++) {
    const o = 44 + i * 20;
    const tag = b.toString("latin1", o, o + 4);
    const off = b.readUInt32BE(o + 4), comp = b.readUInt32BE(o + 8), orig = b.readUInt32BE(o + 12);
    const raw = b.subarray(off, off + comp);
    tables[tag] = comp < orig ? inflateSync(raw) : raw;
  }
  if (tables["OS/2"].readUInt16BE(4) !== 700) continue;
  const upm = tables.head.readUInt16BE(18);
  const nh = tables.hhea.readUInt16BE(34);
  const adv = (g) => tables.hmtx.readUInt16BE(4 * Math.min(g, nh - 1));
  const cmap = tables.cmap;
  let sub = -1;
  for (let i = 0; i < cmap.readUInt16BE(2); i++) {
    const p = cmap.readUInt16BE(4 + i * 8), e = cmap.readUInt16BE(6 + i * 8), off = cmap.readUInt32BE(8 + i * 8);
    if (cmap.readUInt16BE(off) === 4 && (p === 3 || p === 0)) sub = off;
  }
  const segX2 = cmap.readUInt16BE(sub + 6);
  const ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
  const glyph = (c) => {
    for (let s = 0; s < segX2 / 2; s++) {
      const end = cmap.readUInt16BE(ends + 2 * s), start = cmap.readUInt16BE(starts + 2 * s);
      if (c > end) continue;
      if (c < start) return 0;
      const delta = cmap.readInt16BE(deltas + 2 * s), ro = cmap.readUInt16BE(ranges + 2 * s);
      if (!ro) return (c + delta) & 0xffff;
      const g = cmap.readUInt16BE(ranges + 2 * s + ro + 2 * (c - start));
      return g ? (g + delta) & 0xffff : 0;
    }
    return 0;
  };
  const ascii = [];
  for (let c = 32; c < 127; c++) ascii.push(Math.round((adv(glyph(c)) / upm) * 1000));
  console.log(`${f}\nBOLD = [${ascii.join(", ")}]\nMINUS_WIDTH = ${Math.round((adv(glyph(0x2212)) / upm) * 1000)}\nWIDEST = ${Math.max(...ascii)}`);
}
