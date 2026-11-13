import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dayKey, EARLY, PARAMS, seasonRule, type SeasonData } from "../../src/lib/elo.ts";
import type { DraftFile } from "../../src/lib/draft.ts";
import { modelInputs } from "../../src/lib/inputs.ts";
import { fitSigma, fitWiden, logLoss, modelRows, price } from "../evaluate.ts";
import { V5 } from "../../src/lib/v5.ts";
import { changedByLaterResults, isCandidate, type Candidate, type Season } from "../past-seasons.ts";
import version4 from "./v4.ts";
import { describe, priced, version5, type Search } from "./v5.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const files = readdirSync(here).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).sort();
const candidates = await Promise.all(files.map(async (f) => {
  const mod: unknown = await import(resolve(here, f));
  const c = typeof mod === "object" && mod !== null && "default" in mod ? mod.default : undefined;
  if (!isCandidate(c)) throw new Error(`scripts/candidates/${f} has no default export shaped like a Candidate`);
  return [f, c] as const;
}));

/** Betting numbers: docs/adr/0001 keeps them out of every version. */
const MARKET = [/^scripts\/vegas\.ts$/, /^scripts\/polymarket\.ts$/, /^src\/lib\/odds\.ts$/, /^scripts\/vegas\//, /^scripts\/polymarket\//, /^src\/data\/odds\//];
const IMPORT = /(?:^|\n)\s*(?:import|export)\s(?:[^;"']*?\sfrom\s)?\s*["']([^"']+)["']/g;
/** Every repo file `file` reaches through static relative imports, as paths from the repo root. */
function reached(file: string): Set<string> {
  const seen = new Set<string>();
  const walk = (abs: string) => {
    const rel = relative(root, abs);
    if (seen.has(rel)) return;
    seen.add(rel);
    for (const [, spec] of readFileSync(abs, "utf8").matchAll(IMPORT)) if (spec.startsWith(".")) walk(resolve(dirname(abs), spec));
  };
  walk(file);
  return seen;
}

/** A quoted path that names a betting file, however it is opened: a dynamic import or a read by path has no import line. */
const MARKET_PATH = /["'`][^"'`\n]*(?:vegas|polymarket|odds)[^"'`\n]*["'`]/i;
/** A quoted path into the seasons' own data: a candidate reads seasons only through choose() and price(). */
const SEASON_PATH = /["'`][^"'`\n]*(?:data\/(?:games|box|preseason|injuries|nba-reports)|nba-reports-at-tip|stints\/|seasons\.json)[^"'`\n]*["'`]/;

for (const f of files) {
  test(`scripts/candidates/${f} reaches no betting number`, () => {
    const all = [...reached(resolve(here, f))];
    assert.deepEqual(all.filter((p) => MARKET.some((m) => m.test(p))), []);
    assert.deepEqual(all.filter((p) => MARKET_PATH.test(readFileSync(resolve(root, p), "utf8"))), []);
  });
  test(`scripts/candidates/${f} reads no season file itself`, () => {
    assert.doesNotMatch(readFileSync(resolve(here, f), "utf8"), SEASON_PATH);
  });
}

const read = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(resolve(root, path), "utf8"));
  } catch {
    return undefined;
  }
};
/** 2023-24's games, box scores, play-by-play and pre-tip reports of October and November 2023, kept small for speed. */
const ID = "2023-24";
const full = read(`src/data/games/${ID}.json`) as SeasonData;
const games = full.games.filter((g) => dayKey(g.t) < "2023-12-01");
const ids = new Set(games.map((g) => g.id));
/** A raw `{ season, games }` file cut to the games above. */
const cut = (raw: unknown) => typeof raw === "object" && raw !== null && "games" in raw && typeof raw.games === "object" && raw.games !== null
  ? { season: ID, games: Object.fromEntries(Object.entries(raw.games).filter(([id]) => ids.has(id))) }
  : undefined;
