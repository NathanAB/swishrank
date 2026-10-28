// What a winning margin counts for in the fit against a 1-point win, as How it works' step 3 says it. The
// drawing's server render and its live readout both take their words from here.
import { counted, PARAMS } from "../elo.ts";

/** The widest margin the drawing offers. */
export const MOST = 50;

const worthOf = (margin: number) => counted(margin, PARAMS.margin);

/** How many times a 1-point win an n-point win counts, to one decimal. */
export const times = (n: number) => (worthOf(n) / worthOf(1)).toFixed(1);

/** How an n-point win compares with a 1-point win, as a sentence in three parts: before the figure, the figure, after it. */
export const worth = (n: number): [string, string, string] =>
  n === 1 ? ["A 1-point win is the least a win counts.", "", ""] : [`A ${n}-point win counts `, `${times(n)} times`, " as much as a 1-point win."];
