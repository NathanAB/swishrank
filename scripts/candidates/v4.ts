// Version 4 as the site ran it until the switch to version 5 (src/lib/inputs.ts modelInputs with no switches,
// src/lib/v4.ts V4's SIGMA and early widening), as a candidate: the past-seasons test's baseline, and its first
// candidate, against which every difference is exactly zero. Its settings are frozen, so it chooses nothing from the
// earlier seasons.
import { readFileSync } from "node:fs";
import type { DraftFile } from "../../src/lib/draft.ts";
import { fitModel } from "../../src/lib/elo.ts";
import { modelInputs } from "../../src/lib/inputs.ts";
import { V4 } from "../../src/lib/v4.ts";
import { callsOf, type Candidate } from "../past-seasons.ts";

const draft = JSON.parse(readFileSync(new URL("../../src/data/draft.json", import.meta.url), "utf8")) as DraftFile;

const version4: Candidate = {
  name: "Version 4",
  choose: (earlier) => ({
    settings: `version 4's: SIGMA ${V4.sigma}, early widening ${V4.widen}`,
    price: (season) => {
      const inputs = modelInputs([...earlier, season], draft).get(season.data.season)!;
      return callsOf(season.data, fitModel(season.data, inputs), V4.sigma, V4.widen);
    },
  }),
};
export default version4;
