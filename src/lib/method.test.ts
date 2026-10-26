import { test } from "node:test";
import assert from "node:assert/strict";
import type { Game, Result } from "./elo.ts";
import { examples } from "./method.ts";

// Every home team is the same 60% favourite and a neutral game is even, so only the margin and who won tell
// the games apart.
const game = (id: string, away: string, home: string, as: number, hs: number, neutral = false): Game => ({
  id, t: "2026-10-20T23:00Z", home, away, hs, as, final: true, neutral, note: null,
});
const results = (games: Game[]): Result[] =>
  games.map((g) => ({
    game: g, day: "2026-10-20", p: g.neutral ? 0.5 : 0.6,
    pre: { h: 1500, a: 1500 }, post: { h: 1500, a: 1500 },
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
