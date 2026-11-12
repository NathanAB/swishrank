// The track record page's figures: every pre-game chance the model gave a game that has since been played, scored
// against how the game went, by band of stated chance, by season, and beside the old Elo's and Vegas's chances on
// the games Vegas priced. The scores are the backtests' own (scripts/evaluate.ts).
import { eloChances } from "../../scripts/elo538.ts";
import { accuracy, logLoss } from "../../scripts/evaluate.ts";
import type { Result, Season } from "./elo.ts";
import type { SeasonView } from "./season.ts";

/** One played game as the model called it: `p` is the home side's pre-game chance, `y` 1 when the home side won. */
export type Call = { id: string; season: string; p: number; y: 0 | 1 };

/** Each played game's call, from a season's results. */
export const callsOf = (season: string, results: readonly Result[]): Call[] =>
  results.flatMap(({ game: g, p }) => (g.hs === null || g.as === null ? [] : [{ id: g.id, season, p, y: g.hs > g.as ? 1 : 0 }]));

/** The favourite's stated chance. An even game makes the home side the favourite, as `accuracy` counts it. */
const favourite = (c: Pick<Call, "p">) => Math.max(c.p, 1 - c.p);
const favouriteWon = (c: Pick<Call, "p" | "y">) => (c.p >= 0.5) === (c.y === 1);

/** A band's width in percentage points. */
export const BAND_WIDTH = 5;
const BANDS = 10;

/**
 * Games whose favourite was given from `lo` percent up to `lo` + BAND_WIDTH (the last band takes 100% too): how
 * many, how many the favourite won, and the mean chance it was given, from 0 to 1.
 */
export type Band = { lo: number; games: number; won: number; stated: number };

/** The favourite's stated chance in 5-point bands from 50% to 100%, leaving out a band with no games. */
export function bands(calls: readonly Call[]): Band[] {
  const acc = Array.from({ length: BANDS }, () => ({ games: 0, won: 0, sum: 0 }));
  for (const c of calls) {
    const f = favourite(c);
    // f * 20 rather than (f - 0.5) / 0.05: 0.6 - 0.5 is a hair under 0.1, which would put 60% in the 55% band.
    const b = acc[Math.min(BANDS - 1, Math.floor(f * (100 / BAND_WIDTH)) - BANDS)];
    b.games++;
    b.sum += f;
    if (favouriteWon(c)) b.won++;
  }
  return acc.flatMap((b, i) => (b.games ? [{ lo: 50 + i * BAND_WIDTH, games: b.games, won: b.won, stated: b.sum / b.games }] : []));
}

/** A set of calls scored: how many, the share the favourite won, and the log loss. */
export type Summary = { games: number; favouriteWon: number; logLoss: number };

export const summary = (calls: readonly Pick<Call, "p" | "y">[]): Summary => ({ games: calls.length, favouriteWon: accuracy(calls), logLoss: logLoss(calls) });

/** A source of chances: game id to the home side's chance. */
export type Chances = Readonly<Record<string, number>>;

/** The model, the old Elo and Vegas, each scored on the same games: those Vegas has a line for. */
export type SameGames = { model: Summary; elo: Summary; vegas: Summary };

export function sameGames(calls: readonly Call[], elo: Chances, vegas: Chances): SameGames {
  const priced = calls.filter((c) => c.id in vegas);
  const by = (chances: Chances) =>
    summary(priced.map((c) => {
      const p = chances[c.id];
      if (p === undefined) throw new Error(`record: no old Elo chance for game ${c.id}`);
      return { p, y: c.y };
    }));
  return { model: summary(priced), elo: by(elo), vegas: by(vegas) };
}

/** What the page reads of a season: the model's results and games, and Vegas's chances for its games. */
export type SeasonInput = Pick<SeasonView, "id" | "label" | "current"> & { model: Pick<Season, "data" | "results">; vegas: Chances };

export type TrackRecord = {
  /** The first season scored, "2015–16". */
  since: string;
  all: Summary;
  bands: Band[];
  /** Newest first, as given. */
  seasons: (Pick<SeasonView, "id" | "label" | "current"> & Summary)[];
  same: SameGames;
};

/** Every season's calls scored together, by band, by season, and beside the old Elo and Vegas. */
export function trackRecord(seasons: readonly SeasonInput[]): TrackRecord {
  const per = seasons.map((s) => ({ s, calls: callsOf(s.id, s.model.results) }));
  const calls = per.flatMap((x) => x.calls);
  const elo = Object.fromEntries(seasons.flatMap((s) => eloChances(s.model.data).map((x) => [x.id, x.p])));
  const vegas = Object.assign({}, ...seasons.map((s) => s.vegas));
  return {
    since: seasons[seasons.length - 1].label,
    all: summary(calls),
    bands: bands(calls),
    seasons: per.map(({ s, calls }) => ({ id: s.id, label: s.label, current: s.current, ...summary(calls) })),
    same: sameGames(calls, elo, vegas),
  };
}
