// What the model reads beyond a season's games: each team's seed from its preseason win total (docs/model-v2.md),
// and, for version 3 (docs/model-v3.md), the season's home edge from the three seasons before it, every player's box
// rating, the season's rookies, and the lineups games are priced with, less the players the morning's injury report
// lists as out. The shown rotation also leaves out the players the report lists as out for weeks. A box rating reads every earlier season, a home edge the seasons before, and a team without a total
// is seeded from its rating at the end of the season before, so the seasons are walked together, oldest first.
import { addDays, finalDays, fitModel, NEWCOMER, PARAMS, seedCentres, type Abbr, type ModelInputs, type SeasonData } from "./elo.ts";
import { trailingHomeEdges } from "./home.ts";
import { parseArchive, type InjuryArchive, type Report } from "./injuries.ts";
import { boxRatings, lineups, parseBox, scaled, usualRotations, type Athlete, type BoxLine, type Lineup, type Lineups, type SeasonBox, type SeasonRotations } from "./players.ts";
import { parsePreseason } from "./preseason.ts";
import { OUT_STATUSES, reportLineups, reportNext } from "./report-lineup.ts";
import { newcomers } from "./rookies.ts";

/**
 * One season's raw files: its games, parsed, and its box scores, preseason totals and injury reports as read from
 * JSON, undefined where a file is missing.
 */
export type SeasonFiles = { data: SeasonData; box: unknown; preseason: unknown; injuries?: unknown };

/** Each team's team part after a season's last game day, or its seed when the season has no final game. */
const lastTeamParts = (data: SeasonData, inputs: ModelInputs): Record<Abbr, number> => fitModel(data, inputs).at(-1)?.after.r ?? inputs.centres ?? {};

/** The latest report in an archive, the one games still to come are priced with. */
const latestReport = (archive: InjuryArchive): Report | undefined => {
  const days = Object.keys(archive.days).sort();
  return days.length ? archive.days[days[days.length - 1]] : undefined;
};

/**
 * A season's lineups with its injury reports applied: each played game's lineup less that day's report, fetched
 * before the day's first tip-off, and each team's next lineup less the latest report.
 */
function withReports(data: SeasonData, seasonLineups: Lineups, archive: InjuryArchive | undefined): Lineups {
  if (!archive) return seasonLineups;
  const report = latestReport(archive);
  const next = new Map([...seasonLineups.next].map(([day, teams]) => [day, reportNext(teams as Record<Abbr, Lineup>, report)]));
  return { ...seasonLineups, previous: reportLineups(data, seasonLineups.previous, archive), next };
}

/** Days ahead a report's projected return must be for a player to leave his team's shown rotation: about 10 games. */
export const LONG_ABSENCE = 21;

/**
 * A rotation without players out for weeks: the minutes a game the team gave out in those of its last 10 games, with
 * box scores, that none of them played, when it has played 2 or more; otherwise the rest of the rotation, with their
 * minutes left to NEWCOMER, a player with no appearances. On the finished seasons, for team-days with a rotation
 * player who missed the next 10 games, this missed those games' margins by 1.3025 in root mean square against 1.3253
 * keeping him, 1.3063 handing his minutes to the rest of the rotation, 1.3026 always to NEWCOMER and 1.3049 to the
 * players who played more in the games he missed, the only one without a bias (mean miss -0.0008, against -0.1063
 * keeping him).
 */
function withoutLongAbsent(lineup: Lineup, gone: ReadonlySet<Athlete>, recent: readonly BoxLine[][]): Lineup {
  const without = recent.filter((lines) => !lines.some((l) => gone.has(l[0])));
  if (without.length >= 2) {
    const minutes = new Map<Athlete, number>();
    for (const lines of without) for (const l of lines) minutes.set(l[0], (minutes.get(l[0]) ?? 0) + l[1] / without.length);
    return scaled([...minutes].map(([athlete, min]) => ({ athlete, min })));
  }
  const kept = lineup.filter((p) => !gone.has(p.athlete));
  const missing = lineup.reduce((s, p) => s + (gone.has(p.athlete) ? p.share : 0), 0);
  return [...kept.map((p) => ({ ...p })), { athlete: NEWCOMER, share: missing }];
}

