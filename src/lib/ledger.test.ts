import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import players from "../data/players.json" with { type: "json" };
import type { SeasonView } from "./season.ts";

// The ledger reads the data through import.meta.glob, so it loads through Vite, as the dev server loads it.
const server = await createServer({ root: new URL("../..", import.meta.url).pathname, configFile: false, logLevel: "error", server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { allSeasons } = (await server.ssrLoadModule("/src/lib/season.ts")) as typeof import("./season.ts");
const { ledger, walk } = (await server.ssrLoadModule("/src/lib/ledger.ts")) as typeof import("./ledger.ts");
const { counted, EARLY, phi, PARAMS } = (await server.ssrLoadModule("/src/lib/elo.ts")) as typeof import("./elo.ts");

/** Names ESPN gives more than one athlete id, which can rightly show twice in a walk. */
const SHARED = new Set(Object.values(players).filter((n, i, all) => all.indexOf(n) !== i));

const LOGS = [["2026-27", "OKC"], ["2024-25", "LAL"], ["2024-25", "OKC"], ["2023-24", "BOS"], ["2019-20", "MIA"]] as const;

test("every row's walk adds up, part by part and in all, shows each player once, and keeps 1.0 out of the under-a-point lines", () => {
  const seasons = allSeasons();
  let rows = 0;
  for (const [id, abbr] of LOGS) {
    const season = seasons.find((s) => s.id === id)!;
    for (const row of ledger(season, abbr)) {
      const at = `${id} ${abbr} ${row.day}`;
      const w = walk(season, row);
      rows++;
      assert.equal(w.whole.result + w.whole.players + w.whole.others, row.change, `${at}: the three parts add up to the change`);
      for (const part of w.parts) {
        assert.equal(part.lines.reduce((s, l) => s + l.whole, 0), part.whole, `${at}: ${part.label}'s lines add up to its figure`);
      }
      const groups = w.parts.flatMap((p) => p.lines.flatMap((l) => (l.kind === "group" ? l.items : [])));
      assert.deepEqual(groups.filter((x) => Math.abs(x.points) >= 0.95).map((x) => x.name), [], `${at}: nothing under a point reads as 1.0 or more`);
      const names = w.parts.flatMap((p) => p.lines.flatMap((l) => (l.kind === "group" ? l.items : [l]))).filter((x) => x.kind === "player").map((x) => x.name);
      assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i && !SHARED.has(n)), [], `${at}: no player shows twice`);
    }
  }
  assert.ok(rows > 300, `walked ${rows} rows`);
});

/**
 * How far a game's Result may run against its surprise, in a finished season. Across every finished team-season one
 * runs 2 at most, IND's on 2025-12-18; the whole day's change, a new player's minutes included, ran one 13.
 */
const AGAINST = 2;

/** The expected home margin, in counted units, that a home chance `p` came from. */
const expectedMargin = (p: number, widen: number) => {
  let lo = -20, hi = 20;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (phi(mid) < p) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * PARAMS.sigma * widen;
};

/** Each game's home chance, and its home score against the margin that chance came from. */
function surprises(season: SeasonView) {
  const played: Record<string, number> = Object.fromEntries(season.model.abbrs.map((a) => [a, 0]));
  const out = new Map<string, { home: string; p: number; surprise: number }>();
  for (const { game, p } of season.model.results) {
    const widen = Math.min(played[game.home], played[game.away]) < EARLY.games ? EARLY.widen : 1;
    out.set(game.id, { home: game.home, p, surprise: counted(game.hs! - game.as!, PARAMS.margin) - expectedMargin(p, widen) });
    played[game.home]++;
    played[game.away]++;
  }
  return out;
}

/** Each game row of the logs: its team's side of the chance and of the surprise, and its walk. */
function* gameRows() {
  for (const [id, abbr] of LOGS) {
    const season = allSeasons().find((s) => s.id === id)!;
    const games = surprises(season);
    for (const row of ledger(season, abbr)) {
      if (!row.game) continue;
      const { home, p, surprise } = games.get(row.game.id)!;
      const sign = home === abbr ? 1 : -1;
      yield { at: `${id} ${abbr} ${row.day}`, season, row, walk: walk(season, row), chance: home === abbr ? p : 1 - p, surprise: sign * surprise };
    }
  }
}

test("every game row's walk opens on its Result, whose words agree with the score against the margin the model expected", () => {
  let rows = 0;
  for (const { at, row, walk: w, chance, surprise } of gameRows()) {
    rows++;
    const result = w.parts[0];
    assert.equal(result?.key, "result", `${at}: the walk opens on the Result`);
    const { phrase } = result.lines[0] as { phrase: string };
    const won = row.game!.won;
    const fits = phrase.endsWith("despite being favored") ? !won && chance > 0.5
      : phrase.endsWith("despite being the underdog") ? won && chance < 0.5
      : phrase.includes("and by more than expected") ? (won ? surprise > 0 : surprise < 0)
      : phrase.includes("but by less than expected") ? (won ? surprise < 0 : surprise > 0)
      : false;
    assert.ok(fits, `${at}: "${phrase}" with a ${chance.toFixed(3)} chance, ${surprise.toFixed(3)} against the expected margin`);
  }
  assert.ok(rows > 300, `read ${rows} game rows`);
});

test(`no game's Result in a finished season runs more than ${AGAINST} points against the game's surprise`, () => {
  for (const { at, season, walk: w, surprise } of gameRows()) {
    if (!season.end) continue;
    assert.ok(surprise > 0 ? w.whole.result >= -AGAINST : w.whole.result <= AGAINST, `${at}: did ${surprise > 0 ? "better" : "worse"} than expected, Result ${w.whole.result}`);
  }
});
