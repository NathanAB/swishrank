// What the model reads beyond a season's games: each team's seed from its preseason win total (docs/model-v2.md);
// for version 3 (docs/model-v3.md), the season's home edge from the three seasons before it and its rookies; and for
// version 4 (docs/model-v4.md), every player's box rating with a top-three pick's start, and each game's lineups and
// extra term from the NBA's injury report, the latest saved before its tip-off (src/lib/v4.ts availability()). The
// shown rotation also leaves out the players ESPN's report lists as out for weeks. A box rating reads every earlier
// season, a home edge the seasons before, and a team without a total is seeded from its rating at the end of the
// season before, so the seasons are walked together, oldest first. Version 5 adds each player's on-court rating
// (src/lib/on-court.ts) to his box rating when modelInputs() is given its settings, and prices each game from its
// teams' rosters (src/lib/roster-lineups.ts rosterAvailability()) when given a roster rule.
import { addDays, dayKey, finalDays, fitModel, PARAMS, seedCentres, type Abbr, type ModelInputs, type SeasonData } from "./elo.ts";
import type { DraftFile } from "./draft.ts";
import { trailingHomeEdges } from "./home.ts";
import { parseArchive, type InjuryArchive, type Report } from "./injuries.ts";
import { parseNbaArchive } from "./nba-report.ts";
import { onCourtRatings, type OnCourtRule } from "./on-court.ts";
import { boxRatings, lineups, parseBox, usualRotations, type Athlete, type BoxRatings, type Lineup, type Lineups, type SeasonBox, type SeasonRotations, type Sides } from "./players.ts";
import { parsePreseason } from "./preseason.ts";
import { OUT_STATUSES, reportLineups, reportNext } from "./report-lineup.ts";
import { newcomers } from "./rookies.ts";
import { rosterAvailability, type RosterRule } from "./roster-lineups.ts";
import { parseStints } from "./stints.ts";
import { availability, SITE_RULE, topThreeStart, V4 } from "./v4.ts";

/**
 * One season's raw files: its games, parsed, and its box scores, preseason totals, ESPN's injury reports, the NBA's
 * (src/data/nba-reports/) and its play-by-play record (scripts/stints/, for src/lib/stints.ts parseStints) as read
 * from JSON, undefined where a file is missing.
 */
export type SeasonFiles = { data: SeasonData; box: unknown; preseason: unknown; injuries?: unknown; nbaReports?: unknown; stints?: unknown };

/** Version 5's on-court settings: the fit's (src/lib/on-court.ts) and the `weight` its residual counts in a player's centre. */
export type OnCourt = OnCourtRule & { weight: number };

/**
 * A season's box ratings with its on-court residuals (src/lib/on-court.ts onCourtRatings) added, both in the box
 * ratings' `athletes` order: box + (weight / PARAMS.players.a) * residual, so the fit's centre for a player, `a` times
 * his rating, is a * box + weight * residual.
 */
export function withOnCourt(box: BoxRatings, residual: BoxRatings, weight: number): BoxRatings {
  const scale = weight / PARAMS.players.a;
  const mix = (b: Float64Array, r: Float64Array | undefined) => {
    if (!r || r.length !== b.length) throw new Error("withOnCourt: the residuals do not match the box ratings");
    return b.map((x, j) => x + scale * r[j]);
  };
  return { athletes: box.athletes, start: mix(box.start, residual.start), after: new Map([...box.after].map(([day, b]) => [day, mix(b, residual.after.get(day))])) };
}

/** Each team's team part after a season's last game day, or its seed when the season has no final game. */
const lastTeamParts = (data: SeasonData, inputs: ModelInputs): Record<Abbr, number> => fitModel(data, inputs).at(-1)?.after.r ?? inputs.centres ?? {};

/** The latest report in an archive, the one games still to come are priced with. */
const latestReport = (archive: InjuryArchive): Report | undefined => {
  const days = Object.keys(archive.days).sort();
  return days.length ? archive.days[days[days.length - 1]] : undefined;
};

/**
 * Version 3's lineups by game id, which version 4 takes for a side the NBA's report does not cover: each played
 * game's previous lineup less ESPN's report of its day, fetched before the day's first tip-off, and each game still
 * to come with each team's latest next lineup less ESPN's latest report.
 */
