// The ratings a season's odds play its games with. A team's shown rating leaves out the players out for weeks
// (src/lib/inputs.ts longAbsences), which is right for its next games and too harsh for the rest of a season, so for
// the odds each such player comes back on the return date the report gives, at the minutes he has played for the
// team this season, or last season's anywhere.
import { addDays, ELO_PER_SIGMA, PARAMS, playerPart, START, type Abbr, type Fit, type FitDay, type Season, type ShownLineups } from "./elo.ts";
import type { LongAbsences } from "./inputs.ts";
import { scaled, type Athlete, type Lineup, type SeasonBox } from "./players.ts";
import { shownOutlook, type Outlook } from "./project.ts";

/** A player's minutes a game: for `abbr` this season if he has played for it, else last season's anywhere, else 0. */
export function minutesTable(box: SeasonBox, lastBox: SeasonBox | undefined): (athlete: Athlete, abbr: Abbr) => number {
  const sum = new Map<string, [number, number]>();
  const add = (key: string, min: number) => { const s = sum.get(key) ?? [0, 0]; s[0] += min; s[1]++; sum.set(key, s); };
  for (const sides of Object.values(box.games)) for (const [abbr, lines] of Object.entries(sides)) for (const l of lines ?? []) add(`${abbr} ${l[0]}`, l[1]);
  for (const sides of Object.values(lastBox?.games ?? {})) for (const lines of Object.values(sides)) for (const l of lines ?? []) add(`last ${l[0]}`, l[1]);
  const mean = (key: string) => { const s = sum.get(key); return s ? s[0] / s[1] : undefined; };
  return (athlete, abbr) => mean(`${abbr} ${athlete}`) ?? mean(`last ${athlete}`) ?? 0;
}

export type ReturnsInputs = {
  model: Season;
  /** The season's fits, day by day (elo.ts fitModel). */
  fits: readonly FitDay[];
  /** Each team's usual rotation, the injury report left out (elo.ts shownLineups over players.ts usualRotations). */
  usual: ShownLineups;
  /** Who the shown rating leaves out for weeks, after each game day; undefined without injury reports. */
  away: LongAbsences | undefined;
  minutes: (athlete: Athlete, abbr: Abbr) => number;
  /** The regular season's last day: a return after it stays out. */
  end: string;
};

/**
 * Each team's ratings for the games after `day`: its shown rating that day, then a step up each time one of the
 * players its rotation leaves out for weeks comes back, on his listed return date, or the next day when that date has
 * passed. A player with no return date, or one after `end`, stays out. A day before the first game day reads the
 * absences of the first, as the shown rating's opening rotation does.
 */
export function returnsOutlook({ model, fits, usual, away, minutes, end }: ReturnsInputs, day: string): Outlook {
  const outlook = shownOutlook(model, day);
  const upTo = fits.filter((f) => f.day <= day).at(-1);
  const fit: Fit = upTo?.after ?? fits[0]?.before;
  const gone = away?.get(upTo?.day ?? fits[0]?.day ?? "");
  if (!fit || !gone) return outlook;
  const rotation = (upTo && usual.after.get(upTo.day)) || usual.opening;
  const scale = ELO_PER_SIGMA / PARAMS.sigma;
  const out = new Map<Abbr, { athlete: Athlete; date: string }[]>();
  for (const [abbr, players] of gone) for (const [athlete, date] of players) {
    if (!date || date > end || !(abbr in outlook)) continue;
    out.set(abbr, [...(out.get(abbr) ?? []), { athlete, date: date > day ? date : addDays(day, 1) }]);
  }
  for (const [abbr, list] of out) {
    const sorted = [...list].sort((x, y) => x.date.localeCompare(y.date));
    // Those still out keep the gap on their minutes (elo.ts gapValue), as the shown rating counts them, so each
    // step is one player's return alone.
    const lineup = (back: number): Lineup => {
      const away = new Set(sorted.slice(back).map((r) => r.athlete));
      const players = (rotation[abbr] ?? []).filter((s) => !away.has(s.athlete)).map((s) => ({ athlete: s.athlete, min: s.share * 48 }));
      for (const r of sorted.slice(0, back)) {
        const min = minutes(r.athlete, abbr);
        if (min > 0 && !players.some((p) => p.athlete === r.athlete)) players.push({ athlete: r.athlete, min });
      }
      const gaps = (rotation[abbr] ?? []).filter((s) => away.has(s.athlete)).map((s) => ({ athlete: -s.athlete, share: s.share }));
      return players.length ? [...scaled(players), ...gaps] : [];
    };
    const steps = [outlook[abbr][0]];
    sorted.forEach((r, k) => steps.push({ day: r.date, rating: START + (fit.r[abbr] + playerPart(fit, lineup(k + 1))) * scale }));
    outlook[abbr] = steps;
  }
  return outlook;
}
