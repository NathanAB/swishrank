import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKUP_GAP, compute, ELO_PER_SIGMA, fitModel, PARAMS, playerPart, shownLineups, START, type Game, type SeasonData } from "./elo.ts";
import { trailingHomeEdges } from "./home.ts";
import { modelInputs } from "./inputs.ts";
import type { BoxLine } from "./players.ts";

// Last season A beat B at home three times by 10. This season A brings in rookie 5. The morning report of A's second
// game lists player 2 as out; he plays anyway, and the report, the latest, still lists him for the game to come.
const near = (actual: number, expected: number, what: string) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);
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

// This season A plays B four times. Player 9 plays A's first two games, is hurt in the second, and the next
// morning's report lists him out until January; he misses the next two. Player 8 is out for a week on that report.
const away: SeasonData = {
  season: "2026-27", teams: last.teams,
  games: ["21", "23", "25", "27"].map((d, i) => game(`h${i}`, `2026-10-${d}T23:00Z`, 105, 100)),
};
const awayBox = { season: "2026-27", games: Object.fromEntries(away.games.map((g, i) => [g.id, {
  A: [line(1, 30, 15), line(5, 30, 12), line(8, 20, 10), ...(i < 2 ? [line(9, 30, 20)] : [line(6, 30, 8)])],
  B: [line(3, 30, 15), line(4, 30, 15)],
}])) };
const report = { season: "2026-27", days: { "2026-10-24": { fetched: "2026-10-24T12:00:00.000Z", injuries: [
  { athlete: 9, team: "A", status: "Out", date: "2026-10-24T03:00Z", returnDate: "2027-01-10" },
  { athlete: 8, team: "A", status: "Out", date: "2026-10-24T03:00Z", returnDate: "2026-10-30" },
] } } };
const awayInputs = modelInputs([
  { data: last, box: lastBox, preseason: totals("2025-26") },
  { data: away, box: awayBox, preseason: totals("2026-27"), injuries: report },
]).get("2026-27")!;
const shownA = (day: string) => shownLineups(away, awayInputs.players!.rotation).after.get(day)!.A;

test("a player out for weeks leaves the shown rotation, the rest of it takes his minutes, and a gap rides on them", () => {
  const before = shownA("2026-10-21");
  assert.ok(before.some((p) => p.athlete === 9), "he counts before the report");
  // The usual rotation, as it stands without the report.
  const plain = modelInputs([{ data: last, box: lastBox, preseason: totals("2025-26") }, { data: away, box: awayBox, preseason: totals("2026-27") }]).get("2026-27")!;
  for (const day of ["2026-10-23", "2026-10-25"]) {
    const usual = shownLineups(away, plain.players!.rotation).after.get(day)!.A;
    const l = shownA(day);
    assert.ok(!l.some((p) => p.athlete === 9), `${day}: out of the rotation`);
    assert.ok(l.some((p) => p.athlete === 8), `${day}: a week out is not weeks`);
    near(l.filter((p) => p.athlete > 0).reduce((s, p) => s + p.share, 0), 5, `${day}: the rest fill 240 minutes`);
    const his = usual.find((p) => p.athlete === 9)?.share ?? 0;
    near(l.find((p) => p.athlete === -9)?.share ?? 0, his, `${day}: the gap rides on the share the rotation counted him for`);
    const kept = usual.filter((p) => p.athlete !== 9);
    const scale = 5 / kept.reduce((s, p) => s + p.share, 0);
    for (const p of kept) near(l.find((q) => q.athlete === p.athlete)!.share, p.share * scale, `${day}: ${p.athlete} takes his part of the minutes`);
  }
  assert.ok((shownA("2026-10-25").find((p) => p.athlete === -9)?.share ?? 0) < (shownA("2026-10-23").find((p) => p.athlete === -9)?.share ?? 0), "the gap fades as the team plays without him");
});

test("the gap counts BACKUP_GAP below the rest of the rotation in the shown rating", () => {
  const fit = fitModel(away, awayInputs).find((d) => d.day === "2026-10-23")!.after;
  const l = shownA("2026-10-23");
  const gap = l.find((p) => p.athlete === -9)!.share;
  near(playerPart(fit, l), playerPart(fit, l.filter((p) => p.athlete > 0)) - BACKUP_GAP * gap, "the gap's part");
  const model = compute(away, awayInputs);
  const shown = model.series.find((d) => d.day === "2026-10-23")!.r.A;
  near(shown, START + (fit.r.A + playerPart(fit, l)) * (ELO_PER_SIGMA / PARAMS.sigma), "A's shown rating counts the gap");
});

test("a player back on the floor counts again, though the report still lists him out for weeks", () => {
  // Player 9 comes back in A's fourth game, on 2026-10-27, while every report still lists him out until January.
  const back = { ...awayBox, games: { ...awayBox.games, h3: { ...awayBox.games.h3, A: [line(1, 30, 15), line(5, 30, 12), line(8, 20, 10), line(9, 18, 9)] } } };
  const stale = { season: "2026-27", days: { ...report.days, "2026-10-27": { fetched: "2026-10-27T12:00:00.000Z", injuries: report.days["2026-10-24"].injuries } } };
  const inputs = modelInputs([
    { data: last, box: lastBox, preseason: totals("2025-26") },
    { data: away, box: back, preseason: totals("2026-27"), injuries: stale },
  ]).get("2026-27")!;
  const shown = shownLineups(away, inputs.players!.rotation).after;
  assert.ok(!shown.get("2026-10-25")!.A.some((p) => p.athlete === 9), "out while he is out");
  const l = shown.get("2026-10-27")!.A;
  assert.ok(l.some((p) => p.athlete === 9) && !l.some((p) => p.athlete < 0), "back once he plays, at the usual rotation's count, with no gap");
  assert.deepEqual(l, inputs.players!.rotation.get("2026-10-27")!.A, "the usual rotation, unchanged");
});
