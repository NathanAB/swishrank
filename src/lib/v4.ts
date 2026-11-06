// Version 4's settings and lineups (docs/model-v4.md): version 3, with each game priced from the players the NBA's
// injury report, the latest saved before its tip-off, says will play; the minutes of the players it leaves out counted
// below the rest of their team's lineup; and a top-three draft pick starting from the box rating top-three picks play
// at. The site runs version 4 since 2026-11-02 (src/lib/inputs.ts modelInputs); scripts/backtest-v4.ts scores it
// against version 3.
import { finalDays, type Abbr, type Game, type SeasonData } from "./elo.ts";
import { topPick, type DraftFile } from "./draft.ts";
import type { NbaArchive, NbaStatus, SideReport } from "./nba-report.ts";
import { gameScore, ROTATION, scaled, UNKNOWN, type Athlete, type BoxLine, type Lineup, type SeasonBox, type Sides } from "./players.ts";

export const V4 = {
  /** Statuses that take a player out of the lineup. */
  out: ["Out", "Doubtful"] as readonly NbaStatus[],
  /** The share of his expected minutes a Questionable player counts for. */
  questionable: 0.5,
  /** Statuses that bring back a player who missed his team's previous game. */
  back: ["Available", "Probable", "Questionable"] as readonly NbaStatus[],
  /** The team's last games a returning player must have played in for it. */
  window: 10,
  /** Appearances a player's expected minutes average over: 10 in version 3. */
  recent: 5,
  /** What 48 minutes the report takes out are worth against the rest of the team's lineup, in margin units. */
  fill: -0.3,
  /** A top-three pick's starting box rating above the previous season's minutes-weighted mean, per 36 minutes. */
  topThree: 0.28,
};

/** What availability() reads of a rule: V4 by default; scripts/backtest-v4.ts also runs version 3's rule, "Out" only, through it, and the site SITE_RULE. */
export type LineupRule = Pick<typeof V4, "out" | "questionable" | "back" | "window" | "recent" | "fill"> & {
  /** A player the report leaves off, who missed only the team's previous game, comes back with at least these minutes in the game before it and expected. */
  unlisted?: number;
};

/** The rule the site prices with: version 4's, plus unlisted regulars (docs/model-v4.md, The switch). */
export const SITE_RULE: LineupRule = { ...V4, unlisted: 25 };

/** A season's version 4 lineups by game id, played and to come, each game's extra term (fill times the sides' missing minutes), and the missing minutes, as shares of 48. */
export type Availability = { lineups: Map<string, Sides<Lineup>>; extra: Map<string, number>; missing: Map<string, Sides<number>> };

const mean = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * Every season's version 4 lineups. A side the game's report covers starts from the players of the team's previous
 * game, less those listed Out or Doubtful, plus anyone who missed that game, played for the team in one of its last
 * 10 and has not played for another team since, and is listed Available, Probable or Questionable, or under a rule
 * with `unlisted`, is not listed, missed only that game, and has at least those minutes both in the one before and expected. Each counts his
 * expected minutes, the mean of his last 5 appearances, when they are at least 10, a Questionable player half of them,
 * scaled to 240. The side's missing minutes are those of the previous game's players the report takes out, and half
 * of a Questionable one's, over the previous game's lineup's, times 5: shares of 48 minutes. A side the report does
 * not cover takes `fallback`'s lineup and misses nothing. `rule` holds those settings, V4's by default. A game still
 * to come is priced the same way from where the season's last game day leaves each team, so `fallback` gives its
 * uncovered sides too, and a game the report does not reach yet takes `fallback`'s lineups whole.
 */