function espnLineups(data: SeasonData, seasonLineups: Lineups, archive: InjuryArchive | undefined): Map<string, Sides<Lineup>> {
  const out = reportLineups(data, seasonLineups.previous, archive);
  const next = reportNext(Object.assign({}, ...seasonLineups.next.values()) as Record<Abbr, Lineup>, archive && latestReport(archive));
  for (const g of data.games) if (!g.final) out.set(g.id, { home: next[g.home] ?? [], away: next[g.away] ?? [] });
  return out;
}

/** Days ahead a report's projected return must be for a player to leave his team's shown rotation: about 10 games. */
export const LONG_ABSENCE = 21;

/**
 * A rotation without players out for weeks: the rest of it scaled up to take their minutes, and beside it, for each
 * of them, a slot with his id negated at the share the rotation counted him for, which counts BACKUP_GAP below the
 * rest (src/lib/elo.ts). As the team plays without him, his share of its last 10 games, and so the slot, shrinks to
 * nothing, and the players who took his minutes count for them. On the finished seasons, for 8,885 team-days with a
 * rotation player who missed the next 10 games, the shown rating missed those games' margins by 1.3008 in root mean
 * square, against 1.3253 keeping him, 1.3063 handing his minutes to the rest of the rotation at their own worth, and
 * 1.3025 under the rule before this one, which gave them to a replacement-level player until the team had played 2
 * games without him; a gap of 0.2 also scored 1.3008, and 0.4 1.3027 (docs/model-v2.md).
 */
function withoutLongAbsent(lineup: Lineup, gone: ReadonlySet<Athlete>): Lineup {
  const kept = lineup.filter((p) => !gone.has(p.athlete));
  const left = kept.reduce((s, p) => s + p.share, 0);
  const total = lineup.reduce((s, p) => s + p.share, 0);
  if (left <= 0) return [];
  return [
    ...kept.map((p) => ({ athlete: p.athlete, share: (p.share * total) / left })),
    ...lineup.filter((p) => gone.has(p.athlete)).map((p) => ({ athlete: -p.athlete, share: p.share })),
  ];
}

/** After each game day, each team's players out for weeks, each with the return date his entry gives, if any. */
export type LongAbsences = Map<string, Map<Abbr, Map<Athlete, string | undefined>>>;

/**
 * Who is out for weeks after each game day. A player leaves when the next morning's report, or the latest before it,
 * lists him as out with a projected return more than LONG_ABSENCE days away, and stays out while it lists him as out,
 * whatever date it gives, until he plays for the team after the day of his entry. A return date coming within
 * LONG_ABSENCE days does not bring him back: he still misses most of the team's next games.
 */
export function longAbsences(data: SeasonData, box: SeasonBox, archive: InjuryArchive): LongAbsences {
  const reportDays = Object.keys(archive.days).sort();
  const out: LongAbsences = new Map();
  const lastPlayed = new Map<string, string>();
  let gone = new Set<string>();
  for (const { day, games: today } of finalDays(data)) {
    for (const g of today) for (const abbr of [g.home, g.away]) for (const l of box.games[g.id]?.[abbr] ?? []) lastPlayed.set(`${abbr}:${l[0]}`, day);
    // The report saved the morning after the day's games, as the team's history reads it, or the latest before.
    const reportDay = reportDays.filter((d) => d <= addDays(day, 1)).at(-1);
    const teams = new Map<Abbr, Map<Athlete, string | undefined>>();
    const still = new Set<string>();
    for (const e of reportDay ? archive.days[reportDay].injuries : []) {
      const key = `${e.team}:${e.athlete}`;
      const back = (lastPlayed.get(key) ?? "") > dayKey(e.date);
      if (!OUT_STATUSES.has(e.status) || back) continue;
      if (!gone.has(key) && !(e.returnDate && e.returnDate > addDays(day, LONG_ABSENCE))) continue;
      still.add(key);
      teams.set(e.team, (teams.get(e.team) ?? new Map()).set(e.athlete, e.returnDate));
    }
    gone = still;
    out.set(day, teams);
  }
  return out;
}

/**
 * A season's shown rotations with its long absences read: after each game day, a player out for weeks leaves his
 * team's rotation (withoutLongAbsent), and the team's usual rotation comes back once none of its players is. A player
 * who is back counts as the usual rotation counts him, from the games he has played.
 */
