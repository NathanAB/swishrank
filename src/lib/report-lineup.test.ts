import { test } from "node:test";
import assert from "node:assert/strict";
import type { Game, SeasonData } from "./elo.ts";
import type { InjuryArchive, Report } from "./injuries.ts";
import type { Lineup, Sides } from "./players.ts";
import { OUT_STATUSES, reportLineups, reportNext, withoutOut } from "./report-lineup.ts";

const team = (name: string) => ({ name, short: name, color: "000000", alternateColor: "ffffff" });
const game = (id: string, t: string): Game => ({ id, t, home: "A", away: "B", hs: 100, as: 90, final: true, neutral: false, note: null });
const entry = (athlete: number, team: string, status = "Out") => ({ athlete, team, status, date: "2026-10-27T21:41Z" });
const report = (fetched: string, ...injuries: ReturnType<typeof entry>[]): Report => ({ fetched, injuries });
// A's lineup: three players at 2, 2 and 1 of the 5 shares, 96, 96 and 48 of the 240 minutes.
const lineupA = (): Lineup => [{ athlete: 1, share: 2 }, { athlete: 2, share: 2 }, { athlete: 3, share: 1 }];
const lineupB = (): Lineup => [{ athlete: 9, share: 5 }];
const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-12, `${what}: ${a} vs ${b}`);
const total = (l: Lineup) => l.reduce((s, p) => s + p.share, 0);

test("an Out player leaves the lineup and the rest keep their ratios at the same total", () => {
  const out = withoutOut(lineupA(), "A", report("2026-10-29T08:00Z", entry(2, "A")));
  assert.deepEqual(out.map((p) => p.athlete), [1, 3]);
  near(total(out), 5, "shares");
  near(out[0].share / out[1].share, 2, "player 1 still plays twice player 3's minutes");
  assert.ok(OUT_STATUSES.has("Out") && !OUT_STATUSES.has("Day-To-Day"));
});

test("Day-To-Day, another team's Out, a player not in the lineup and no report change nothing", () => {
  for (const r of [
    report("2026-10-29T08:00Z", entry(2, "A", "Day-To-Day")),
    report("2026-10-29T08:00Z", entry(2, "B")),
    report("2026-10-29T08:00Z", entry(7, "A")),
    undefined,
  ]) assert.deepEqual(withoutOut(lineupA(), "A", r), lineupA());
  assert.deepEqual(withoutOut([], "A", report("2026-10-29T08:00Z", entry(2, "A"))), [], "empty stays empty");
  assert.deepEqual(withoutOut(lineupB(), "B", report("2026-10-29T08:00Z", entry(9, "B"))), [], "everyone out is empty");
});

test("a game's day report applies only when it was fetched before the day's first tip-off", () => {
  // Game 1 tips at 23:00Z on 10-29 (US Eastern 10-29); game 2 at 23:00Z on 10-30; game 3 on 10-31, which has no report.
  const data: SeasonData = {
    season: "2026-27", teams: { A: team("A"), B: team("B") },
    games: [game("1", "2026-10-29T23:00Z"), game("2", "2026-10-30T23:00Z"), game("3", "2026-10-31T23:00Z")],
  };
  const previous = new Map<string, Sides<Lineup>>(["1", "2", "3"].map((id) => [id, { home: lineupA(), away: lineupB() }]));
  const archive: InjuryArchive = {
    season: "2026-27",
    days: {
      "2026-10-29": report("2026-10-29T08:17:00.000Z", entry(1, "A"), entry(9, "B", "Day-To-Day")),
      "2026-10-30": report("2026-10-30T23:30:00.000Z", entry(1, "A")),
    },
  };
  const frozen = JSON.stringify([...previous]);
  const got = reportLineups(data, previous, archive);
  assert.deepEqual(got.get("1")!.home.map((p) => p.athlete), [2, 3], "the morning report takes player 1 out");
  assert.deepEqual(got.get("1")!.away, lineupB(), "Day-To-Day stays in");
  assert.deepEqual(got.get("2"), { home: lineupA(), away: lineupB() }, "a report saved after tip-off is ignored");
  assert.deepEqual(got.get("3"), { home: lineupA(), away: lineupB() }, "a day without a report keeps the previous lineups");
  assert.deepEqual([...reportLineups(data, previous, undefined)], [...previous], "no archive keeps every previous lineup");
  assert.equal(JSON.stringify([...previous]), frozen, "the previous lineups are not changed");
  assert.notEqual(got.get("3")!.home, previous.get("3")!.home, "the result is a new lineup, not the input");
});

test("games to come drop each team's Out players from the lineup it takes into its next game", () => {
  const next = { A: lineupA(), B: lineupB() };
  const frozen = JSON.stringify(next);
  const got = reportNext(next, report("2026-10-31T08:17:00.000Z", entry(3, "A"), entry(9, "A")));
  assert.deepEqual(got.A.map((p) => p.athlete), [1, 2]);
  near(total(got.A), 5, "A's shares");
  assert.deepEqual(got.B, lineupB(), "player 9 is listed for A, not B");
  assert.equal(JSON.stringify(next), frozen, "the next lineups are not changed");
});