export function availability(
  seasons: readonly { data: SeasonData; box: SeasonBox }[],
  archives: ReadonlyMap<string, NbaArchive>,
  fallback: (season: string) => ReadonlyMap<string, Sides<Lineup>>,
  rule: LineupRule = V4,
): Map<string, Availability> {
  const minutes = new Map<Athlete, number[]>();
  const teamOf = new Map<Athlete, Abbr>();
  const expected = (a: Athlete) => { const r = minutes.get(a); return r ? mean(r) : UNKNOWN; };
  const out = new Map<string, Availability>();
  for (const { data, box } of seasons) {
    const archive = archives.get(data.season);
    const before = fallback(data.season);
    const recent = new Map<Abbr, BoxLine[][]>();
    const season: Availability = { lineups: new Map(), extra: new Map(), missing: new Map() };
    const fromReport = (abbr: Abbr, report: SideReport): { lineup: Lineup; missing: number } => {
      const status = (a: Athlete) => report[a] as NbaStatus | undefined;
      const weight = (a: Athlete) => (status(a) === "Questionable" ? rule.questionable : 1);
      const isOut = (a: Athlete) => { const s = status(a); return s !== undefined && rule.out.includes(s); };
      const games = recent.get(abbr) ?? [];
      const previous = games.at(-1) ?? [];
      const ids = new Set(previous.map((l) => l[0]));
      const list = previous.map((l) => l[0]).filter((a) => !isOut(a));
      const beforeThat = new Map(games.at(-2)?.map((l) => [l[0], l[1]]));
      const regular = (a: Athlete) => rule.unlisted !== undefined && (beforeThat.get(a) ?? 0) >= rule.unlisted && expected(a) >= rule.unlisted;
      const returning = (a: Athlete) => { const s = status(a); return s === undefined ? regular(a) : rule.back.includes(s); };
      for (const lines of games) for (const l of lines) {
        const a = l[0];
        if (ids.has(a) || teamOf.get(a) !== abbr || !returning(a)) continue;
        ids.add(a);
        list.push(a);
      }
      const lineup = scaled(list.map((a) => ({ athlete: a, min: expected(a) })).filter((p) => p.min >= ROTATION).map((p) => ({ athlete: p.athlete, min: p.min * weight(p.athlete) })));
      const rotation = previous.map((l) => ({ a: l[0], min: expected(l[0]) })).filter((p) => p.min >= ROTATION);
      const total = rotation.reduce((s, p) => s + p.min, 0);
      const gone = rotation.reduce((s, p) => s + (isOut(p.a) ? p.min : p.min * (1 - weight(p.a))), 0);
      return { lineup, missing: total ? (5 * gone) / total : 0 };
    };
    const price = (g: Game) => {
      const report = archive?.games[g.id];
      const kept = before.get(g.id) ?? { home: [], away: [] };
      const side = (abbr: Abbr, which: "home" | "away") => {
        const r = report?.[which];
        return r ? fromReport(abbr, r) : { lineup: kept[which].map((p) => ({ ...p })), missing: 0 };
      };
      const home = side(g.home, "home"), away = side(g.away, "away");
      season.lineups.set(g.id, { home: home.lineup, away: away.lineup });
      season.missing.set(g.id, { home: home.missing, away: away.missing });
      if (home.missing !== away.missing) season.extra.set(g.id, rule.fill * (home.missing - away.missing));
    };
    for (const { games } of finalDays(data)) {
      for (const g of games) price(g);
      for (const g of games) for (const [abbr, lines] of Object.entries(box.games[g.id] ?? {})) {
        if (!lines) continue;
        recent.set(abbr, [...(recent.get(abbr) ?? []), lines].slice(-rule.window));
        for (const l of lines) { minutes.set(l[0], [...(minutes.get(l[0]) ?? []), l[1]].slice(-rule.recent)); teamOf.set(l[0], abbr); }
      }
    }
    for (const g of data.games) if (!g.final) price(g);
    out.set(data.season, season);
  }
  return out;
}

/** A season's minutes-weighted mean Game Score per 36 minutes over its box scores, or undefined without minutes. */
export function seasonMean(box: SeasonBox): number | undefined {
  let g = 0, m = 0;
  for (const sides of Object.values(box.games)) for (const lines of Object.values(sides)) for (const l of lines ?? []) { g += gameScore(l); m += l[1]; }
  return m ? (36 * g) / m : undefined;
}

/**
 * Version 4's starting box rating, for boxRatings()'s `level`: a rookie drafted first to third in the first round, in
 * his season's draft year or up to three before it, starts from the season before's seasonMean plus V4.topThree.
 * Everyone else, and a season with none before it on file, starts from REPLACEMENT (undefined here).
 */
export function topThreeStart(seasons: readonly { data: SeasonData; box: SeasonBox }[], rookies: ReadonlyMap<string, ReadonlySet<Athlete>>, draft: Readonly<DraftFile>) {
  const order = seasons.map((s) => s.data.season);
  const means = seasons.map((s) => seasonMean(s.box));
  return (athlete: Athlete, season: string): number | undefined => {
    if (!rookies.get(season)?.has(athlete) || !topPick(draft, athlete, season)) return undefined;
    const i = order.indexOf(season);
    const before = i > 0 ? means[i - 1] : undefined;
    return before === undefined ? undefined : before + V4.topThree;
  };
}
