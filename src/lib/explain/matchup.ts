// How it works, step 5: a game's chance worked out as a sum the reader can add up. The page works out the games
// it offers on the server and its script swaps between them, both through these, so every game shows the chance
// the games page gives it.
import { gap, type Abbr, type Game, type Result, type Season } from "../elo.ts";
import type { Fixture } from "../fixtures.ts";
import { int, MINUS } from "../format.ts";

/**
 * Two teams to work a chance out for, the second at home: each one's rating going in, the home-court-adjusted
 * gap between them (elo.ts gap), and the home side's chance.
 */
export type Pairing = {
  away: Abbr;
  home: Abbr;
  neutral: boolean;
  r: { away: number; home: number };
  gap: number;
  p: number;
};

const pairing = (game: Game, r: Record<Abbr, number>, edge: number, p: number): Pairing => ({
  away: game.away,
  home: game.home,
  neutral: game.neutral,
  r: { away: r[game.away], home: r[game.home] },
  gap: gap(game, r, edge),
  p,
});

/** A game the games page lists, at the chance it lists (fixtures.ts fixture). */
export const ahead = (f: Fixture, model: Season): Pairing => pairing(f.game, model.r, model.home, f.lines[1].chance);

/** A played game as it stood at tip-off: each side's rating before it, and the chance it was given. */
export function before(result: Result, model: Season): Pairing {
  const { game, pre } = result;
  return pairing(game, { [game.home]: pre.h, [game.away]: pre.a }, model.home, result.p);
}

/**
 * A pairing as the reader adds it up: each rating and home court as shown, so `gap` is exactly home + court - away.
 */
export type Worked = { away: number; home: number; court: number; gap: number };

export function worked(p: Pairing, edge: number): Worked {
  const court = p.neutral ? 0 : Math.round(edge);
  const away = Math.round(p.r.away);
  const home = Math.round(p.r.home);
  return { away, home, court, gap: home + court - away };
}

/** A figure in the sum, with a real minus when the visitor is ahead: 202, −83. */
export const figure = (n: number) => (n < 0 ? `${MINUS}${-n}` : String(n));

/** A distance in rating points: "1 point", "202 points". */
export const points = (n: number) => `${int(n)} ${n === 1 ? "point" : "points"}`;

/** The sum in words, for its aria-label: which side is ahead, and by how much. */
export function told(w: Worked, names: { away: string; home: string }): string {
  const home = `${names.home} ${w.home}${w.court ? ` plus ${w.court} for home court` : ""}`;
  const away = `${names.away} ${w.away}`;
  return w.gap >= 0 ? `${home} is ${points(w.gap)} above ${away}.` : `${away} is ${points(-w.gap)} above ${home}.`;
}

/** A pairing's two sides, in the order a schedule reads them. */
export const SIDES = ["away", "home"] as const;
