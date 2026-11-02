import { test } from "node:test";
import assert from "node:assert/strict";
import names from "../data/players.json" with { type: "json" };
import type { PlayerPart } from "./elo.ts";
import { binOf, CUTS, FIGURE, HEAD_PAD, LEAGUE_TALL, LEAGUE_WIDE, leagueMap, LINE, MIN_FONT, PAD, teamMap, TEAM_TALL, TEAM_WIDE, textWidth, tileNames, type Rated } from "./heatmap.ts";

// Thirty teams, each a rotation from a 36-minute starter down to a player who barely plays, one of them out for weeks,
// rated 1100 down to 1013, so the league's order is the reverse of the teams' listing.
const ids = Object.keys(names).map(Number);
const MINUTES = [36, 34, 32, 30, 26, 22, 18, 14, 8, 3, 0.6];
const abbrs = Array.from({ length: 30 }, (_, i) => `T${i}`);
const part = (athlete: number, minutes: number, out: boolean): PlayerPart => ({ athlete, minutes, per48: 12 - minutes / 2, adds: 0, out, week: 0.8 });
const model: Rated = {
  data: { season: "2026-27", games: [], teams: Object.fromEntries(abbrs.map((a) => [a, { name: a, short: `Team ${a}`, color: "000000", alternateColor: "ffffff" }])) },
  r: Object.fromEntries(abbrs.map((a, i) => [a, 1013 + 3 * i])),
  order: [...abbrs].reverse(),
  players: Object.fromEntries(abbrs.map((a, i) => [a, MINUTES.map((m, j) => part(ids[i * MINUTES.length + j], m, j === 3))])),
};

test("a tile's colour takes a stronger step at each cut point, either way from neutral", () => {
  assert.deepEqual([2.9, 3, 9.9, 10, 20, 30, 45].map((v) => binOf(v, CUTS.value)), [0, 1, 1, 2, 3, 4, 4]);
  assert.deepEqual([-0.4, -0.5, -1.5, -3, -5].map((v) => binOf(v, CUTS.week)), [0, -1, -2, -3, -4]);
});

test("teammates who share a last name are told apart by an initial, and by their whole names when that is shared too", () => {
  assert.deepEqual(tileNames(["Jalen Williams", "Jaylin Williams", "Kenrich Williams", "Shai Gilgeous-Alexander", "Jaren Jackson Jr."]), [
    "Jalen Williams", "Jaylin Williams", "K. Williams", "Gilgeous-Alexander", "Jackson",
  ]);
});

test("the league runs best rating first, each team a block as big as its rotation's minutes", () => {
  const groups = leagueMap(model, LEAGUE_WIDE);
  assert.deepEqual(groups.map((g) => g.abbr), model.order);
  for (const g of groups) assert.ok(Math.abs((g.w * g.h) / (LEAGUE_WIDE.w * LEAGUE_WIDE.h) - 1 / 30) < 1e-9, `${g.abbr} is ${g.w} by ${g.h}`);
});

test("every label fits its tile at its size, and the smallest tiles have none", () => {
  const maps = [
    { canvas: LEAGUE_WIDE, groups: leagueMap(model, LEAGUE_WIDE) },
    { canvas: LEAGUE_TALL, groups: leagueMap(model, LEAGUE_TALL) },
    { canvas: TEAM_WIDE, groups: [teamMap(model, "T0", TEAM_WIDE)!] },
    { canvas: TEAM_TALL, groups: [teamMap(model, "T0", TEAM_TALL)!] },
  ];
  let bare = 0;
  for (const { canvas, groups } of maps) {
    for (const g of groups) {
      if (g.head) {
        const text = `${g.head.short}${g.head.rating ?? ""}`.toUpperCase();
        assert.ok(textWidth(text) * g.head.size + 2 * HEAD_PAD <= g.head.w && g.head.size <= g.head.h, `${g.abbr}'s header overflows`);
      }
      for (const t of g.tiles) {
        const { label } = t;
        if (!label) {
          bare++;
          continue;
        }
        const widest = Math.max(textWidth(label.name), label.lines === 2 ? FIGURE * Math.max(textWidth(t.figures.value), textWidth(t.figures.week)) : 0);
        assert.ok(label.size >= MIN_FONT * canvas.scale, `${t.name} at ${label.size}`);
        assert.ok(widest * label.size + 2 * PAD.x <= t.w, `${t.name} runs past its tile's sides`);
        assert.ok(label.size * LINE * (label.lines === 2 ? 1 + FIGURE : 1) + 2 * PAD.y <= t.h, `${t.name} runs past its tile's top and bottom`);
      }
    }
  }
  assert.ok(bare > 0, "the 0.6-minute tiles are too small for a label");
});
