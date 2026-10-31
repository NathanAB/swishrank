// What the model reads beyond a season's games: each team's seed from its preseason win total (docs/model-v2.md),
// and, for version 3 (docs/model-v3.md), the season's home edge from the three seasons before it, every player's box
// rating, the season's rookies, and the lineups games are priced with, less the players the morning's injury report
// lists as out. A box rating reads every earlier season, a home edge the seasons before, and a team without a total
// is seeded from its rating at the end of the season before, so the seasons are walked together, oldest first.
import { fitModel, PARAMS, seedCentres, type Abbr, type ModelInputs, type SeasonData } from "./elo.ts";
import { trailingHomeEdges } from "./home.ts";
import { parseArchive, type InjuryArchive, type Report } from "./injuries.ts";
import { boxRatings, lineups, parseBox, usualRotations, type Lineup, type Lineups } from "./players.ts";
import { parsePreseason } from "./preseason.ts";
import { reportLineups, reportNext } from "./report-lineup.ts";
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
        rotation: rotations.get(data.season)!,
        rookies: rookies.get(data.season),
      },
    };
    out.set(data.season, inputs);
    before = { data, inputs };
  }
  return out;
}
