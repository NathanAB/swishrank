// One player's page (src/pages/players/[player].astro), worked out from what the site already computes: his rating at
// every sample of the timeline walk (lib/player-timeline.ts walkTimeline, which keeps every player, not only the
// players page's top 12), the current season's model (lib/elo.ts compute) for his team and what he is worth to it, and
// the season's inputs for what his value is made of and his games.
import { dayKey, ELO_PER_SIGMA, PARAMS, type Abbr, type Season } from "./elo.ts";
import { figure, signed } from "./format.ts";
import { firstFull, ranking } from "./player-chart.ts";
import { KEEP_TOP, type PlayerTimeline, type TimelinePlayer } from "./player-timeline.ts";
import type { Athlete, BoxLine, BoxRatings, SeasonBox } from "./players.ts";

const SCALE = ELO_PER_SIGMA / PARAMS.sigma;

/** A sample of his rating: its day, his rating, and his place in the league when he was in the top KEEP_TOP. */
export type Sample = [day: string, rating: number, rank: number | null];

/** His team now, what his rating counts for in its lineup, and its rating with him and with his slot a gap slot. */
export type Worth = {
  team: Abbr;
  /** His expected minutes a game. */
  minutes: number;
  /** The lineup counts him out for weeks: the team's rating already has his gap slot. */
  out: boolean;
  /** Every team's shown rating, his team's with him. */
  league: Record<Abbr, number>;
  /** His team's rating with his slot a gap slot; his team's rating when he is out. */
  without: number;
};

/** His value split as the fit pulls it: toward a times his box rating, plus his on-court part, and what the games moved. */
export type Parts = { box: number; onCourt: number; games: number; value: number };

/** One game of the season under way, dated by its Eastern day, with his rating after it and how far that day moved it. */
export type GameRow = {
  day: string;
  team: Abbr;
  opp: Abbr;
  home: boolean;
  neutral: boolean;
  us: number;
  them: number;
  line: BoxLine;
  after: number | null;
  change: number | null;
};

export type PlayerView = {
  id: Athlete;
  name: string;
  /** His rating, rank and change since the season's pre-opening sample, as the two show rounded, while he has a value in the latest fit. */
  now: { value: number; rank: number; of: number; change: number | null } | null;
  /** His last sample with a rating, for a player out of the league. */
  last: { day: string; value: number } | null;
  peak: { day: string; value: number } | null;
  worth: Worth | null;
  parts: Parts | null;
  series: Sample[];
  /** [day, team] at his first sample and wherever his team changes. */
  stints: [string, Abbr][];
  /** Each season's label and its first and last sample's day. */
  seasons: { label: string; from: string; to: string }[];
  log: GameRow[];
};

/** What every player's page reads: the walk with every player, the players page's table, and the season under way. */
export type PlayerWorld = {
  full: PlayerTimeline;
  kept: PlayerTimeline;
  model: Season;
  box: SeasonBox | undefined;
  ratings: { all: BoxRatings; box: BoxRatings } | undefined;
};

const memo = <K extends object, V>(make: (k: K) => V) => {
  const cache = new WeakMap<K, V>();
  return (k: K) => (cache.has(k) ? cache.get(k)! : (cache.set(k, make(k)), cache.get(k)!));
};

const byId = memo((t: PlayerTimeline) => new Map(t.players.map((p) => [p.id, p])));

/**
 * Each player's place among everyone rated at the table's last sample: every player with MIN_MINUTES career minutes and
 * a value in the latest fit. Equal ratings share a place.
 */
export const standings = memo((t: PlayerTimeline) => {
  const at = t.days.length - 1;
  const rated = t.players.filter((p) => p.v[at] !== null).sort((a, b) => b.v[at]! - a.v[at]!);
  const out = new Map<Athlete, { rank: number; of: number }>();
  rated.forEach((p, k) => out.set(p.id, { rank: k > 0 && rated[k - 1].v[at] === p.v[at] ? out.get(rated[k - 1].id)!.rank : k + 1, of: rated.length }));
  return out;
});