const small: Season = {
  data: { ...full, games }, box: cut(read(`src/data/box/${ID}.json`)), preseason: read(`src/data/preseason/${ID}.json`), injuries: read(`src/data/injuries/${ID}.json`),
  nbaReports: read(`scripts/nba-reports-at-tip/${ID}.json`), stints: cut(read(`scripts/stints/${ID}.json`)),
};

/** Version 5 with the site's settings on file: with no earlier season, the file's own candidate has no on-court rating to check. */
const fixed: Candidate = { name: "Version 5 with V5's settings", choose: (earlier) => priced(earlier, V5) };
for (const [f, candidate] of [...candidates, ["v5.ts with V5's settings", fixed] as const]) {
  for (const day of ["2023-11-01", "2023-11-08", "2023-11-15", "2023-11-22"]) {
    test(`scripts/candidates/${f}: no call reads the results of ${day} or later`, () => {
      assert.deepEqual(changedByLaterResults({ candidate, earlier: [], season: small, day }), []);
    });
  }
}

test("version 4's calls are the chances scripts/evaluate.ts prices, game by game", () => {
  const draft = read("src/data/draft.json") as DraftFile;
  const inputs = modelInputs([small], draft).get(ID)!;
  const want = price(modelRows(small.data, seasonRule(inputs), inputs), PARAMS.sigma, EARLY.widen);
  const calls = version4.choose([]).price(small);
  assert.ok(want.length > 100 && want.some((r) => r.k < EARLY.games));
  assert.equal(calls.size, want.length);
  for (const r of want) assert.equal(calls.get(r.id)?.p, r.p, r.id);
});

test("version 4's chances for three real games do not move with version 5's on-court settings in modelInputs", () => {
  // Without the pre-tip reports, whose archive is rebuilt now and then: the rest of these files is final.
  const calls = version4.choose([]).price({ ...small, nbaReports: undefined });
  assert.equal(calls.get("401584689")?.p, 0.6072995577180842, "opening night, 2023-10-24");
  assert.equal(calls.get("401584749")?.p, 0.6166602765263318, "2023-11-01");
  assert.equal(calls.get("401584901")?.p, 0.609380487145311, "2023-11-30");
});

/** Two rules far apart and three weights, the largest far past the search's, so the scores differ visibly. */
const SMALL_SEARCH: Search = { rules: [{ ridge: 3000, halfLife: 730, boxPrior: 0.5 }, { ridge: 50, halfLife: 30, boxPrior: 0 }], weights: [0, 0.3, 0.6] };

test("version 5 scores each combination of its search as a real fit with those settings scores it, and chooses the lowest", () => {
  const draft = read("src/data/draft.json") as DraftFile;
  const candidate = version5(SMALL_SEARCH);
  const scores = candidate.scores([small]);
  assert.equal(scores.length, 6);
  for (const { settings, loss } of scores) {
    const inputs = modelInputs([small], draft, settings.onCourt.weight ? settings.onCourt : undefined).get(ID)!;
    const rows = modelRows(small.data, seasonRule(inputs), inputs);
    const sigma = Number(fitSigma(rows).toFixed(3)), widen = Number(fitWiden(rows, sigma).toFixed(2));
    assert.ok(Math.abs(loss - logLoss(price(rows, sigma, widen))) < 1e-6, describe(settings));
    assert.deepEqual([settings.sigma, settings.widen], [sigma, widen], describe(settings));
  }
  const losses = scores.map((s) => s.loss);
  assert.ok(Math.max(...losses) - Math.min(...losses) > 1e-3, "the combinations score apart");
  assert.equal(candidate.choose([small]).settings, describe(scores[losses.indexOf(Math.min(...losses))].settings));
});

test("version 5's search starts again when it is handed other seasons than the ones it has fitted", () => {
  const bare: Season = { ...small, stints: undefined };
  const candidate = version5(SMALL_SEARCH);
  const first = candidate.scores([small]);
  const again = candidate.scores([bare]);
  assert.deepEqual(again, version5(SMALL_SEARCH).scores([bare]));
  assert.notDeepEqual(again, first);
});
