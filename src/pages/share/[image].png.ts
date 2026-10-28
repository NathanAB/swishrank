// The picture a link preview shows, made at build time the way Astro's fonts guide makes an OpenGraph image
// (https://docs.astro.build/en/guides/fonts/#accessing-font-data-programmatically): Satori lays out the copy in
// Public Sans around the rating chart, and sharp turns its SVG into a PNG. A season's picture draws every
// team's line in its resting tint, as the league table's chart does; a team's draws its own line in its colour
// and the rest in grey, as its page does. Both take the site's tokens from styles/global.css.
import type { APIRoute } from "astro";
import { experimental_getFontFileURL, fontData } from "astro:assets";
import satori, { type Font, type FontWeight } from "satori";
import sharp from "sharp";
import mark from "../../../public/favicon.svg?raw";
import css from "../../styles/global.css?raw";
import { dateTicks, ratingTicks, seasonEndMark } from "../../lib/chart.ts";
import { START, type Abbr } from "../../lib/elo.ts";
import { rating } from "../../lib/format.ts";
import { homeTitle, leaders, SHARE_SIZE, SITE_NAME } from "../../lib/meta.ts";
import { shareImage, shareName, type Route, type ShareImage } from "../../lib/routes.ts";
import { allSeasons, currentSeason, type SeasonView } from "../../lib/season.ts";
import { place, runEnds } from "../../lib/teams.ts";
import { lineColor } from "../../lib/tint.ts";

export function getStaticPaths() {
  const current = currentSeason();
  return allSeasons().flatMap((season) => {
    const pages: Route[] = [{ kind: "home", season }, ...season.model.abbrs.map((abbr): Route => ({ kind: "team", season, abbr }))];
    return pages.map((route) => {
      const image = shareImage(route, current);
      return { params: { image: shareName(image) }, props: { season, image } };
    });
  });
}

type Props = { season: SeasonView; image: ShareImage };

