import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dayKey, EARLY, PARAMS, seasonRule, type SeasonData } from "../../src/lib/elo.ts";
import type { DraftFile } from "../../src/lib/draft.ts";
import { modelInputs } from "../../src/lib/inputs.ts";
import { modelRows, price } from "../evaluate.ts";
import { changedByLaterResults, isCandidate, type Season } from "../past-seasons.ts";
import version4 from "./v4.ts";

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
/** 2023-24's games, box scores and pre-tip reports of October and November 2023, kept small for speed. */
const ID = "2023-24";
const full = read(`src/data/games/${ID}.json`) as SeasonData;
const games = full.games.filter((g) => dayKey(g.t) < "2023-12-01");
const ids = new Set(games.map((g) => g.id));
const rawBox = read(`src/data/box/${ID}.json`);
const box = typeof rawBox === "object" && rawBox !== null && "games" in rawBox && typeof rawBox.games === "object" && rawBox.games !== null
  ? { season: ID, games: Object.fromEntries(Object.entries(rawBox.games).filter(([id]) => ids.has(id))) }
  : undefined;
const small: Season = {
  data: { ...full, games }, box, preseason: read(`src/data/preseason/${ID}.json`), injuries: read(`src/data/injuries/${ID}.json`),
  nbaReports: read(`scripts/nba-reports-at-tip/${ID}.json`),
};

for (const [f, candidate] of candidates) {
  test(`scripts/candidates/${f}: no call reads its own day's results or later`, () => {
    assert.deepEqual(changedByLaterResults({ candidate, earlier: [], season: small, day: "2023-11-15" }), []);
  });
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
