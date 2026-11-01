import { test } from "node:test";
import assert from "node:assert/strict";
import { oddsDay, parseHistory, teamOdds, toHistoryFile } from "./odds.ts";
import { simulate, type Setup } from "./project.ts";
import { CONFERENCES } from "./teams.ts";

const abbrs = [...CONFERENCES.East, ...CONFERENCES.West];
const setup: Setup = {
  abbrs, played: [], home: 45, format: "play-in", today: "2026-11-01", drift: { tau: 60, walk: 20, playoff: 0.5 },
  outlook: Object.fromEntries(abbrs.map((a, i) => [a, [{ day: "2026-11-01", rating: 900 + 7 * i }]])),
  fixtures: abbrs.flatMap((h, i) => abbrs.filter((_, j) => j !== i && (i + j) % 3 === 0).map((a, k) => ({ id: `${h}-${a}-${k}`, day: "2026-12-01", home: h, away: a, edge: 45 }))),
};
const p = simulate(setup, 2000, 3);

test("a projection's odds add up: sixteen playoff teams, one champion, every team somewhere from 1st to 15th", () => {
  const odds = teamOdds(p);
  const sum = (f: (o: (typeof odds)[string]) => number) => abbrs.reduce((s, a) => s + f(odds[a]), 0);
  assert.ok(Math.abs(sum((o) => o.playoffs) - 1600) < 2);
  assert.ok(Math.abs(sum((o) => o.title) - 100) < 1);
  assert.ok(Math.abs(sum((o) => o.firstPick) - 100) < 1);
  for (const a of abbrs) assert.ok(Math.abs(odds[a].seed.reduce((s, x) => s + x, 0) - 100) < 1, a);
});

test("a title race survives its file", () => {
  const days = [oddsDay("2026-10-31", p), oddsDay("2026-11-01", p)];
  const file = JSON.parse(JSON.stringify(toHistoryFile("2026-27", 2000, days)));
  assert.deepEqual(parseHistory(file, "2026-27"), days);
  assert.equal(parseHistory(undefined, "2026-27"), undefined);
  assert.throws(() => parseHistory({ ...file, title: { BOS: [1] } }, "2026-27"));
});
