import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, type Game, type Result } from "./elo.ts";
import { examples, offDay } from "./method.ts";

const game = (id: string, away: string, home: string, as: number, hs: number, neutral = false): Game => ({
  id, t: "2026-10-20T23:00Z", home, away, hs, as, final: true, neutral, note: null,
});
const results = (games: Game[]): Result[] =>
  games.map((g) => ({
    game: g, day: "2026-10-20", p: g.neutral ? 0.5 : 0.6,
    pre: { h: 1000, a: 1000 }, post: { h: 1000, a: 1000 },
  }));

test("with no margin in common, picks the favourite's narrowest win, the underdog's narrowest and the favourite's widest, earliest first on a tie", () => {
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
    [["close", "fav by 2", 2], ["upset", "dog by 4", 4], ["blowout", "fav by 30", 30]],
  );
});

test("compares the favourite's and the underdog's wins at the narrowest margin both have won by", () => {
  const { contrasts } = examples(results([
    game("fav by 2", "A", "B", 100, 102),
    game("fav by 5", "C", "D", 100, 105),
    game("dog by 3", "E", "F", 103, 100),
    game("dog by 5", "G", "H", 105, 100),
    game("fav by 7", "I", "J", 93, 100),
    game("dog by 7", "K", "L", 107, 100),
  ]));
  assert.deepEqual(
    contrasts.map((c) => [c.kind, c.game.result.game.id]),
    [["close", "fav by 5"], ["upset", "dog by 5"], ["blowout", "fav by 7"]],
  );
});

test("leaves out a kind with no game yet", () => {
  assert.deepEqual(examples([]), { opener: null, contrasts: [] });
  const { contrasts } = examples(results([game("fav by 5", "A", "B", 100, 105)]));
  assert.deepEqual(contrasts.map((c) => c.kind), ["close", "blowout"]);
});

test("names a team that rose on a day it did not play, and the team it had beaten that won that day", () => {
  // A beats B, D beats C and I beats H; the next day B, C, D and I all win. A and H rest and rise, H by more,
  // but H lost to I rather than beat it. D rises most and had beaten C, but D played.
  const dayTwo = (g: Game): Game => ({ ...g, t: "2026-10-21T23:00Z" });
  const m = compute({
    season: "x",
    teams: Object.fromEntries([..."ABCDEFGHIJ"].map((a) => [a, { name: a, short: a, color: "000000", alternateColor: "ffffff" }])),
    games: [
      game("A beats B", "B", "A", 100, 101, true),
      game("D beats C", "C", "D", 100, 101, true),
      game("I beats H", "H", "I", 100, 101, true),
      dayTwo(game("B beats E", "E", "B", 100, 120, true)),
      dayTwo(game("C beats F", "F", "C", 100, 130, true)),
      dayTwo(game("D beats G", "G", "D", 100, 140, true)),
      dayTwo(game("I beats J", "J", "I", 100, 160, true)),
    ],
  });
  const pick = offDay(m.results, m.series);
  assert.deepEqual(
    pick && [pick.abbr, pick.day, pick.change, pick.beaten.result.game.id, pick.win.result.game.id],
    ["A", "2026-10-21", 2, "A beats B", "B beats E"],
  );
});
