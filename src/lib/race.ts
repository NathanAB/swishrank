// The words and picks around the odds: how a chance is written, the teams the title race names, how a chance moved
// this week, and the title race's headline. Pure, so the tests read them without a build.
import { addDays, type Abbr, type Season } from "./elo.ts";
import { signed } from "./format.ts";
import type { OddsDay } from "./odds.ts";
import { stage } from "./teams.ts";

/** A chance in percent as the pages write it: whole numbers, under 1% and over 99% for the ends, 0% for never. */
export const oddsPct = (v: number) => (v <= 0 ? "0%" : v < 0.5 ? "<1%" : v >= 99.5 ? ">99%" : `${Math.round(v)}%`);

/** The title race draws a team whose title chance reached RACE_FLOOR percent on some day, at most RACE_LINES of them. */
export const RACE_FLOOR = 8;
export const RACE_LINES = 6;

/** The season's champion: the team that won four games of the Finals, or null while there is none. */
export function champion(model: Pick<Season, "results">): Abbr | null {
  const wins = new Map<Abbr, number>();
  for (const r of model.results) {
    if (!/^NBA Finals\b/.test(r.game.note ?? "") || stage(r.game.note).phase !== "playoffs") continue;
    const w = r.game.hs! > r.game.as! ? r.game.home : r.game.away;
    wins.set(w, (wins.get(w) ?? 0) + 1);
  }
  return [...wins].find(([, n]) => n === 4)?.[0] ?? null;
}

/**
 * The teams the title race draws, likeliest on its last day first: those whose chance reached RACE_FLOOR on some
 * day, the RACE_LINES that ran highest if more did, and at least the three that ran highest. A finished season's
 * champion is always one of them.
 */
export function contenders(history: readonly OddsDay[], champ: Abbr | null): Abbr[] {
  const last = history[history.length - 1];
  const peak = new Map(Object.keys(last.title).map((a) => [a, Math.max(...history.map((d) => d.title[a]))]));
  const byPeak = [...peak.keys()].sort((a, b) => peak.get(b)! - peak.get(a)! || a.localeCompare(b));
  let picked = byPeak.filter((a, i) => i < 3 || peak.get(a)! >= RACE_FLOOR).slice(0, RACE_LINES);
  if (champ && !picked.includes(champ)) picked = [...picked.slice(0, RACE_LINES - 1), champ];
  return picked.sort((a, b) => last.title[b] - last.title[a] || a.localeCompare(b));
}

/** The day a week before the race's last, or its first day when it is younger than a week, and which it is. */
export function weekBefore(history: readonly OddsDay[]): { day: OddsDay; since: "week" | "opening" } {
  const last = history[history.length - 1];
  const target = addDays(last.day, -7);
  const at = history.findIndex((d) => d.day >= target);
  return at > 0 ? { day: history[at], since: "week" } : { day: history[0], since: "opening" };
}

/** "+3 this week", "−21 since opening night" or "No change this week", for a team's chance of `key`. */
export function moveWords(history: readonly OddsDay[], abbr: Abbr, key: "title" | "playoffs"): { text: string; sign: number } {
  const { day, since } = weekBefore(history);
  const d = Math.round(history[history.length - 1][key][abbr]) - Math.round(day[key][abbr]);
  const when = since === "week" ? "this week" : "since opening night";
  return d === 0 ? { text: `No change ${when}`, sign: 0 } : { text: `${signed(d)} ${when}`, sign: Math.sign(d) };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "early December", "mid-January", "late March" */
const monthPart = (day: string) => {
  const d = Number(day.slice(8));
  return `${d <= 10 ? "early " : d <= 20 ? "mid-" : "late "}${MONTHS[Number(day.slice(5, 7)) - 1]}`;
};

/** The title race's headline: who leads and who moved this week, or for a finished season how its champion's chances ran. */
export function raceLead(history: readonly OddsDay[], name: (a: Abbr) => string, label: string, champ: Abbr | null): string {
  const last = history[history.length - 1];
  const abbrs = Object.keys(last.title);
  if (champ) {
    const ts = history.map((d) => d.title[champ]);
    const max = Math.max(...ts);
    const top = abbrs.map((a) => ({ a, days: history.filter((d) => abbrs.every((b) => d.title[b] <= d.title[a])).length })).sort((x, y) => y.days - x.days)[0];
    const fav = top.a === champ ? `They were the favourites for ${top.days * 2 > history.length ? "most" : "much"} of the season.` : `The ${name(top.a)} were the favourites for ${top.days * 2 > history.length ? "most" : "much"} of the season.`;
    return `The ${name(champ)} won the ${label} title. They started the season with a ${oddsPct(ts[0])} chance and peaked at ${oddsPct(max)} in ${monthPart(history[ts.indexOf(max)].day)}. ${fav}`;
  }
  const lead = [...abbrs].sort((a, b) => last.title[b] - last.title[a])[0];
  const head = `The ${name(lead)} have the best chance to win the title, at ${oddsPct(last.title[lead])}.`;
  if (history.length < 2) return head;
  const { day, since } = weekBefore(history);
  const moves = abbrs.map((a) => ({ a, d: Math.round(last.title[a]) - Math.round(day.title[a]) })).sort((x, y) => y.d - x.d);
  const up = moves[0], down = moves[moves.length - 1];
  if (up.d <= 0 && down.d >= 0) return head;
  const when = since === "week" ? "This week" : "Since opening night";
  const rose = up.d > 0 ? `the ${name(up.a)} rose the most, from ${oddsPct(day.title[up.a])} to ${oddsPct(last.title[up.a])}` : "";
  const fell = down.d < 0 ? `the ${name(down.a)} fell the most, from ${oddsPct(day.title[down.a])} to ${oddsPct(last.title[down.a])}` : "";
  return `${head} ${when} ${[rose, fell].filter(Boolean).join(", and ")}.`;
}
