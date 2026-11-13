// Every move of a team's shown rating split into its parts, so each row adds up exactly to the change shown.
// Mirrors compute() in elo.ts day by day.
import { ELO_PER_SIGMA, PARAMS, START, addDays, counted, dayKey, expected, fitSeasonSteps, gapValue, playerPart, restValue, seasonRule, shownChange, shownLineups, type Abbr, type Fit } from "./elo.ts";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shortDay } from "./format.ts";
import { parseArchive, type Injury } from "./injuries.ts";
import { playerName } from "./names.ts";
import type { Lineup } from "./players.ts";
import { seasonInputs, team, type SeasonView } from "./season.ts";
import { SITE_ON_COURT } from "./v5.ts";

const INJURY_FILES = import.meta.glob<unknown>("../data/injuries/*.json", { eager: true, import: "default" });

/**
 * A player whose counted minutes changed that day, and what the change did at the values after the day, credited
 * as minuteRows credits it. For a player
 * out for weeks, `backups` is the part of `points` from the gap on the minutes his teammates play for him
 * (gapValue in src/lib/elo.ts): taking it on when he leaves, its fading as the team plays without him ("out"),
 * and its end when he is back.
 */
export type PlayerMove = {
  athlete: number;
  name: string;
  /** Minutes a game the rating counted him for before the day. */
  before: number;
  points: number;
  /** His minutes in the team's game that day, null when he did not play in it, undefined on a day off. */
  played?: number | null;
  status: "joined" | "left" | "more" | "fewer" | "out";
  backups?: number;
  /** True when he had no minutes in any earlier game of the season, for any team. */
  debut: boolean;
  injury?: Injury;
};

export type LedgerGame = {
  id: string;
  opp: Abbr;
  venue: "home" | "away" | "neutral";
  won: boolean;
  /** Whether the model made this team the favourite before the game; null for an even game. */
  favored: boolean | null;
  /** Whether the team's counted margin beat the margin the model expected of it before the game. */
  beat: boolean;
};

/** One player's value change from his box score in the team's own game, times his share of the minutes. */
export type BoxPlayer = { athlete: number; name: string; points: number };

export type LedgerRow = {
  day: string;
  before: number;
  after: number;
  /** The change the page shows: the gap between the two rounded ratings. */
  change: number;
  game: LedgerGame | null;
  /**
   * The move in rating points, in the walk's two parts, which add up to it exactly. `result` is what the team's
   * own game did before its players' box scores counted, the team part's shift when they did, and the seed's
   * fading; `players` is each player's value change from his box score, what his change in counted minutes did,
   * and what the day's other games did to his value (`former`).
   */
  raw: Record<WalkKey, number>;
  /** Each player of the rotation the team took into the day, and his value change from his box score. */
  box: BoxPlayer[];
  /** Players whose counted minutes changed, largest effect first. */
  players: PlayerMove[];
  /**
   * Players of the rotation whose value the day's other games moved. Each game counts its opponent as it stood
   * before it, so only a player's past games with a former team tie him to another game, through the teammates he
   * shared them with.
   */
  former: BoxPlayer[];
  /** What the seed's daily fading did. */
  seed: number;
};

/** Whole numbers that add up to `total`, as close to `raw` as the largest-remainder rule allows. */
export function apportion<K extends string>(raw: Record<K, number>, total: number): Record<K, number> {
  const keys = Object.keys(raw) as K[];
  if (!keys.length) return {} as Record<K, number>;
  const floor = Object.fromEntries(keys.map((k) => [k, Math.floor(raw[k])])) as Record<K, number>;
  let left = total - keys.reduce((s, k) => s + floor[k], 0);
  const order = [...keys].sort((a, b) => (raw[b] - floor[b]) - (raw[a] - floor[a]));
  const out = { ...floor };
  for (let i = 0; left !== 0; i = (i + 1) % order.length) {
    const step = Math.sign(left);
    if (step < 0) { const k = [...order].reverse()[i]; out[k] -= 1; } else out[order[i]] += 1;
    left -= step;
  }
  return out;
}

