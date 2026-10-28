// What version 2 of the model reads beyond a season's games (docs/model-v2.md): each team's seed from its
// preseason win total, and every player's box rating and lineups. A box rating reads every earlier season, so
// the seasons are walked together, oldest first.
import { PARAMS, seedCentres, type ModelInputs, type SeasonData } from "./elo.ts";
import { boxRatings, lineups, parseBox } from "./players.ts";
import { parsePreseason } from "./preseason.ts";

/** One season's raw files: its games, parsed, and its box scores and preseason totals as read from JSON. */
export type SeasonFiles = { data: SeasonData; box: unknown; preseason: unknown };

/** compute()'s inputs for each of `seasons`, by season id. */
export function modelInputs(seasons: readonly SeasonFiles[]): Map<string, ModelInputs> {
  const walked = [...seasons].sort((x, y) => x.data.season.localeCompare(y.data.season)).map((s) => ({ ...s, box: parseBox(s.box, s.data.season) }));
  const ratings = boxRatings(walked, PARAMS.players.halfLife);
  const rotations = lineups(walked);
  return new Map(walked.map(({ data, box, preseason }) => {
    const abbrs = Object.keys(data.teams);
    const centres = seedCentres(PARAMS.seed, abbrs, parsePreseason(preseason, data.season, abbrs));
    return [data.season, { centres, players: { box, ratings: ratings.get(data.season)!, lineups: rotations.get(data.season)! } }];
  }));
}
