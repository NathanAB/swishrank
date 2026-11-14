import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compute, dayKey, EARLY, fitModel, seasonRule, type ModelInputs, type SeasonData } from "../../src/lib/elo.ts";
import type { DraftFile } from "../../src/lib/draft.ts";
import { modelInputs, siteInputs } from "../../src/lib/inputs.ts";
import { fitSigma, fitWiden, logLoss, modelRows, price } from "../evaluate.ts";
import { V4 } from "../../src/lib/v4.ts";
import { V5 } from "../../src/lib/v5.ts";
import { callsOf, changedByLaterResults, isCandidate, type Candidate, type Season } from "../past-seasons.ts";
import { chooseFill, FILLS } from "../roster-candidates.ts";
import version4 from "./v4.ts";
import version4Roster from "./v4-roster.ts";
import { describe, priced, version5, type Search } from "./v5.ts";
import { version5Roster } from "./v5-roster.ts";

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
/** Season `id`'s games, box scores, play-by-play and pre-tip reports before `end`, kept small for speed. */
function shortened(id: string, end: string): Season {
  const full = read(`src/data/games/${id}.json`) as SeasonData;
  const games = full.games.filter((g) => dayKey(g.t) < end);
  const ids = new Set(games.map((g) => g.id));
  /** A raw `{ season, games }` file cut to the games above. */
  const cut = (raw: unknown) => typeof raw === "object" && raw !== null && "games" in raw && typeof raw.games === "object" && raw.games !== null
    ? { season: id, games: Object.fromEntries(Object.entries(raw.games).filter(([g]) => ids.has(g))) }
    : undefined;
  return {
    data: { ...full, games }, box: cut(read(`src/data/box/${id}.json`)), preseason: read(`src/data/preseason/${id}.json`), injuries: read(`src/data/injuries/${id}.json`),
    nbaReports: read(`scripts/nba-reports-at-tip/${id}.json`), stints: cut(read(`scripts/stints/${id}.json`)),
  };
}
/** 2023-24 in October and November 2023. */
const ID = "2023-24";
const small = shortened(ID, "2023-12-01");
/** 2022-23 to mid-November 2022: an earlier season with NBA reports, for roster lineups to learn their rates from. */
const early = shortened("2022-23", "2022-11-15");

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
  const want = price(modelRows(small.data, seasonRule(inputs), inputs), V4.sigma, V4.widen);
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

test("the site's chances are the ones the scoreboard gives version 5 with its settings on file, game by game", () => {
  const draft = read("src/data/draft.json") as DraftFile;
  const site = compute(small.data, siteInputs([early, small], draft).get(ID));
  const want = priced([early], V5, V5.roster).price(small);
  const before = (abbr: string, day: string) => site.log[abbr].filter((t) => t.result.day < day).length;
  assert.ok(site.results.length > 100 && site.results.some((r) => Math.min(before(r.game.home, r.day), before(r.game.away, r.day)) < EARLY.games));
  assert.equal(site.results.length, want.size);
  for (const r of site.results) assert.equal(r.p, want.get(r.game.id)?.p, r.game.id);
});

test("siteInputs reads a season's play-by-play record from scripts/stints/ when it is handed none", () => {
  const draft = read("src/data/draft.json") as DraftFile;
  const season = { ...small, stints: undefined };
  const ratings = (inputs: Map<string, ModelInputs>) => inputs.get(ID)!.players!.ratings;
  const site = ratings(siteInputs([season], draft));
  assert.deepEqual(site, ratings(modelInputs([{ ...season, stints: read(`scripts/stints/${ID}.json`) }], draft, V5.onCourt, V5.roster)));
  assert.notDeepEqual(site, ratings(modelInputs([season], draft, undefined, V5.roster)));
});

test("siteInputs throws when the working directory has no scripts/stints/, in place of pricing without the play-by-play record", () => {
  const draft = read("src/data/draft.json") as DraftFile;
  const root = process.cwd();
  process.chdir(tmpdir());
  try {
    assert.throws(() => siteInputs([{ ...small, stints: undefined }], draft), /no scripts\/stints\/ under .*Run from the repository root/);
  } finally {
    process.chdir(root);
  }
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

/** Version 5 with V5's settings and roster lineups at V5's fill. */
const fixedRoster: Candidate = { name: "Version 5 with V5's settings and roster lineups", choose: (earlier) => priced(earlier, V5, V5.roster) };
for (const [f, candidate] of [["v4-roster.ts", version4Roster], ["v5.ts with V5's settings and roster lineups", fixedRoster]] as const) {
  for (const day of ["2023-11-01", "2023-11-08", "2023-11-15", "2023-11-22"]) {
    test(`scripts/candidates/${f}, rates learned from 2022-23: no call reads the results of ${day} or later`, () => {
      assert.deepEqual(changedByLaterResults({ candidate, earlier: [early], season: small, day }), []);
    });
  }
}

test("the walk-forward check above prices 2023-24 from roster lineups, not version 4's", () => {
  const roster = version4Roster.choose([early]).price(small), plain = version4.choose([early]).price(small);
  const differ = [...roster].filter(([id, c]) => JSON.stringify(c.lineup) !== JSON.stringify(plain.get(id)?.lineup));
  assert.ok(differ.length > 100, `${differ.length} games' lineups differ`);
});

test("the fill is version 4's with no roster-priced earlier season, and otherwise the one with the lowest log loss on the roster-priced seasons", () => {
  assert.equal(chooseFill([]), -0.3);
  assert.equal(chooseFill([early]), -0.3);
  const draft = read("src/data/draft.json") as DraftFile;
  const losses = FILLS.map((fill) => {
    const inputs = modelInputs([early, small], draft, undefined, { fill }).get(ID)!;
    return logLoss(price(modelRows(small.data, seasonRule(inputs), inputs), V4.sigma, V4.widen));
  });
  assert.ok(Math.max(...losses) - Math.min(...losses) > 1e-4, "the fills score apart");
  const best = FILLS[losses.indexOf(Math.min(...losses))];
  assert.notEqual(best, V4.fill, "the winner is not the fill chosen with nothing to choose from");
  assert.equal(chooseFill([early, small]), best);
});

/** One rule and two weights: version 5's search in seconds. */
const ONE_RULE: Search = { rules: [{ ridge: 3000, halfLife: 730, boxPrior: 0.5 }], weights: [0, 0.3] };

test("version 5 with roster lineups prices with version 5's own choice for the earlier seasons, at the fill chosen from them", () => {
  const draft = read("src/data/draft.json") as DraftFile;
  const v5 = version5(ONE_RULE);
  const settings = v5.settings([early]);
  const chosen = version5Roster(v5).choose([early]);
  assert.equal(chosen.settings, `${describe(settings)}; roster lineups at fill -0.3`);
  const inputs = modelInputs([early, small], draft, settings.onCourt.weight ? settings.onCourt : undefined, { fill: -0.3 }).get(ID)!;
  const want = callsOf(small.data, fitModel(small.data, inputs), settings.sigma, settings.widen);
  const calls = chosen.price(small);
  assert.ok(want.size > 100);
  assert.equal(calls.size, want.size);
  for (const [id, c] of want) {
    assert.equal(calls.get(id)?.p, c.p, id);
    assert.deepEqual(calls.get(id)?.lineup, c.lineup, id);
  }
});
