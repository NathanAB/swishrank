// What version 2 of the model reads beyond a season's games (docs/model-v2.md): each team's seed from its
// preseason win total, and every player's box rating and lineups. A box rating reads every earlier season, and a
// team without a total is seeded from its rating at the end of the season before, so the seasons are walked
// together, oldest first.
import { fitModel, PARAMS, seedCentres, type Abbr, type ModelInputs, type SeasonData } from "./elo.ts";
import { boxRatings, lineups, parseBox } from "./players.ts";
import { parsePreseason } from "./preseason.ts";

/** One season's raw files: its games, parsed, and its box scores and preseason totals as read from JSON, undefined where a file is missing. */
export type SeasonFiles = { data: SeasonData; box: unknown; preseason: unknown };

/** Each team's team part after a season's last game day, or its seed when the season has no final game. */
const lastTeamParts = (data: SeasonData, inputs: ModelInputs): Record<Abbr, number> => fitModel(data, inputs).at(-1)?.after.r ?? inputs.centres ?? {};

/** compute()'s inputs for each of `seasons`, by season id. */
export function modelInputs(seasons: readonly SeasonFiles[]): Map<string, ModelInputs> {
  const walked = [...seasons]
    .sort((x, y) => x.data.season.localeCompare(y.data.season))
    .map((s) => ({ ...s, box: s.box === undefined ? { season: s.data.season, games: {} } : parseBox(s.box, s.data.season) }));
  const ratings = boxRatings(walked, PARAMS.players.halfLife);
  const rotations = lineups(walked);
  const out = new Map<string, ModelInputs>();
  let before: { data: SeasonData; inputs: ModelInputs } | null = null;
  for (const { data, box, preseason } of walked) {
    const abbrs = Object.keys(data.teams);
    const totals = preseason === undefined ? null : parsePreseason(preseason, data.season);
    const everyTotal = totals !== null && abbrs.every((a) => a in totals.totals);
    const last = before && !everyTotal ? lastTeamParts(before.data, before.inputs) : {};
    const inputs: ModelInputs = {
      centres: seedCentres(PARAMS.seed, abbrs, { preseason: totals, last }),
      players: { box, ratings: ratings.get(data.season)!, lineups: rotations.get(data.season)! },
    };
    out.set(data.season, inputs);
    before = { data, inputs };
  }
  return out;
}
