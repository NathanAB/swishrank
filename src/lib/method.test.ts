import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compute, K } from "./elo.ts";
import { winWorth, worked } from "./method.ts";

const load = (id: string) => compute(JSON.parse(readFileSync(new URL(`../data/games/${id}.json`, import.meta.url), "utf8")));
const opener = worked(load("2026-27").results[0]);

test("the 2026-27 opener comes apart into the figures the about page prints", () => {
  const { home, away, winner } = opener;
  assert.deepEqual(
    { home: home.abbr, edge: home.edge, gap: opener.gap, chance: Math.round(home.chance * 100), margin: opener.margin, multiplier: opener.multiplier.toFixed(2), moved: winner.moved.toFixed(2), shown: [home.change, away.change] },
    { home: "DET", edge: 100, gap: 100, chance: 64, margin: 8, multiplier: "0.84", moved: "6.05", shown: [6, -6] },
  );
  // Each team's column of the ledger multiplies out to the points it moved.
  for (const side of [home, away]) assert.ok(Math.abs(K * opener.multiplier * side.surprise - side.moved) < 1e-9, side.abbr);
});

test("the what-a-win-is-worth table agrees with the opener for its margin", () => {
  assert.equal(winWorth(opener.margin).home, opener.home.change);
  const by10 = winWorth(10);
  assert.ok(by10.road > by10.neutral && by10.neutral > by10.home, JSON.stringify(by10));
});