/**
 * A season's shown rotations with its injury reports read: after each game day, a player the next morning's report,
 * or the latest before it, lists as out with a projected return more than LONG_ABSENCE days away leaves his team's
 * rotation (withoutLongAbsent), and the team's usual rotation comes back once none of its players is.
 */
function withLongAbsences(data: SeasonData, box: SeasonBox, rotation: SeasonRotations, archive: InjuryArchive): SeasonRotations {
  const reportDays = Object.keys(archive.days).sort();
  const games = new Map<Abbr, BoxLine[][]>();
  const out: SeasonRotations = new Map();
  let usual: Partial<Record<Abbr, Lineup>> = {};
  const adjusted = new Set<Abbr>();
  for (const { day, games: today } of finalDays(data)) {
    for (const g of today) for (const abbr of [g.home, g.away]) {
      const lines = box.games[g.id]?.[abbr];
      if (lines) games.set(abbr, [...(games.get(abbr) ?? []), lines].slice(-10));
    }
    const entries = rotation.get(day) ?? {};
    usual = { ...usual, ...entries };
    // The report saved the morning after the day's games, as the team's history reads it, or the latest before.
    const reportDay = reportDays.filter((d) => d <= addDays(day, 1)).at(-1);
    const gone = new Map<Abbr, Set<Athlete>>();
    for (const e of reportDay ? archive.days[reportDay].injuries : []) {
      if (OUT_STATUSES.has(e.status) && e.returnDate && e.returnDate > addDays(day, LONG_ABSENCE)) gone.set(e.team, (gone.get(e.team) ?? new Set()).add(e.athlete));
    }
    const shown: Partial<Record<Abbr, Lineup>> = { ...entries };
    for (const [abbr, lineup] of Object.entries(usual)) {
      const g = gone.get(abbr);
      if (lineup && g && lineup.some((p) => g.has(p.athlete))) {
        shown[abbr] = withoutLongAbsent(lineup, g, games.get(abbr) ?? []);
        adjusted.add(abbr);
      } else if (adjusted.delete(abbr)) shown[abbr] = lineup;
    }
    out.set(day, shown);
  }
  return out;
}

/** compute()'s inputs for each of `seasons`, by season id. */
export function modelInputs(seasons: readonly SeasonFiles[]): Map<string, ModelInputs> {
  const walked = [...seasons]
    .sort((x, y) => x.data.season.localeCompare(y.data.season))
    .map((s) => ({ ...s, box: s.box === undefined ? { season: s.data.season, games: {} } : parseBox(s.box, s.data.season) }));
  const ratings = boxRatings(walked, PARAMS.players.halfLife);
  const lineupsBySeason = lineups(walked);
  const rotations = usualRotations(walked);
  const homes = trailingHomeEdges(walked.map((s) => s.data), PARAMS);
  const rookies = newcomers(walked);
  const out = new Map<string, ModelInputs>();
  let before: { data: SeasonData; inputs: ModelInputs } | null = null;
  for (const { data, box, preseason, injuries } of walked) {
    const abbrs = Object.keys(data.teams);
    const totals = preseason === undefined ? null : parsePreseason(preseason, data.season);
    const everyTotal = totals !== null && abbrs.every((a) => a in totals.totals);
    const last = before && !everyTotal ? lastTeamParts(before.data, before.inputs) : {};
    const archive = injuries === undefined ? undefined : parseArchive(injuries, data.season);
    const inputs: ModelInputs = {
      centres: seedCentres(PARAMS.seed, abbrs, { preseason: totals, last }),
      home: homes.get(data.season)!.value,
      players: {
        box,
        ratings: ratings.get(data.season)!,
        lineups: withReports(data, lineupsBySeason.get(data.season)!, archive),
        rotation: archive ? withLongAbsences(data, box, rotations.get(data.season)!, archive) : rotations.get(data.season)!,
        rookies: rookies.get(data.season),
      },
    };
    out.set(data.season, inputs);
    before = { data, inputs };
  }
  return out;
}
