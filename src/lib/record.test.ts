import { test } from "node:test";
import assert from "node:assert/strict";
import { bands, sameGames, summary, type Call } from "./record.ts";

const call = (id: string, p: number, y: 0 | 1): Call => ({ id, season: "2025-26", p, y });

test("a game falls in the band of its favourite's chance: an even game is the home side's, an edge opens the band above it, and a home underdog's game is the away favourite's", () => {
  const got = bands([
    call("even", 0.5, 0), // the home side is the favourite at 50%, and lost
    call("edge", 0.55, 1),
    call("sixty", 0.6, 1),
    call("underdog", 0.3, 1), // the away side is a 70% favourite, and the home side won
    call("sure", 1, 1),
  ]);
  assert.deepEqual(
    got.map(({ lo, games, won }) => ({ lo, games, won })),
    [
      { lo: 50, games: 1, won: 0 },
      { lo: 55, games: 1, won: 1 },
      { lo: 60, games: 1, won: 1 },
      { lo: 70, games: 1, won: 0 },
      { lo: 95, games: 1, won: 1 },
    ],
  );
});

test("a band counts its games, the favourite's wins and the mean chance it was given, whichever side the favourite was", () => {
  const got = bands([
    call("a", 0.71, 1), // home favourite won
    call("b", 0.29, 0), // away favourite at 71% won
    call("c", 0.74, 0), // home favourite lost
    call("d", 0.52, 1),
  ]);
  assert.equal(got.length, 2);
  assert.deepEqual({ lo: got[1].lo, games: got[1].games, won: got[1].won }, { lo: 70, games: 3, won: 2 });
  assert.ok(Math.abs(got[1].stated - 0.72) < 1e-12, `stated ${got[1].stated}`);
});

test("the summary gives the share of games the favourite won, an even game counting the home side as favourite, and the log loss", () => {
  // a: home favourite won. b: away favourite lost. c and d: even games the home side won, so the favourite won.
  const got = summary([call("a", 0.8, 1), call("b", 0.4, 1), call("c", 0.5, 1), call("d", 0.5, 1)]);
  assert.equal(got.games, 4);
  assert.equal(got.favouriteWon, 0.75);
  // -(ln 0.8 + ln 0.4 + ln 0.5 + ln 0.5) / 4
  assert.ok(Math.abs(got.logLoss - 0.6314321611) < 1e-9, `log loss ${got.logLoss}`);
});

test("the comparison scores the model and Vegas on the games Vegas priced and no others", () => {
  const calls = [call("a", 0.6, 1), call("b", 0.7, 0), call("c", 0.4, 0)];
  const got = sameGames(calls, { a: 0.65, c: 0.7 });
  assert.deepEqual([got.model.games, got.vegas.games], [2, 2]);
  // a: both favourites are home, and home won. c: the model's away favourite won; Vegas had home at 70%, and home lost.
  // b, which the model missed, has no line, so it counts against neither.
  assert.deepEqual([got.model.favouriteWon, got.vegas.favouriteWon], [1, 0.5]);
});
