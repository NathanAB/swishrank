// Display formatting. Day keys are US Eastern calendar days as YYYY-MM-DD (elo.ts dayKey), so they are
// formatted as plain dates in UTC to stop the viewer's or the build machine's zone from shifting them.
import { addDays, TZ } from "./elo.ts";

export const MINUS = "−";

const intFmt = new Intl.NumberFormat("en-US");

/** A count with thousands separators: 1,322. */
export const int = (n: number) => intFmt.format(n);

/** The article a count under 100 takes at a sentence's start, by how it is read aloud: "An 8", "An 11", "A 12". */
export const articleFor = (n: number) => (String(n).startsWith("8") || n === 11 || n === 18 ? "An" : "A");

/** A count of points, a margin or a rating gap: "1 point", "202 points". */
export const points = (n: number) => `${int(n)} ${n === 1 ? "point" : "points"}`;

/** A change with its sign and a real minus: +5, −5, 0. */
export const signed = (n: number) => (n > 0 ? `+${int(n)}` : n < 0 ? `${MINUS}${int(-n)}` : "0");

/** A signed figure to a tenth, with a real minus: +1.5, −0.3, +2.0. */
export const signedTenth = (n: number) => `${n < 0 ? MINUS : "+"}${Math.abs(n).toFixed(1)}`;

/** A signed share as percentage points to a tenth: +9.6%, −0.4%. */
export const signedPercent = (p: number) => `${signedTenth(p * 100)}%`;

/** A figure in a sum, with a real minus and no plus: 202, −83. */
export const figure = (n: number) => (n < 0 ? `${MINUS}${-n}` : String(n));

/** A rating as the reader sees it everywhere: rounded to the point. */
export const rating = (v: number) => String(Math.round(v));

/** A probability in whole percent, as the reader sees it: 0.638 is 64. */
export const percent = (p: number) => Math.round(p * 100);

/** A probability as a whole percentage: 64%. */
export const pct = (p: number) => `${percent(p)}%`;

const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
};

/** A place in a table: 9th, or tied 9th when another team shares the rank. */
export const placeLabel = (rank: number, tied: boolean) => `${tied ? "tied " : ""}${ordinal(rank)}`;

/** The word between a game's two teams, away first: "at" the home team, or "vs" at a neutral site. */
export const between = (neutral: boolean) => (neutral ? "vs" : "at");

/** A game as a schedule names it: Pacers at Thunder, or Spurs vs Knicks at a neutral site. */
export const matchup = (away: string, home: string, neutral: boolean) => `${away} ${between(neutral)} ${home}`;

/** A season id with an en dash: 2026-27 becomes 2026–27. */
export const seasonLabel = (id: string) => id.replace("-", "–");

/** A won-lost record or a score: 70–32. */
export const record = (a: number, b: number) => `${a}–${b}`;

const asDate = (day: string) => new Date(`${day}T12:00:00Z`);
const dayPart = (day: string, opts: Intl.DateTimeFormatOptions) => asDate(day).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

/** Oct 24 */
export const shortDay = (day: string) => dayPart(day, { month: "short", day: "numeric" });
/** Oct 24, 2026 */
export const dayWithYear = (day: string) => dayPart(day, { month: "short", day: "numeric", year: "numeric" });
/** Sat, Oct 24 */
export const weekdayDay = (day: string) => dayPart(day, { weekday: "short", month: "short", day: "numeric" });
/** Saturday, October 24 */
export const longDay = (day: string) => dayPart(day, { weekday: "long", month: "long", day: "numeric" });
/** June 2026, from a YYYY-MM month key. With its year, since 2019-20 had two Octobers. */
export const monthName = (month: string) => dayPart(`${month}-01`, { month: "long", year: "numeric" });
/** Jun 2026, from a YYYY-MM month key, for a figure short of room */
export const monthYear = (month: string) => dayPart(`${month}-01`, { month: "short", year: "numeric" });
/** Jun, from a YYYY-MM month key, for axis labels */
export const monthShort = (month: string) => dayPart(`${month}-01`, { month: "short" });

/** What the week ahead calls a day near `today`: "Tonight" for today, "Tomorrow" for the next, null for a later one. */
export const nearDay = (day: string, today: string) => (day === today ? "Tonight" : day === addDays(today, 1) ? "Tomorrow" : null);

/** How a moment shows: a tip-off as its time, the footer's update as its date and time. */
export type Moment = "tip" | "stamp";

/** A moment as the build writes it, in US Eastern with its zone: 7:30 PM ET, or Oct 25, 2026, 1:43 PM ET. */
export const easternTime = (at: Date, kind: Moment) =>
  `${at.toLocaleString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", ...(kind === "stamp" && { year: "numeric", month: "short", day: "numeric" }) })} ET`;

/**
 * A moment in the reader's time zone (`zone`, the browser's own when left out), named: 4:30 PM PDT. Games
 * are listed under their US Eastern day, so a tip-off that falls on another day where the reader is says
 * which: Sun 1:30 AM GMT+1.
 */
export function localTime(at: Date, kind: Moment, zone?: string): string {
  const clock: Intl.DateTimeFormatOptions = { timeZone: zone, hour: "numeric", minute: "2-digit", timeZoneName: "short" };
  if (kind === "stamp") return at.toLocaleString("en-US", { ...clock, year: "numeric", month: "short", day: "numeric" });
  const time = at.toLocaleTimeString("en-US", clock);
  const day = (timeZone?: string) => at.toLocaleDateString("en-CA", { timeZone });
  return day(zone) === day(TZ) ? time : `${at.toLocaleDateString("en-US", { timeZone: zone, weekday: "short" })} ${time}`;
}
