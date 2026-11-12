import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, type Game, type Result } from "./elo.ts";
import { examples, offDay, upsetRatio } from "./method.ts";

const game = (id: string, away: string, home: string, as: number, hs: number, neutral = false): Game => ({
  id, t: "2026-10-20T23:00Z", home, away, hs, as, final: true, neutral, note: null,
});
/** Results at a 60% home chance. `gains` gives a game's winner its rating gain, by game id; the rest gain 0. */
const results = (games: Game[], gains: Record<string, number> = {}): Result[] =>
  games.map((g) => {
    const won = g.hs! > g.as! ? "h" : "a";
    const post = { h: 1000, a: 1000, [won]: 1000 + (gains[g.id] ?? 0) };
    return { game: g, day: "2026-10-20", p: g.neutral ? 0.5 : 0.6, pre: { h: 1000, a: 1000 }, post, shown: post };
  });

test("with no margin in common, picks the favourite's narrowest win and its widest, earliest first on a tie, and leaves the underdog's out", () => {
  const { opener, contrasts } = examples(results([
    game("fav by 5", "A", "B", 100, 105),
    game("fav by 2", "C", "D", 100, 102),
    game("fav by 2, later", "E", "F", 90, 92),
    game("fav by 30", "G", "H", 100, 130),
    game("dog by 9", "I", "J", 109, 100),
    game("dog by 4", "K", "L", 104, 100),
    game("even, by 1", "M", "N", 101, 100, true),
  ]));
  assert.equal(opener?.result.game.id, "fav by 5");
  assert.deepEqual(
    contrasts.map((c) => [c.kind, c.game.result.game.id, c.margin]),
    [["close", "fav by 2", 2], ["blowout", "fav by 30", 30]],
  );
});

const SHARED = [
  game("fav by 2", "A", "B", 100, 102),
  game("fav by 5", "C", "D", 100, 105),
  game("dog by 3", "E", "F", 103, 100),
  game("dog by 5", "G", "H", 105, 100),
  game("fav by 7", "I", "J", 93, 100),
  game("dog by 7", "K", "L", 107, 100),
];

test("compares a favourite's and an underdog's wins by the same margin, the narrower margin first when two pairs are as near the mean gains", () => {
  const { contrasts } = examples(results(SHARED, { "fav by 5": 3, "dog by 5": 8, "fav by 7": 3, "dog by 7": 8 }));
  assert.deepEqual(
    contrasts.map((c) => [c.kind, c.game.result.game.id]),
    [["close", "fav by 5"], ["upset", "dog by 5"], ["blowout", "fav by 7"]],
  );
});

test("passes over a margin where the underdog's win earned no more than the favourite's, as 2026-27's 1-point wins did", () => {
  const { contrasts } = examples(results(SHARED, { "fav by 5": 6, "dog by 5": 5, "fav by 7": 3, "dog by 7": 9 }));
  assert.deepEqual(
    contrasts.map((c) => [c.kind, c.game.result.game.id]),
    [["close", "fav by 7"], ["upset", "dog by 7"], ["blowout", "fav by 7"]],
  );
});

test("leaves the underdog's win out when none earned more than a favourite's by the same margin", () => {
  const { contrasts } = examples(results(SHARED, { "fav by 5": 6, "dog by 5": 6, "fav by 7": 4, "dog by 7": 2 }));
  assert.deepEqual(contrasts.map((c) => [c.kind, c.game.result.game.id]), [["close", "fav by 2"], ["blowout", "fav by 7"]]);
});

test("of the same-margin pairs where the underdog's win earned more, takes the one nearest the season's mean gains", () => {
  const { contrasts } = examples(results(
    [
      game("fav, least", "A", "B", 100, 105), game("fav, most", "C", "D", 100, 105), game("fav, middle", "E", "F", 100, 105),
      game("dog, most", "G", "H", 105, 100), game("dog, least", "I", "J", 105, 100), game("dog, middle", "K", "L", 105, 100),
    ],
    // Favourites gain 1, 6 and 3, mean 3 1/3; underdogs 10, 6 and 7, mean 7 2/3. The 3 and the 7 are 1 off in all.
    { "fav, least": 1, "fav, most": 6, "fav, middle": 3, "dog, most": 10, "dog, least": 6, "dog, middle": 7 },
  ));
  assert.deepEqual(contrasts.slice(0, 2).map((c) => [c.kind, c.game.result.game.id]), [["close", "fav, middle"], ["upset", "dog, middle"]]);
});

test("an underdog's win earns the mean of underdogs' gains over the mean of favourites', an even game counting for neither", () => {
  const games = [
    game("f1", "A", "B", 100, 105), game("f2", "C", "D", 100, 105), game("f3", "E", "F", 100, 105),
    game("d1", "G", "H", 105, 100), game("d2", "I", "J", 105, 100), game("even", "K", "L", 101, 100, true),
  ];
  // Favourites gain 2, 4 and 3, mean 3; underdogs 6 and 12, mean 9.
  assert.equal(upsetRatio(results(games, { f1: 2, f2: 4, f3: 3, d1: 6, d2: 12, even: 50 })), 3);
  assert.equal(upsetRatio(results(games.slice(0, 3), { f1: 2, f2: 4, f3: 3 })), null);
  assert.equal(upsetRatio(results(games, { d1: 6, d2: 12 })), null);
});

test("leaves out a kind with no game yet", () => {
  assert.deepEqual(examples([]), { opener: null, contrasts: [] });
  const { contrasts } = examples(results([game("fav by 5", "A", "B", 100, 105)]));
  assert.deepEqual(contrasts.map((c) => c.kind), ["close", "blowout"]);
});

test("names no team that rose on a day it did not play: under the site's model a team that rests keeps its rating", () => {
  // A beats B, D beats C and I beats H; two days later B, C, D and I all win while A and H rest. K and L open the
  // season a year earlier, so by these days the pull toward each team's seed has faded and one game moves a rating.
  // A and H still have a game to come, so their seasons are not over.
  const dayTwo = (g: Game): Game => ({ ...g, t: "2026-10-22T23:00Z" });
  const m = compute({
    season: "x",
    teams: Object.fromEntries([..."ABCDEFGHIJKL"].map((a) => [a, { name: a, short: a, color: "000000", alternateColor: "ffffff" }])),
    games: [
      { ...game("K beats L", "L", "K", 100, 101, true), t: "2025-10-20T23:00Z" },
      game("A beats B", "B", "A", 100, 101, true),
      game("D beats C", "C", "D", 100, 101, true),
      game("I beats H", "H", "I", 100, 101, true),
      dayTwo(game("B beats E", "E", "B", 100, 120, true)),
      dayTwo(game("C beats F", "F", "C", 100, 130, true)),
      dayTwo(game("D beats G", "G", "D", 100, 140, true)),
      dayTwo(game("I beats J", "J", "I", 100, 160, true)),
      { ...game("A and H to come", "H", "A", 0, 0), t: "2026-10-24T23:00Z", hs: null, as: null, final: false },
    ],
  });
  // Under the plain re-fit, A rose 12 that day for B's win over E. Since 2026-11-01 a team moves only on its game days.
  assert.equal(offDay(m.results, m.series), null);
  const rated = (day: string) => m.series.find((x) => x.day === day)!.r.A;
  assert.equal(rated("2026-10-22"), rated("2026-10-20"));
});
