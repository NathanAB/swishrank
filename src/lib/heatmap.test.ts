import { test } from "node:test";
import assert from "node:assert/strict";
import names from "../data/players.json" with { type: "json" };
import type { PlayerPart } from "./elo.ts";
import { binOf, CUTS, FIGURE, LINE, MIN_FONT, PAD, teamMap, TEAM_TALL, TEAM_WIDE, textWidth, tileNames } from "./heatmap.ts";

// A rotation from a 36-minute starter down to a player who barely plays, one of them out for weeks.
const ids = Object.keys(names).map(Number);
const MINUTES = [36, 34, 32, 30, 26, 22, 18, 14, 8, 3, 0.6];
const part = (athlete: number, minutes: number, out: boolean): PlayerPart => ({ athlete, minutes, per48: 12 - minutes / 2, adds: 0, out, week: 0.8 });
const players = MINUTES.map((m, j) => part(ids[j], m, j === 3));

test("a tile's colour takes a stronger step at each cut point, either way from neutral", () => {
  assert.deepEqual([2.9, 3, 9.9, 10, 20, 30, 45].map((v) => binOf(v, CUTS.value)), [0, 1, 1, 2, 3, 4, 4]);
  assert.deepEqual([-0.4, -0.5, -1.5, -3, -5].map((v) => binOf(v, CUTS.week)), [0, -1, -2, -3, -4]);
});

test("teammates who share a last name are told apart by an initial, and by their whole names when that is shared too", () => {
  assert.deepEqual(tileNames(["Jalen Williams", "Jaylin Williams", "Kenrich Williams", "Shai Gilgeous-Alexander", "Jaren Jackson Jr."]), [
    "Jalen Williams", "Jaylin Williams", "K. Williams", "Gilgeous-Alexander", "Jackson",
  ]);
});

test("every label fits its tile at its size, and the smallest tiles have none", () => {
  let bare = 0;
  for (const canvas of [TEAM_WIDE, TEAM_TALL]) {
    for (const t of teamMap(players, canvas)!) {
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
  assert.ok(bare > 0, "the 0.6-minute tiles are too small for a label");
});
