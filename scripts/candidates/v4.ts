// Version 4 as the site runs it (src/lib/inputs.ts modelInputs, src/lib/elo.ts PARAMS and EARLY), as a candidate:
// the past-seasons test's baseline, and its first candidate, against which every difference is exactly zero. Its
// settings are the site's, so it chooses nothing from the earlier seasons.
import { readFileSync } from "node:fs";
import type { DraftFile } from "../../src/lib/draft.ts";
import { EARLY, fitModel, PARAMS } from "../../src/lib/elo.ts";
import { modelInputs } from "../../src/lib/inputs.ts";
import { callsOf, type Candidate } from "../past-seasons.ts";

const draft = JSON.parse(readFileSync(new URL("../../src/data/draft.json", import.meta.url), "utf8")) as DraftFile;

const version4: Candidate = {
  name: "Version 4",
  choose: (earlier) => ({
    settings: `the site's: SIGMA ${PARAMS.sigma}, early widening ${EARLY.widen}`,
    price: (season) => {
      const inputs = modelInputs([...earlier, season], draft).get(season.data.season)!;
      return callsOf(season.data, fitModel(season.data, inputs), PARAMS.sigma, EARLY.widen);
    },
  }),
};
export default version4;
