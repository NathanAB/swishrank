// Display formatting. Day keys are US Eastern calendar days as YYYY-MM-DD (elo.ts dayKey), so they are
// formatted as plain dates in UTC to stop the viewer's or the build machine's zone from shifting them.
import { addDays, TZ } from "./elo.ts";

export const MINUS = "−";
export const DASH = "—";

const intFmt = new Intl.NumberFormat("en-US");

/** A count with thousands separators: 1,322. */
export const int = (n: number) => intFmt.format(n);

/** A change with its sign and a real minus: +5, −5, 0. */
export const signed = (n: number) => (n > 0 ? `+${int(n)}` : n < 0 ? `${MINUS}${int(-n)}` : "0");

/** A rating as the reader sees it everywhere: rounded to the point. */
export const rating = (v: number) => String(Math.round(v));

/** A probability in whole percent, as the reader sees it: 0.638 is 64. */
export const percent = (p: number) => Math.round(p * 100);

/** A probability as a whole percentage: 64%. */
export const pct = (p: number) => `${percent(p)}%`;

export const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
};

/** A season id with an en dash: 2026-27 becomes 2026–27. */
export const seasonLabel = (id: string) => id.replace("-", "–");

/** A won-lost record or a score: 70–32. */
export const record = (a: number, b: number) => `${a}–${b}`;

const asDate = (day: string) => new Date(`${day}T12:00:00Z`);
const dayPart = (day: string, opts: Intl.DateTimeFormatOptions) => asDate(day).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

/** Oct 24 */
export const shortDay = (day: string) => dayPart(day, { month: "short", day: "numeric" });
/** Sat, Oct 24 */
export const weekdayDay = (day: string) => dayPart(day, { weekday: "short", month: "short", day: "numeric" });
/** Saturday, October 24 */
export const longDay = (day: string) => dayPart(day, { weekday: "long", month: "long", day: "numeric" });
/** June 2026, from a YYYY-MM month key. With its year, since 2019-20 had two Octobers. */
export const monthName = (month: string) => dayPart(`${month}-01`, { month: "long", year: "numeric" });
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