/**
 * The players with a page: everyone with a rating at any sample, and everyone who has played this season, a rookie
 * short of MIN_MINUTES included, so every name the site shows from a lineup or a box score can link to one.
 */
export const pageIds = (w: Pick<PlayerWorld, "full" | "box">): Athlete[] => {
  const played = new Set(Object.values(w.box?.games ?? {}).flatMap((g) => Object.values(g).flatMap((lines) => lines!.map((l) => l[0]))));
  return w.full.players.filter((p) => played.has(p.id) || p.v.some((v) => v !== null)).map((p) => p.id);
};

/** His samples with a rating, each with his place when the players page's table ranks him in its top KEEP_TOP. */
export function seriesOf(p: TimelinePlayer, full: PlayerTimeline, kept: PlayerTimeline): Sample[] {
  const ranked = byId(kept).get(p.id);
  const from = firstFull(kept);
  return p.v.flatMap((v, i): Sample[] => {
    if (v === null) return [];
    const place = ranked && i >= from ? ranking(kept, i).indexOf(ranked) + 1 : 0;
    return [[full.days[i], v, place > 0 && place <= KEEP_TOP ? place : null]];
  });
}

/** His team now: the team whose shown lineup counts him, the one he last played for when two do. */
export function worthOf(m: Season, id: Athlete, lastTeam: Abbr | undefined): Worth | null {
  const teams = m.abbrs.filter((a) => m.players[a].some((p) => p.athlete === id));
  const team = teams.find((a) => a === lastTeam) ?? teams[0];
  if (team === undefined) return null;
  const slot = m.players[team].find((p) => p.athlete === id)!;
  return { team, minutes: slot.minutes, out: slot.out, league: m.r, without: m.r[team] - slot.worth };
}

/** A team's place by displayed (rounded) rating among the other teams of `league`, when it is rated `r`. */
export const placeAmong = (league: Record<Abbr, number>, team: Abbr, r: number) =>
  1 + Object.entries(league).filter(([a, o]) => a !== team && Math.round(o) > Math.round(r)).length;

/** His value split as the fit pulls it, on the latest day the season's ratings have, or null without box ratings. */
export function partsOf(ratings: PlayerWorld["ratings"], id: Athlete, value: number, lastDay: string): Parts | null {
  if (!ratings) return null;
  const j = ratings.all.athletes.indexOf(id);
  if (j < 0) return null;
  const day = [...ratings.all.after.keys()].filter((d) => d <= lastDay).sort().at(-1);
  const at = (b: BoxRatings) => (day === undefined ? b.start : b.after.get(day)!)[j];
  const a = PARAMS.players.a;
  const box = a * at(ratings.box) * SCALE;
  const onCourt = a * (at(ratings.all) - at(ratings.box)) * SCALE;
  return { box, onCourt, games: value - box - onCourt, value };
}

/**
 * His games in the season under way, oldest first, each on its Eastern day. His rating after a game is his sample on
 * that day, which is after that day's games, and its change the gap from the sample before, both rounded as shown.
 */
export function gameLog(m: Season, box: SeasonBox | undefined, full: PlayerTimeline, p: TimelinePlayer): GameRow[] {
  const index = new Map(full.days.map((d, i) => [d, i]));
  const rows: GameRow[] = [];
  for (const g of m.data.games) {
    const sides = box?.games[g.id];
    if (!sides || !g.final || g.hs === null || g.as === null) continue;
    for (const home of [true, false]) {
      const team = home ? g.home : g.away;
      const line = sides[team]?.find((l) => l[0] === p.id);
      if (!line) continue;
      const day = dayKey(g.t);
      const i = index.get(day);
      const after = i === undefined ? null : p.v[i];
      const before = i === undefined || i === 0 ? null : p.v[i - 1];
      rows.push({
        day, team, opp: home ? g.away : g.home, home, neutral: g.neutral, us: home ? g.hs : g.as, them: home ? g.as : g.hs, line, after,
        change: after === null || before === null ? null : Math.round(after) - Math.round(before),
      });
    }
  }
  return rows.sort((a, b) => a.day.localeCompare(b.day));
}

