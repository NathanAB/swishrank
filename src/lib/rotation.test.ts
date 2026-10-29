import { test } from "node:test";
import assert from "node:assert/strict";
import type { Game, SeasonData } from "./elo.ts";
import type { BoxLine } from "./players.ts";
import type { InjuryArchive } from "./injuries.ts";
import { missedCurves, rotations, type Curve } from "./rotation.ts";

const team = (name: string) => ({ name, short: name, color: "000000", alternateColor: "ffffff" });
const game = (day: number, final: boolean): Game => ({
  id: String(day), t: `2026-10-${day}T23:00Z`, home: "A", away: "B", hs: final ? 100 : null, as: final ? 90 : null, final, neutral: false, note: null,
});
const line = (athlete: number, minutes: number): BoxLine => [athlete, minutes, 10, 4, 8, 2, 2, 1, 3, 2, 1, 0, 1, 2];
const curve: Curve = [0.8, 0.5, 0.45, 0.4, 0.36, 0.33, 0.31, 0.29, 0.27, 0.26];

// A plays four games, the 10th to the 13th, with ten to come from the 14th to the 23rd. Players 1 and 3 play all
// four for 30 minutes; player 2 plays the first three and misses the 13th.
const data: SeasonData = {
  season: "x",
  teams: { A: team("A"), B: team("B") },
  games: Array.from({ length: 14 }, (_, i) => game(10 + i, i < 4)),
};
const box = {
  season: "x",
  games: Object.fromEntries([10, 11, 12, 13].map((day) => [String(day), { A: [line(1, 30), line(3, 30), ...(day < 13 ? [line(2, 30)] : [])], B: [line(9, 30)] }])),
};
const minutes = (injuries?: InjuryArchive) => {
  const lineup = rotations([{ data, box, injuries }], new Map([["x", curve]])).get("x")!.get("2026-10-13")!.A!;
  return Object.fromEntries(lineup.map((p) => [p.athlete, p.share * 48]));
};
const near = (actual: number, want: number, what: string) => assert.ok(Math.abs(actual - want) < 1e-9, `${what}: ${actual}, wanted ${want}`);

test("a player the injury report does not give a return for counts at the curve for the games he has missed in a row", () => {
  const m = minutes();
  near(m[1] + m[2] + m[3], 240, "the team's minutes");
  near(m[3] / m[1], 1, "players 1 and 3 have both missed none");
  near(m[2] / m[1], ((90 / 3.25) * curve[1]) / ((120 / 4.25) * curve[0]), "player 2 has missed one, in three appearances to their four");
});

test("a player the report gives a return for counts for the share of the team's next 10 games on or after it", () => {
  // The report saved the morning after the 13th expects player 3 back on the 20th, for 4 of A's next 10 games.
  const report = { athlete: 3, team: "A", status: "Out", date: "2026-10-14T01:00Z", returnDate: "2026-10-20" };
  const m = minutes({ season: "x", days: {
    "2026-10-13": { fetched: "2026-10-13T08:17:00.000Z", injuries: [{ ...report, returnDate: "2026-11-30" }] },
    "2026-10-14": { fetched: "2026-10-14T08:17:00.000Z", injuries: [report] },
  } });
  near(m[3] / m[1], 0.4, "player 3 against player 1, who is not on the report");
  near(m[2] / m[1], ((90 / 3.25) * curve[1]) / ((120 / 4.25) * curve[0]), "player 2 still counts at the curve");
});

test("a report fetched after its day's first tip-off is not read", () => {
  // The 14th's report was fetched after A's game tipped off at 23:00Z, so the 13th's, which has player 3 out past
  // A's next 10 games, stands.
  const report = { athlete: 3, team: "A", status: "Out", date: "2026-10-13T01:00Z", returnDate: "2026-11-30" };
  const m = minutes({ season: "x", days: {
    "2026-10-13": { fetched: "2026-10-13T08:17:00.000Z", injuries: [report] },
    "2026-10-14": { fetched: "2026-10-14T23:30:00.000Z", injuries: [{ ...report, returnDate: "2026-10-20" }] },
  } });
  near(m[3], 0, "player 3, out for all of A's next 10 games");
});

test("each season's curve is learned from the other seasons, leaving out a player who left his team", () => {
  // In season w, player 1 plays all 12 of A's games. Player 2 plays its first, then all of B's after; he left.
  // Player 4 plays A's first and is next seen for A in season x; he was out.
  const days = Array.from({ length: 12 }, (_, i) => ({ ...game(10 + i, true), t: `2025-10-${10 + i}T23:00Z` }));
  const w = {
    data: { season: "w", teams: { A: team("A"), B: team("B") }, games: days },
    box: { season: "w", games: Object.fromEntries(days.map((g, i) => [g.id, { A: [line(1, 30), ...(i ? [] : [line(2, 20), line(4, 20)])], B: [line(9, 30), ...(i ? [line(2, 20)] : [])] }])) },
  };
  const x = { data, box: { season: "x", games: { ...box.games, 10: { ...box.games[10], A: [...box.games[10].A, line(4, 20)] } } } };
  const curves = missedCurves([w, x]);
  assert.deepEqual(curves.get("x")!.slice(0, 3), [5 / 6, 0, 1], "after w's first two games: five players at none missed, one of them player 4, and player 4 at one");
  assert.deepEqual(curves.get("w"), new Array(10).fill(1), "x is too short to learn from, so a miss has no evidence against it");
});
