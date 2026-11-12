import { test } from "node:test";
import assert from "node:assert/strict";
import { injuryRecordOf, listingsOf, MIN_QUESTIONABLE, type Listing } from "./injury-record.ts";
import type { NbaStatus } from "./nba-report.ts";
import type { BoxLine } from "./players.ts";

const line = (athlete: number): BoxLine => [athlete, 24, 10, 4, 9, 2, 2, 1, 3, 2, 1, 0, 1, 2];
const game = (id: string, t: string, home: string, away: string, final = true) => ({ id, t, home, away, final });

// Player 1 plays for LAL, player 2 for LAL and then DAL, player 3 for BOS.
const season = {
  id: "2025-26",
  games: [
    game("g3", "2026-01-03T01:00Z", "DAL", "LAL"),
    game("g1", "2026-01-01T01:00Z", "LAL", "BOS"),
    game("g2", "2026-01-02T01:00Z", "LAL", "BOS", false),
  ],
  archive: {
    season: "2025-26",
    games: {
      // BOS's side was not submitted, so player 3 is on no report though he played.
      g1: { published: "2025-12-31T17:00", home: { "1": "Questionable" as const, "2": "Questionable" as const }, away: null, unmatched: ["LAL Nobody, Some"] },
      g2: { published: "2026-01-01T17:00", home: { "1": "Out" as const }, away: null },
      g3: { published: "2026-01-02T17:00", home: { "2": "Probable" as const }, away: { "1": "Doubtful" as const } },
    },
  },
  // g2 is under way, with a box so far.
  box: { season: "2025-26", games: { g1: { LAL: [line(1)], BOS: [line(3)] }, g2: { LAL: [line(1)] }, g3: { DAL: [line(2)], LAL: [] } } },
};

test("each final game's report lists its players, in the order the games tipped off, and a player played when his team's box has his line", () => {
  assert.deepEqual(
    listingsOf(season).map(({ game, team, athlete, status, played }) => ({ game, team, athlete, status, played })),
    [
      { game: "g1", team: "LAL", athlete: 1, status: "Questionable", played: true },
      { game: "g1", team: "LAL", athlete: 2, status: "Questionable", played: false },
      { game: "g3", team: "DAL", athlete: 2, status: "Probable", played: true },
      { game: "g3", team: "LAL", athlete: 1, status: "Doubtful", played: false },
    ],
  );
});

const listing = (athlete: number, team: string, status: NbaStatus, played: boolean, season = "2025-26", i = 0, t = ""): Listing =>
  ({ season, game: `${season}-${team}-${athlete}-${i}`, t, team, athlete, status, played });
const times = (n: number, make: (i: number) => Listing) => Array.from({ length: n }, (_, i) => make(i));

test("the record tallies how often each status played, overall and season by season, newest season first from its first listing, and counts the games", () => {
  const r = injuryRecordOf([
    listing(1, "LAL", "Questionable", true, "2024-25", 0, "2024-11-01T00:00Z"),
    listing(2, "LAL", "Questionable", false, "2024-25", 1, "2024-11-02T00:00Z"),
    { ...listing(1, "LAL", "Out", false, "2025-26", 2, "2025-11-01T23:00Z"), game: "one" },
    { ...listing(2, "LAL", "Questionable", true, "2025-26", 3, "2025-11-01T23:00Z"), game: "one" },
  ]);
  assert.equal(r.since, "2024-25");
  assert.equal(r.games, 3);
  assert.deepEqual(r.statuses.Questionable, { listed: 3, played: 2 });
  assert.deepEqual(r.statuses.Out, { listed: 1, played: 0 });
  assert.deepEqual(r.statuses.Probable, { listed: 0, played: 0 });
  assert.deepEqual(
    r.seasons.map((s) => [s.id, s.from, s.statuses.Questionable, s.statuses.Out]),
    [
      ["2025-26", "2025-11-01T23:00Z", { listed: 1, played: 1 }, { listed: 1, played: 0 }],
      ["2024-25", "2024-11-01T00:00Z", { listed: 2, played: 1 }, { listed: 0, played: 0 }],
    ],
  );
});

test(`the player table keeps players with ${MIN_QUESTIONABLE} or more Questionable listings, most first, with their Probable listings beside them`, () => {
  const r = injuryRecordOf([
    ...times(20, (i) => listing(1, "LAL", "Questionable", i < 15, "2025-26", i)),
    ...times(3, (i) => listing(1, "LAL", "Probable", i < 2, "2025-26", 100 + i)),
    ...times(19, (i) => listing(2, "BOS", "Questionable", true, "2025-26", i)),
    ...times(30, (i) => listing(3, "MIA", "Probable", true, "2025-26", i)),
    ...times(25, (i) => listing(4, "MIA", "Questionable", i < 5, "2025-26", i)),
  ]);
  assert.deepEqual(
    r.players.map((p) => [p.athlete, p.questionable, p.probable]),
    [
      [4, { listed: 25, played: 5 }, { listed: 0, played: 0 }],
      [1, { listed: 20, played: 15 }, { listed: 3, played: 2 }],
    ],
  );
});

test("a player's teams run in the order he was last listed with each, so his newest team comes last", () => {
  const r = injuryRecordOf([
    ...times(10, (i) => listing(1, "LAL", "Questionable", true, "2024-25", i)),
    ...times(10, (i) => listing(1, "DAL", "Questionable", true, "2025-26", i)),
    listing(1, "LAL", "Out", false, "2025-26", 50),
    ...times(5, (i) => listing(1, "WSH", "Questionable", false, "2025-26", 60 + i)),
  ]);
  assert.deepEqual(r.players.map((p) => p.teams), [["DAL", "LAL", "WSH"]]);
});

test("each team's Questionable listings are tallied, ignoring other statuses, and the teams run from the highest share who played", () => {
  const r = injuryRecordOf([
    ...times(4, (i) => listing(1, "IND", "Questionable", i < 1, "2025-26", i)), // 1 of 4
    ...times(3, (i) => listing(2, "LAL", "Questionable", i < 2, "2025-26", i)), // 2 of 3
    ...times(5, (i) => listing(2, "LAL", "Probable", true, "2025-26", 10 + i)),
    ...times(2, (i) => listing(3, "ORL", "Questionable", i < 1, "2025-26", i)), // 1 of 2
    listing(4, "BOS", "Out", false),
  ]);
  assert.deepEqual(r.teams, [
    { team: "LAL", questionable: { listed: 3, played: 2 } },
    { team: "ORL", questionable: { listed: 2, played: 1 } },
    { team: "IND", questionable: { listed: 4, played: 1 } },
  ]);
});