const ledgers = new Map<string, LedgerRow[]>();

/** A team's rows for a season, worked out once per build: a team page and every game page of its season read them. */
export function ledger(season: SeasonView, abbr: Abbr): LedgerRow[] {
  const key = `${season.id} ${abbr}`;
  let rows = ledgers.get(key);
  if (!rows) ledgers.set(key, (rows = season.end === null ? teamLedger(season, abbr) : finishedLedger(season, abbr)));
  return rows;
}

/** A player's name as a row shows it. */
const nameOf = (athlete: number) => playerName(athlete) ?? `#${athlete}`;

/**
 * Where a build keeps finished seasons' rows for the next one, from SWISHRANK_CACHE, or nowhere when it is unset. The
 * deploy sets it and restores the directory from its last run, so a day's build works out only the season in progress:
 * the rows were about nine tenths of a build. Tests and the dev server leave it unset and always work rows out.
 */
const CACHE = process.env.SWISHRANK_CACHE ? join(process.env.SWISHRANK_CACHE, "ledger") : null;

/** Every file under `dir`, sorted, recursively. */
const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)])).sort();

const cacheKeys = new Map<string, string>();
/**
 * What a finished season's rows are worked out from: the model's code in src/lib, and the season list and every data
 * file of the season and the seasons before it, their play-by-play records included once the site reads them. Player
 * names are left out and looked up again when rows are read.
 */
