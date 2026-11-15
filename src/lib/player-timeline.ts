// The players page's one table: every player who was ever near the top of the league, with his rating at each
// sample since 2015-16 and the team he played for. Every season's fit is walked oldest first, because a player's
// minutes and team carry across seasons, and his value is read off it on the day before each season's first game,
// then about weekly through a finished season and on every game day of the season under way. Everything the page
// shows, from the day's top ten to the runs at No. 1, is worked out from this table by lib/player-chart.ts. The walk
// itself holds every player, which each player's own page reads (lib/player-page.ts); keepEver cuts it to the table.
import { addDays, ELO_PER_SIGMA, fitModel, PARAMS, type Abbr, type Fit, type ModelInputs, type SeasonData } from "./elo.ts";
import { ranking } from "./player-chart.ts";
import type { Athlete } from "./players.ts";

export type TimelinePlayer = {
  id: Athlete;
  name: string;
  /** His rating at each sample; null where he has none or is not yet ranked. Same length as `days`. */
  v: (number | null)[];
  /** [sample, team] at his first sample and wherever his team changes. */
  stints: [number, Abbr][];
};

export type PlayerTimeline = {
  /** One per sample, YYYY-MM-DD. */
  days: string[];
  /** Each season's first and last sample. */
  seasons: { id: string; label: string; from: number; to: number }[];
  players: TimelinePlayer[];
};

/** Career minutes, summed from the box scores walked so far, before a player is ranked: fewer say too little. */
export const MIN_MINUTES = 500;
/** The table keeps every player who was this high in the ranking at any sample, and nobody else. */
export const KEEP_TOP = 12;
/** Days from one sample of a finished season to the next: a game day is sampled once this many have passed. */
export const WEEK = 7;

/** One season as the walk reads it: src/lib/season.ts gives its games and model inputs. */
export type SeasonIn = { id: string; label: string; current: boolean; data: SeasonData; inputs: ModelInputs };

/**
 * A player's rating is his fitted value (Fit.v) on the Elo scale: points over a full 48 minutes against an average
 * player, kept to a hundredth so the served table stays small; the page ranks on it and shows it rounded.
 */
const SCALE = ELO_PER_SIGMA / PARAMS.sigma;

/** The table for `seasons` with every player in it, walked oldest first whatever their order, each named by `nameOf`. */
export function walkTimeline(seasons: readonly SeasonIn[], nameOf: (a: Athlete) => string | undefined): PlayerTimeline {
  const days: string[] = [];
  const spans: PlayerTimeline["seasons"] = [];
  const values = new Map<Athlete, (number | null)[]>();
  const stints = new Map<Athlete, [number, Abbr][]>();
  const minutes = new Map<Athlete, number>();
  const team = new Map<Athlete, Abbr>();

  const sample = (day: string, fit: Fit) => {
    const i = days.push(day) - 1;
    for (const [a, v] of fit.v) {
      const series = values.get(a) ?? values.set(a, []).get(a)!;
      series[i] = (minutes.get(a) ?? 0) >= MIN_MINUTES ? Math.round(v * SCALE * 100) / 100 : null;
      const t = team.get(a);
      const own = stints.get(a) ?? stints.set(a, []).get(a)!;
      if (t !== undefined && own.at(-1)?.[1] !== t) own.push([i, t]);
    }
  };

  for (const s of [...seasons].sort((x, y) => x.id.localeCompare(y.id))) {
    const fitted = fitModel(s.data, s.inputs);
    if (!fitted.length) continue;
    const box = s.inputs.players?.box.games ?? {};
    const linesOf = (gameId: string) => Object.entries(box[gameId] ?? {}).flatMap(([abbr, lines]) => (lines ?? []).map((l) => ({ abbr, athlete: l[0], minutes: l[1] })));
    // Before a season's first game a player is on the team he first plays for in it.
    const first = new Map<Athlete, Abbr>();
    for (const { games } of fitted) for (const { game } of games) for (const l of linesOf(game.id)) if (!first.has(l.athlete)) first.set(l.athlete, l.abbr);
    for (const [a, t] of first) team.set(a, t);
    const from = days.length;
    sample(addDays(fitted[0].day, -1), fitted[0].before);
    fitted.forEach(({ day, games, after }, k) => {
      for (const { game } of games) for (const l of linesOf(game.id)) {
        minutes.set(l.athlete, (minutes.get(l.athlete) ?? 0) + l.minutes);
        team.set(l.athlete, l.abbr);
      }
      if (s.current || k === fitted.length - 1 || day >= addDays(days.at(-1)!, WEEK)) sample(day, after);
    });
    spans.push({ id: s.id, label: s.label, from, to: days.length - 1 });
  }

  return {
    days,
    seasons: spans,
    players: [...values].map(([id, series]) => ({
      id,
      name: nameOf(id) ?? `Player ${id}`,
      v: Array.from({ length: days.length }, (_, i) => series[i] ?? null),
      stints: stints.get(id) ?? [],
    })),
  };
}

/** The table's players who were in the top `top` at some sample, in the table's order. */
export function keepEver(t: PlayerTimeline, top = KEEP_TOP): TimelinePlayer[] {
  const kept = new Set<Athlete>();
  for (let i = 0; i < t.days.length; i++) for (const p of ranking(t, i).slice(0, top)) kept.add(p.id);
  return t.players.filter((p) => kept.has(p.id));
}
