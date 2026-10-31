import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, ELO_PER_SIGMA, PARAMS, type Game, type SeasonData } from "./elo.ts";
import { trailingHomeEdges } from "./home.ts";
import { modelInputs } from "./inputs.ts";
import type { BoxLine } from "./players.ts";

// Last season A beat B at home three times by 10. This season A brings in rookie 5. The morning report of A's second
// game lists player 2 as out; he plays anyway, and the report, the latest, still lists him for the game to come.
const team = (name: string) => ({ name, short: name, color: "000000", alternateColor: "ffffff" });
const line = (athlete: number, min: number, pts: number): BoxLine => [athlete, min, pts, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const game = (id: string, t: string, hs: number | null, as: number | null): Game => ({ id, t, home: "A", away: "B", hs, as, final: hs !== null, neutral: false, note: null });
const last: SeasonData = { season: "2025-26", teams: { A: team("A"), B: team("B") }, games: ["01", "03", "05"].map((d) => game(`l${d}`, `2025-11-${d}T23:00Z`, 110, 100)) };
const lastBox = { season: "2025-26", games: Object.fromEntries(last.games.map((g) => [g.id, { A: [line(1, 30, 15), line(2, 30, 15)], B: [line(3, 30, 15), line(4, 30, 15)] }])) };
const data: SeasonData = {
  season: "2026-27", teams: last.teams,
  games: [game("g1", "2026-10-21T23:00Z", 105, 100), game("g2", "2026-10-23T23:00Z", 100, 104), game("g3", "2026-10-25T23:00Z", null, null)],
};
const box = { season: "2026-27", games: {
  g1: { A: [line(1, 30, 15), line(2, 30, 15), line(5, 30, 12)], B: [line(3, 30, 15), line(4, 30, 15)] },
  g2: { A: [line(1, 30, 15), line(2, 30, 15), line(5, 30, 12)], B: [line(3, 30, 15), line(4, 30, 15)] },
} };
const injuries = { season: "2026-27", days: { "2026-10-23": { fetched: "2026-10-23T12:00:00.000Z", injuries: [{ athlete: 2, team: "A", status: "Out", date: "2026-10-22T20:00Z" }] } } };
const totals = (season: string) => ({ season, games: 82, totals: { A: 41, B: 41 }, source: "test" });
const inputs = modelInputs([
  { data: last, box: lastBox, preseason: totals("2025-26") },
  { data, box, preseason: totals("2026-27"), injuries },
]).get("2026-27")!;

test("a season's inputs carry the home edge of the seasons before it, and the site's model uses it", () => {
  const want = trailingHomeEdges([last, data], PARAMS).get("2026-27")!.value;
  assert.equal(inputs.home, want);
  assert.notEqual(want, PARAMS.home.value);
  const model = compute(data, inputs);
  assert.ok(Math.abs(model.home - want * (ELO_PER_SIGMA / PARAMS.sigma)) < 1e-9, `home ${model.home}`);
});

test("a season's inputs name its rookies: players new to the box scores, not last season's", () => {
  assert.deepEqual([...inputs.players!.rookies!], [5]);
});

test("a game is priced without the players its morning's report lists as out, and so are the games to come", () => {
  const priced = inputs.players!.lineups.previous.get("g2")!.home.map((p) => p.athlete).sort();
  assert.deepEqual(priced, [1, 5], "player 2 played g1 but is out for g2");
  const share = inputs.players!.lineups.previous.get("g2")!.home.reduce((s, p) => s + p.share, 0);
  assert.ok(Math.abs(share - 5) < 1e-9, `the lineup still fills 240 minutes: ${share}`);
  const next = inputs.players!.lineups.next.get("2026-10-23")!.A!.map((p) => p.athlete);
  assert.deepEqual(next.sort(), [1, 5], "player 2 played g2, but the latest report holds for the game to come");
});