function withLongAbsences(data: SeasonData, rotation: SeasonRotations, away: LongAbsences): SeasonRotations {
  const out: SeasonRotations = new Map();
  let usual: Partial<Record<Abbr, Lineup>> = {};
  const adjusted = new Set<Abbr>();
  for (const { day } of finalDays(data)) {
    const entries = rotation.get(day) ?? {};
    usual = { ...usual, ...entries };
    const gone = away.get(day) ?? new Map();
    const shown: Partial<Record<Abbr, Lineup>> = { ...entries };
    for (const [abbr, lineup] of Object.entries(usual)) {
      const g = gone.get(abbr);
      if (lineup && g && lineup.some((p) => g.has(p.athlete))) {
        shown[abbr] = withoutLongAbsent(lineup, new Set(g.keys()));
        adjusted.add(abbr);
      } else if (adjusted.delete(abbr)) shown[abbr] = lineup;
    }
    out.set(day, shown);
  }
  return out;
}

/**
 * compute()'s inputs for each of `seasons`, by season id; `draft` names the top-three picks. With `onCourt`, version
 * 5's settings, each player's rating is his box rating withOnCourt() his on-court residual; without it, his box rating.
 * With `roster`, each game's lineups and extra term are roster-based; without it, version 4's.
 */
export function modelInputs(seasons: readonly SeasonFiles[], draft: Readonly<DraftFile> = {}, onCourt?: OnCourt, roster?: RosterRule): Map<string, ModelInputs> {
  const walked = [...seasons]
    .sort((x, y) => x.data.season.localeCompare(y.data.season))
    .map((s) => ({ ...s, box: s.box === undefined ? { season: s.data.season, games: {} } : parseBox(s.box, s.data.season) }));
  const rookies = newcomers(walked);
  const boxBy = boxRatings(walked, PARAMS.players.halfLife, topThreeStart(walked, rookies, draft));
  const mixed = (rule: OnCourt) => {
    const residuals = onCourtRatings(walked.map((s) => ({ data: s.data, stints: s.stints === undefined ? undefined : parseStints(s.stints, s.data.season) })), boxBy, rule);
    return new Map([...boxBy].map(([season, box]) => [season, withOnCourt(box, residuals.get(season)!, rule.weight)]));
  };
  const ratings = onCourt ? mixed(onCourt) : boxBy;
  const lineupsBySeason = lineups(walked, V4.recent);
  const rotations = usualRotations(walked);
  const homes = trailingHomeEdges(walked.map((s) => s.data), PARAMS);
  const espn = new Map(walked.flatMap((s) => (s.injuries === undefined ? [] : [[s.data.season, parseArchive(s.injuries, s.data.season)] as const])));
  const nba = new Map(walked.flatMap((s) => (s.nbaReports === undefined ? [] : [[s.data.season, parseNbaArchive(s.nbaReports, s.data.season)] as const])));
  const dataOf = (season: string) => walked.find((s) => s.data.season === season)!.data;
  const v4 = availability(walked, nba, (season) => espnLineups(dataOf(season), lineupsBySeason.get(season)!, espn.get(season)), SITE_RULE);
  const priced = roster ? rosterAvailability(walked, nba, roster, v4) : v4;
  const out = new Map<string, ModelInputs>();
  let before: { data: SeasonData; inputs: ModelInputs } | null = null;
  for (const { data, box, preseason } of walked) {
    const abbrs = Object.keys(data.teams);
    const totals = preseason === undefined ? null : parsePreseason(preseason, data.season);
    const everyTotal = totals !== null && abbrs.every((a) => a in totals.totals);
    const last = before && !everyTotal ? lastTeamParts(before.data, before.inputs) : {};
    const archive = espn.get(data.season);
    const inputs: ModelInputs = {
      centres: seedCentres(PARAMS.seed, abbrs, { preseason: totals, last }),
      home: homes.get(data.season)!.value,
      players: {
        box,
        ratings: ratings.get(data.season)!,
        lineups: priced.get(data.season)!.lineups,
        rotation: archive ? withLongAbsences(data, rotations.get(data.season)!, longAbsences(data, box, archive)) : rotations.get(data.season)!,
        rookies: rookies.get(data.season),
      },
      extra: priced.get(data.season)!.extra,
    };
    out.set(data.season, inputs);
    before = { data, inputs };
  }
  return out;
}