// The tokens before the first media query, so a phone's overrides don't replace them.
const [base, rest] = css.replace(/\/\*[\s\S]*?\*\//g, "").split("@media");
if (rest === undefined) throw new Error("styles/global.css has no media query to end the site's tokens");
const TOKENS = new Map([...base.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

/** A token with its var()s filled in; `own` adds properties, such as a team's --tint. */
function token(name: string, own: Record<string, string> = {}): string {
  const value = own[name] ?? TOKENS.get(name);
  if (value === undefined) throw new Error(`styles/global.css declares no ${name}`);
  return value.replace(/var\((--[\w-]+)\)/g, (_, inner: string) => token(inner, own));
}

const WEIGHTS: readonly FontWeight[] = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const isWeight = (n: number): n is FontWeight => WEIGHTS.some((w) => w === n);

let faces: Promise<Font[]> | undefined;
/** The share entry's woff faces in astro.config.mjs, fetched once per build. */
const loadFaces = (requestUrl: URL) =>
  (faces ??= Promise.all(
    fontData["--font-public-sans-share"].map(async (face) => {
      const src = face.src.find((s) => s.format === "woff");
      const weight = Number(face.weight);
      if (!src || !isWeight(weight)) throw new Error(`Public Sans ${face.weight} has no woff file for Satori`);
      const data = await fetch(experimental_getFontFileURL(src.url, requestUrl)).then((res) => res.arrayBuffer());
      return { name: "Public Sans", data, weight, style: "normal" as const };
    }),
  ));

type El = { type: string; props: Record<string, unknown> };
const h = (type: string, props: Record<string, unknown>, ...children: (El | string)[]): El => ({ type, props: { ...props, children } });

const { width: W, height: H } = SHARE_SIZE;
const PAD = 64;
const TICKS = 64; // the rating labels' lane, left of the plot
const PLOT_W = W - 2 * PAD - TICKS;
const PLOT_H = 280;
const MARK = 28; // the playoffs label's lane, above the plot
const LABEL = 88; // a date label's box, centred on its day

/** The season's rating chart: every line in its resting tint, or with `own`, that team's in its colour over grey. */
function chart(season: SeasonView, own: Abbr | null): El {
  const m = season.model;
  const ser = m.series;
  const n = ser.length;
  const all = ser.flatMap((d) => m.abbrs.map((a) => d.r[a]));
  const { lo, hi, ticks } = ratingTicks(Math.min(START, ...all), Math.max(START, ...all));
  const y = (v: number) => 8 + ((PLOT_H - 16) * (hi - v)) / (hi - lo);
  const x = (i: number) => (i / (n - 1)) * PLOT_W;
  const pts = (a: Abbr) => ser.map((d, i) => `${x(i).toFixed(1)},${y(Math.round(d.r[a])).toFixed(1)}`);
  // As on the site: a team whose run has ended goes dotted past its last game, with the run drawn solid over it.
  const ends = runEnds(m);
  const runEnd = (a: Abbr) => ser.findIndex((d) => d.day === ends[a]);
  const ended = (a: Abbr) => runEnd(a) > 0 && runEnd(a) < n - 1;
  const tint = (a: Abbr) => ({ "--tint": lineColor(m.data.teams[a]) });
  const stroke = (a: Abbr) =>
    own === null
      ? { stroke: token("--tint-rest", tint(a)), "stroke-width": 2.5 }
      : a === own
        ? { stroke: token("--tint", tint(a)), "stroke-width": 5 }
        : { stroke: token("--line-other"), "stroke-opacity": 0.55, "stroke-width": 1.5 };
  const drawOrder = [...m.order].reverse().sort((p, q) => Number(p === own) - Number(q === own));
  const marker = seasonEndMark(m);
  const muted = token("--muted");

  const text = (style: Record<string, unknown>, value: string) =>
    h("div", { style: { position: "absolute", display: "flex", fontSize: 20, lineHeight: "24px", color: muted, ...style } }, value);
  const atDay = (i: number) =>
    i === 0 ? { left: TICKS } : i === n - 1 ? { right: 0 } : { left: TICKS + x(i) - LABEL / 2, width: LABEL, justifyContent: "center" };

  return h(
    "div",
    { style: { position: "relative", display: "flex", width: TICKS + PLOT_W, height: MARK + PLOT_H + 32, marginTop: "auto" } },
    ...ticks.map((t) => text({ top: MARK + y(t) - 12, left: 0, width: TICKS - 16, justifyContent: "flex-end" }, String(t))),
    ...(marker ? [text({ top: 0, right: PLOT_W - x(marker.i) + 4 }, marker.label)] : []),
    h(
      "svg",
      // Satori clips the drawing to its box, so the box reaches past the plot by the end dot's radius and ring.
      { width: PLOT_W + 10, height: PLOT_H, viewBox: `0 0 ${PLOT_W + 10} ${PLOT_H}`, style: { position: "absolute", top: MARK, left: TICKS } },
      ...ticks.map((t) => h("path", { d: `M0,${y(t)}H${PLOT_W}`, stroke: token("--grid"), "stroke-width": 1.5 })),
      ...(marker ? [h("path", { d: `M${x(marker.i).toFixed(1)},0V${PLOT_H}`, stroke: muted, "stroke-width": 1.5 })] : []),
      ...drawOrder.flatMap((a) => {
        const line = { fill: "none", "stroke-linejoin": "round", ...stroke(a) };
        if (!ended(a)) return [h("polyline", { points: pts(a).join(" "), ...line })];
        const dots = { "stroke-dasharray": `1 ${Number(line["stroke-width"]) * 2.5}`, "stroke-linecap": "round" };
        return [h("polyline", { points: pts(a).slice(runEnd(a)).join(" "), ...line, ...dots }), h("polyline", { points: pts(a).slice(0, runEnd(a) + 1).join(" "), ...line })];
      }),
      ...(own ? [h("circle", { cx: PLOT_W, cy: y(ser[n - 1].r[own]), r: 7, fill: token("--tint", tint(own)), stroke: token("--surface"), "stroke-width": 3 })] : []),
    ),
    ...dateTicks(ser.map((d) => d.day), LABEL / PLOT_W).map((d) => text({ top: MARK + PLOT_H + 8, ...atDay(d.i) }, d.text)),
  );
}

function card(season: SeasonView, image: ShareImage): El {
  const m = season.model;
  const own = image.kind === "team" ? image.abbr : null;
  const heading = own ? m.data.teams[own].name : homeTitle(season);
  const standing = own && `${season.current ? "" : "finished "}${place(m, own)} of ${m.abbrs.length} at ${rating(m.r[own])} · ${season.label}`;
  const fact = standing ? `${standing[0].toUpperCase()}${standing.slice(1)}` : leaders(season);
  return h(
    "div",
    { style: { width: W, height: H, display: "flex", background: token("--surface"), color: token("--text"), fontFamily: "Public Sans" } },
    h(
      "div",
      { style: { flexGrow: 1, display: "flex", flexDirection: "column", margin: `52px ${PAD}px 36px` } },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 700, letterSpacing: "-0.01em" } },
        h("img", { src: `data:image/svg+xml,${encodeURIComponent(mark)}`, width: 34, height: 34 }),
        SITE_NAME,
      ),
      h("div", { style: { marginTop: 30, fontSize: 60, lineHeight: "68px", fontWeight: 700, letterSpacing: "-0.015em" } }, heading),
      h("div", { style: { marginTop: 6, fontSize: 32, lineHeight: "40px", fontWeight: 500, color: token("--muted") } }, fact),
      ...(m.series.length > 1 ? [chart(season, own)] : []),
    ),
  );
}

export const GET: APIRoute<Props> = async ({ props, url }) => {
  const svg = await satori(card(props.season, props.image), { ...SHARE_SIZE, fonts: await loadFaces(url) });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