function cacheKey(seasonId: string): string {
  let key = cacheKeys.get(seasonId);
  if (key) return key;
  const root = process.cwd();
  const hash = createHash("sha256");
  const lib = filesUnder(join(root, "src", "lib")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  const dirs = [...["games", "box", "preseason", "injuries", "nba-reports"].map((dir) => join(root, "src", "data", dir)), ...(SITE_ON_COURT ? [join(root, "scripts", "stints")] : [])];
  const data = dirs.flatMap(filesUnder).filter((f) => (/(\d{4}-\d{2})\.json$/.exec(f)?.[1] ?? "9999") <= seasonId);
  for (const f of [...lib, join(root, "src", "data", "seasons.json"), join(root, "src", "data", "draft.json"), ...data]) hash.update(f.slice(root.length)).update("\0").update(readFileSync(f)).update("\0");
  cacheKeys.set(seasonId, (key = hash.digest("hex")));
  return key;
}

/** A finished season's rows from the cache when its key still matches, else worked out and kept there. */
function finishedLedger(season: SeasonView, abbr: Abbr): LedgerRow[] {
  if (!CACHE) return teamLedger(season, abbr);
  const file = join(CACHE, season.id, `${abbr}.json`);
  const key = cacheKey(season.id);
  try {
    const kept = JSON.parse(readFileSync(file, "utf8")) as { key: string; rows: LedgerRow[] };
    if (kept.key === key) {
      return kept.rows.map((r) => ({ ...r, players: r.players.map((p) => ({ ...p, name: nameOf(p.athlete) })), box: r.box.map((p) => ({ ...p, name: nameOf(p.athlete) })), former: r.former.map((p) => ({ ...p, name: nameOf(p.athlete) })) }));
    }
  } catch {
    // No file yet, or one this build cannot read: work the rows out.
  }
  const rows = teamLedger(season, abbr);
  try {
    mkdirSync(join(CACHE, season.id), { recursive: true });
    writeFileSync(file, JSON.stringify({ key, rows }));
  } catch {
    // A build that cannot write the cache still has its rows.
  }
  return rows;
}

function teamLedger(season: SeasonView, abbr: Abbr): LedgerRow[] {
  const data = season.model.data;
  const inputs = seasonInputs(season.id) ?? {};
  const name = nameOf;
  const rawInjuries = INJURY_FILES[`../data/injuries/${season.id}.json`];
  const injuries = rawInjuries ? parseArchive(rawInjuries, season.id) : null;
  const scale = ELO_PER_SIGMA / PARAMS.sigma;
  /** Each game's pre-game chance for its home side. */
  const homeChance = new Map(season.model.results.map((r) => [r.game.id, r.p]));
  const { players: pl } = inputs;
  const days = fitSeasonSteps(data, seasonRule(inputs), inputs, abbr);
  const shown = shownLineups(data, pl?.rotation);
  const box = pl?.box.games ?? {};
  const rate = (fit: Fit, lineup: Lineup) => START + (fit.r[abbr] + playerPart(fit, lineup)) * scale;
  const lastDay = [...data.games].filter((g) => g.home === abbr || g.away === abbr).map((g) => dayKey(g.t)).sort().at(-1) ?? "";
  /** Everyone with minutes in a game on an earlier day this season. */
  const seen = new Set<number>();

  let usual = shown.opening;
  if (!days.length) return [];
  let prevShown = rate(days[0].before, usual[abbr]);
  let heldAt: number | null = null;
  const rows: LedgerRow[] = [];

  for (const { day, games, before, after, priors, own, others } of days) {
    const was = usual[abbr];
    usual = shown.after.get(day)!;
    const held = heldAt !== null;
    const shownNow = held ? heldAt! : rate(after, usual[abbr]);
    if (!held && lastDay === day) heldAt = shownNow;
    const pg = games.find((p) => p.game.home === abbr || p.game.away === abbr);
    const g = pg?.game;
    const value = (fit: Fit, athlete: number) => (fit.v.get(athlete) ?? 0) * scale;
    const boxed: BoxPlayer[] = own
      ? was.filter((p) => p.athlete > 0).map((p) => ({ athlete: p.athlete, name: name(p.athlete), points: (value(own.fit, p.athlete) - value(own.result, p.athlete)) * p.share }))
      : [];
    // The rotation changes once the team's own game is in, so the day's other games are read on the new one: a
    // player gone to another team leaves at his value before his first game there.
    const mid = own?.fit ?? priors;
    const former: BoxPlayer[] = usual[abbr].filter((p) => p.athlete > 0).flatMap((p) => {
      const points = (value(others, p.athlete) - value(mid, p.athlete)) * p.share;
      return Math.abs(points) >= 0.005 ? [{ athlete: p.athlete, name: name(p.athlete), points }] : [];
    });
    const formerPoints = former.reduce((s, p) => s + p.points, 0);
    const seed = rate(priors, was) - rate(before, was) + rate(after, usual[abbr]) - rate(others, usual[abbr]);
    const minutes = rate(mid, usual[abbr]) - rate(mid, was);
    const boxPoints = boxed.reduce((s, p) => s + p.points, 0);
    // The team part's own tie to the other games, through the same past games, and the gap slots' worth.
    const tail = rate(others, usual[abbr]) - rate(mid, usual[abbr]) - formerPoints;
    const raw: Record<WalkKey, number> = held
      ? { result: 0, players: 0 }
      : {
          result: (own ? rate(own.fit, was) - rate(priors, was) - boxPoints : 0) + seed + tail,
          players: boxPoints + minutes + formerPoints,
        };
    const residual = shownNow - prevShown - (raw.result + raw.players);
    if (Math.abs(residual) > 1e-6) throw new Error(`ledger ${season.id} ${abbr} ${day}: parts miss the move by ${residual}`);
    const change = shownChange(prevShown, shownNow);
    let game: LedgerGame | null = null;
    if (pg && g) {
      const home = g.home === abbr;
      const opp = home ? g.away : g.home;
      // The score against the margin the chances priced, both in counted points for the home side.
      const surprise = counted(g.hs - g.as, PARAMS.margin) - expected(before, pg);
      game = {
        id: g.id, opp,
        venue: g.neutral ? "neutral" : home ? "home" : "away",
        won: home === g.hs > g.as,
        favored: favoredSide(homeChance.get(g.id), home),
        beat: home ? surprise > 0 : surprise < 0,
      };
    }
    const lines = g ? box[g.id]?.[abbr] : undefined;
    // The report saved the morning after the day, as the shown rotation reads it, or the day's own.
    const report = (injuries?.days[addDays(day, 1)] ?? injuries?.days[day])?.injuries ?? [];
    // A player out for weeks is two slots, his own and the gap on his minutes (his id negated): see minuteRows.
    const shareOf = (lineup: Lineup, athlete: number) => lineup.find((p) => p.athlete === athlete)?.share ?? 0;
    const ids = [...new Set([...was, ...usual[abbr]].map((p) => Math.abs(p.athlete)))];
    const restBefore = restValue(mid, was), restAfter = restValue(mid, usual[abbr]);
    const playedIn = (athlete: number) => { const line = lines?.find((l) => l[0] === athlete); return g ? (lines ? (line ? line[1] : null) : undefined) : undefined; };
    const credited = minuteRows(ids.map((athlete) => ({
      athlete,
      before: shareOf(was, athlete), after: shareOf(usual[abbr], athlete), value: value(mid, athlete),
      gap: (shareOf(usual[abbr], -athlete) * gapValue(mid, athlete, restAfter) - shareOf(was, -athlete) * gapValue(mid, athlete, restBefore)) * scale,
      sat: playedIn(athlete) === null,
    })));
    const players: PlayerMove[] = held ? [] : ids.flatMap((athlete) => {
      const { points, backups } = credited.get(athlete)!;
      if (Math.abs(points) < 0.05) return [];
      const s0 = shareOf(was, athlete), s1 = shareOf(usual[abbr], athlete);
      return [{
        athlete, name: name(athlete), before: s0 * 48, points,
        played: playedIn(athlete),
        status: s0 === s1 ? "out" : s0 === 0 ? "joined" : s1 === 0 ? "left" : s1 > s0 ? "more" : "fewer",
        ...(backups ? { backups } : {}),
        debut: !seen.has(athlete),
        injury: report.find((i) => i.athlete === athlete),
      } satisfies PlayerMove];
    }).sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
    if (g || change !== 0) {
      rows.push({
        day, before: prevShown, after: shownNow, change, game, raw, players, seed,
        box: held ? [] : boxed,
        former: held ? [] : former,
      });
    }
    for (const { game: dg } of games) for (const side of Object.values(box[dg.id] ?? {})) for (const l of side ?? []) if (l[1] > 0) seen.add(l[0]);
    prevShown = shownNow;
  }
  return rows;
}

/** One player's day in the rotation, for minuteRows: his share of 48 before and after, his value, and the gap's change on his minutes. */
export type RotationChange = { athlete: number; before: number; after: number; value: number; gap: number; sat: boolean };

/**
 * What each player's change in counted minutes did, in rating points, credited to whoever caused it. The rotation
 * always counts 240 minutes, so the minutes some players lose, others take: each pair of a player who gave up minutes
 * and one who took them trades the giver's share in proportion to what each took, worth the taker's value less the
 * giver's. A player who left the rotation or sat out the day's game is charged with each of his trades that cost his
 * team, and a player who joined it, new or back, credited with each of his that helped; their other trades, and every
 * trade between two players who both played, go to the player on the other end, or are split half and half; a gain
 * between two players who both sat goes to the teammates who played. So a player who sits never shows a gain, even
 * when his counted minutes rise, nor a player's return a loss: when a player rated below his teammates sits, the
 * gain is theirs, shown as the minutes they took. On the finished seasons such gains were mostly not there:
 * teams whose players who sat were rated below those who played beat their ratings by -0.36 [+/- 0.26] of what that
 * credited, and lost 20 to 30 Elo points per 48 of an absent player's minutes beyond it (docs/model-v2.md). The gap
 * on an absent player's minutes (gapValue) is his on the days he leaves and comes back; as it fades with games played
 * without him, it goes to the teammates now counted for his minutes, in proportion to what each took. The rows add up
 * to the change in the rotation's worth. A day whose two rotations count different totals, as when a team's first
 * rotation arrives, counts each player at his own value.
 */
export function minuteRows(changes: readonly RotationChange[]): Map<number, { points: number; backups: number }> {
  const out = new Map(changes.map((c) => [c.athlete, { points: 0, backups: 0 }]));
  const delta = (c: RotationChange) => c.after - c.before;
  const gave = changes.filter((c) => delta(c) < 0), took = changes.filter((c) => delta(c) > 0);
  const given = gave.reduce((s, c) => s - delta(c), 0), taken = took.reduce((s, c) => s + delta(c), 0);
  const playing = took.filter((j) => !j.sat);
  const playingTook = playing.reduce((s, j) => s + delta(j), 0);
  if (given > 0 && Math.abs(given - taken) < 1e-9) {
    for (const i of gave) for (const j of took) {
      const worth = ((-delta(i) * delta(j)) / taken) * (j.value - i.value);
      // An absence answers for what it cost and a return for what it brought; the rest of either goes to the other end.
      const iOut = i.after === 0 || i.sat, jOut = j.sat, jBack = j.before === 0 && !j.sat;
      // A gain between two players who both sat goes to the teammates who played, in proportion to what each took.
      if (worth > 0 && iOut && jOut && playingTook > 0) {
        for (const k of playing) out.get(k.athlete)!.points += (worth * delta(k)) / playingTook;
        continue;
      }
      const toGiver = worth < 0
        ? (iOut && !jOut ? 1 : jOut && !iOut ? 0 : jBack ? 1 : 0.5)
        : (jOut && !iOut ? 1 : iOut && !jOut ? 0 : jBack ? 0 : 0.5);
      out.get(i.athlete)!.points += worth * toGiver;
      out.get(j.athlete)!.points += worth * (1 - toGiver);
    }
  } else for (const c of changes) out.get(c.athlete)!.points += delta(c) * c.value;
  for (const c of changes) {
    if (!c.gap) continue;
    // The teammates who played take the fading gap; a player who sat takes no gain.
    const to = playing.length ? playing : took;
    const share = to.reduce((s, j) => s + delta(j), 0);
    const own = c.before !== c.after || !share;
    for (const j of own ? [c] : to) {
      const part = own ? c.gap : (c.gap * delta(j)) / share;
      const row = out.get(j.athlete)!;
      row.points += part;
      if (j === c) row.backups += part;
    }
  }
  return out;
}

/** The two parts a row's change is split into for showing: the team's own result and its players. */
export type WalkKey = "result" | "players";

/** One cause the walk steps through, at its true effect in rating points, with the few words that explain it. */
export type WalkItem = { kind: "team" | "player" | "seed"; name: string; points: number; phrase: string };

/** A line of the walk at its whole-point share: one item, or every item under a point folded into one closing line. */
export type WalkLine =
  | (WalkItem & { whole: number })
  /** `items` are the ones worth a tenth of a point or more, at their true effect; `points` counts the rest too. */
  | { kind: "group"; whole: number; points: number; phrase: string; items: WalkItem[] };

export type WalkPart = { key: WalkKey; label: string; whole: number; lines: WalkLine[] };

/**
 * What an opened row draws: its rating from `from` to `to`, through the team's result on a game day and each other
 * part whose whole figure isn't 0. `whole` holds all three parts, for the row's columns. `tipped` marks a small move that rounding made a whole point.
 */
export type Walk = { from: number; to: number; whole: Record<WalkKey, number>; parts: WalkPart[]; tipped: boolean };

const LABELS: Record<WalkKey, string> = { result: "Result", players: "Players" };
const byMagnitude = (a: { points: number }, b: { points: number }) => Math.abs(b.points) - Math.abs(a.points);

/**
 * The team's result in a few words: where, and how it went against what the model expected. An upset says so
 * ("despite being favored", "despite being the underdog"); otherwise the score against the expected margin does,
 * joined as a player's phrase is: "and by more" when the result and the expectation agree (a win better than
 * expected, a loss worse), "but by less" when they pull apart. A favourite can't lose better than expected, nor an
 * underdog win worse, so these six cases are all of them. The phrase reads the score, not the Result's points: the
 * fit can move a team a point against a score a hair either side of what was expected.
 */
function resultPhrase(season: SeasonView, g: LedgerGame): string {
  const opp = team(season, g.opp);
  const place = opp.name.slice(0, opp.name.length - opp.short.length).trim() || opp.short;
  const where = g.venue === "home" ? "at home" : g.venue === "away" ? `at ${place}` : "on a neutral floor";
  const result = `${g.won ? "Won" : "Lost"} ${where}`;
  if (g.favored === true && !g.won) return `${result} despite being favored`;
  if (g.favored === false && g.won) return `${result} despite being the underdog`;
  return `${result} ${g.won === g.beat ? "and by more" : "but by less"} than expected`;
}

/** A team's side of a home chance: favoured above an even game, not below it, neither at exactly even or unknown. */
function favoredSide(p: number | undefined, home: boolean): boolean | null {
  if (p === undefined || p === 0.5) return null;
  return home ? p > 0.5 : p < 0.5;
}

/**
 * A player's whole day in a few plain words, from its two parts: how he played (his value change from his box score)
 * and his counted minutes (the change in the minutes the rating counts him for, at his value). A part is named when it
 * is a tenth of a point or more and at least a quarter of the larger one, so the words follow what moved the row;
 * with both, "and" joins them when they push the rating the same way, "but" when they pull against each other. The
 * minutes part says "longer" or "shorter than expected" when his minutes in the game explain it, beyond 2 minutes off
 * what was counted, and "counted for more" or "fewer minutes" when his teammates' did. A player out for weeks says so.
 */
function playerPhrase(value: number, move: PlayerMove | undefined): string {
  const until = move?.injury?.returnDate ? ` until ${shortDay(move.injury.returnDate)}` : "";
  if (move?.status === "out") return `Still out${until}`;
  if (move?.backups && move.status === "joined") {
    if (move.played == null) return move.injury?.returnDate ? `Expected back ${shortDay(move.injury.returnDate)}` : "Expected back";
    return value >= 0.1 ? "Back from injury, and played well" : value <= -0.1 ? "Back from injury, but played poorly" : "Back from injury";
  }
  // On a day off only the injury report or a player leaving moves the rotation.
  if (move && move.played === undefined) {
    if (move.status === "left" && move.injury) return `Out injured${until}`;
    if (move.status === "more") return "Counted for more minutes";
    if (move.status === "fewer") return "Counted for fewer minutes";
  }
  if (move?.played === null) return move.injury ? `Out injured${until}` : "Didn't play";
  const minutes = move?.points ?? 0;
  const larger = Math.max(Math.abs(value), Math.abs(minutes));
  const named = (x: number) => Math.abs(x) >= 0.1 && Math.abs(x) >= 0.25 * larger;
  const how = named(value) ? (value > 0 ? "well" : "poorly") : "";
  if (move?.status === "joined" && move.debut) return how ? `Played ${how} in his first minutes of the season` : "First minutes of the season";
  const gap = move?.played != null ? move.played - move.before : 0;
  const long = Math.abs(gap) <= 2 ? "" : gap > 0 ? "longer" : "shorter";
  const more = move?.status === "more" || move?.status === "joined";
  const counted = !move || !named(minutes) ? ""
    : long && (long === "longer") === more ? `for ${long} than expected`
    : `counted for ${more ? "more" : "fewer"} minutes`;
  const join = Math.sign(value) === Math.sign(minutes) ? "and" : "but";
  if (how && counted) return `Played ${how} ${join} ${counted}`;
  if (how) return `Played ${how}`;
  if (counted) return counted.startsWith("for") ? `Played ${counted}` : `C${counted.slice(1)}`;
  return "About as expected";
}

/** "9 players under a point each", "The preseason estimate under a point". */
function groupPhrase(items: WalkItem[], all: number): string {
  if (!items.length) return `${all} effect${all === 1 ? "" : "s"} under a tenth of a point${all > 1 ? " each" : ""}`;
  const counts = new Map<WalkItem["kind"], number>();
  for (const x of items) counts.set(x.kind, (counts.get(x.kind) ?? 0) + 1);
  const parts = [...counts].map(([kind, n]) => {
    if (kind === "seed") return "the preseason estimate";
    return `${n} player${n === 1 ? "" : "s"}`;
  });
  const text = `${parts.join(" and ")} under a point${items.length > 1 ? " each" : ""}`;
  return text[0].toUpperCase() + text.slice(1);
}

/**
 * A part's lines: the team's result, then each item of a point or more on its own, then one line for the rest. The
 * part's whole figure is split across them by the largest-remainder rule, so they add up to it. The closing line
 * lists its items of a tenth or more, and is left out when it has none and its share is 0.
 */
function partLines(items: WalkItem[], whole: number): WalkLine[] {
  // Judged at the tenth the drawer prints, so nothing in a line "under a point" reads as 1.0.
  // The team's own result leads its part, even on a day the seed's fading moves it more.
  const big = items.filter((x) => x.kind === "team" || Math.abs(x.points) >= 0.95).sort((a, b) => Number(b.kind === "team") - Number(a.kind === "team") || byMagnitude(a, b));
  const rest = items.filter((x) => !big.includes(x));
  const restPoints = rest.reduce((s, x) => s + x.points, 0);
  const shares = apportion(Object.fromEntries([...big.map((x, i) => [String(i), x.points]), ["rest", restPoints]]), whole);
  const lines: WalkLine[] = big.map((x, i) => ({ ...x, whole: shares[String(i)] }));
  const listed = rest.filter((x) => Math.abs(x.points) >= 0.05).sort(byMagnitude);
  if (listed.length || shares.rest !== 0) lines.push({ kind: "group", whole: shares.rest, points: restPoints, phrase: groupPhrase(listed, rest.length), items: listed });
  return lines;
}

/**
 * A row as the walk draws it, in two parts that never show a player twice: the team's own result with the seed's
 * fading, and each player's whole effect (his value change from his box score, his change in expected minutes, and
 * what the day's other games did to his value through his past games with a former team). The whole points are split again from
 * those raw parts by the largest-remainder rule, so they still add up to the change.
 */
export function walk(season: SeasonView, row: LedgerRow): Walk {
  const whole = apportion(row.raw, row.change);

  const byAthlete = new Map<number, { name: string; box: number; former: number; move?: PlayerMove }>();
  const entry = (athlete: number, name: string) => byAthlete.get(athlete) ?? byAthlete.set(athlete, { name, box: 0, former: 0 }).get(athlete)!;
  for (const p of row.box) entry(p.athlete, p.name).box = p.points;
  for (const p of row.former) entry(p.athlete, p.name).former = p.points;
  for (const p of row.players) entry(p.athlete, p.name).move = p;
  const players = [...byAthlete.values()].map(({ name, box, former, move }): WalkItem => {
    const own = box + (move?.points ?? 0);
    const phrase = Math.abs(former) > Math.abs(own) ? "His old team's game moved his value" : playerPhrase(box, move);
    return { kind: "player", name, points: own + former, phrase };
  });
  const items: Record<WalkKey, WalkItem[]> = {
    result: [
      ...(row.game ? [{ kind: "team" as const, name: LABELS.result, points: row.raw.result - row.seed, phrase: resultPhrase(season, row.game) }] : []),
      { kind: "seed", name: "Preseason estimate", points: row.seed, phrase: "Fading a little, as it does each game" },
    ],
    players,
  };

  const parts = (Object.keys(LABELS) as WalkKey[])
    .filter((key) => whole[key] !== 0 || (key === "result" && row.game !== null))
    .map((key): WalkPart => ({ key, label: LABELS[key], whole: whole[key], lines: partLines(items[key], whole[key]) }));
  const real = row.after - row.before;
  return {
    from: Math.round(row.before), to: Math.round(row.after), whole, parts,
    tipped: Math.abs(real - row.change) >= 0.5 && Math.abs(real) < 1,
  };
}