/** Everything his page shows. */
export function playerView(w: PlayerWorld, id: Athlete): PlayerView {
  const p = byId(w.full).get(id);
  if (!p) throw new Error(`player ${id} is not in the timeline`);
  const series = seriesOf(p, w.full, w.kept);
  const at = w.full.days.length - 1;
  const season = w.full.seasons.at(-1)!;
  const place = standings(w.full).get(id);
  const value = p.v[at];
  const opening = p.v[season.from];
  const log = gameLog(w.model, w.box, w.full, p);
  const best = series.reduce<Sample | undefined>((b, s) => (b === undefined || s[1] > b[1] ? s : b), undefined);
  return {
    id,
    name: p.name,
    now: value !== null && place ? { value, rank: place.rank, of: place.of, change: opening === null ? null : Math.round(value) - Math.round(opening) } : null,
    last: value === null && series.length ? { day: series.at(-1)![0], value: series.at(-1)![1] } : null,
    peak: best ? { day: best[0], value: best[1] } : null,
    worth: worthOf(w.model, id, log.at(-1)?.team),
    parts: value === null ? null : partsOf(w.ratings, id, value, w.full.days[at]),
    series,
    stints: p.stints.map(([i, a]) => [w.full.days[i], a]),
    seasons: w.full.seasons.map((s) => ({ label: s.label, from: w.full.days[s.from], to: w.full.days[s.to] })),
    log,
  };
}

/** A rating as the page shows it: rounded, with a true minus sign. */
export const shown = (v: number) => figure(Math.round(v));

/** A bar on a lane, in percent of its width. */
export type Bar = { left: number; width: number };
/** The thinnest a bar is drawn, so a part near zero still shows. */
const MIN_BAR = 0.6;

/** The breakdown as a waterfall on one scale: each part a step from where the last ended, the rating a bar from zero. */
export function waterfall(p: Parts): { zero: number; steps: { label: string; v: number; text: string; bar: Bar }[]; total: Bar } {
  let at = 0;
  const spans = ([["Box score", p.box], ["On court", p.onCourt], ["Team results", p.games]] as const).map(([label, v]) => {
    const span = [at, at + v] as const;
    at += v;
    return { label, v, span };
  });
  const ends = [0, p.value, ...spans.flatMap((s) => s.span)];
  const lo = Math.min(...ends), hi = Math.max(...ends);
  const pos = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  const bar = (a: number, b: number): Bar => ({ left: pos(Math.min(a, b)), width: Math.max(MIN_BAR, Math.abs(pos(b) - pos(a))) });
  return {
    zero: pos(0),
    steps: spans.map((s, k) => ({ label: s.label, v: s.v, text: k ? signed(Math.round(s.v)) : shown(s.v), bar: bar(...s.span) })),
    total: bar(0, p.value),
  };
}

/**
 * Current impact on one line of every team's rating, in percent of its width: the other teams, his team with him
 * (`now`) and without him (`wo`), and its place both ways.
 */
export function impactStrip(w: Worth) {
  const rating = w.league[w.team];
  const others = Object.entries(w.league).filter(([a]) => a !== w.team).map(([, r]) => r);
  const all = [...others, rating, w.without];
  const lo = Math.min(...all), hi = Math.max(...all);
  const pos = (r: number) => 4 + ((r - lo) / (hi - lo || 1)) * 92;
  return {
    gain: signed(Math.round(rating) - Math.round(w.without)),
    rating: Math.round(rating),
    without: Math.round(w.without),
    place: placeAmong(w.league, w.team, rating),
    placeWithout: placeAmong(w.league, w.team, w.without),
    others: others.map(pos),
    now: pos(rating),
    wo: pos(w.without),
  };
}
