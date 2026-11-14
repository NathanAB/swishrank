import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import players from "../data/players.json" with { type: "json" };
import type { SeasonView } from "./season.ts";

// The ledger reads the data through import.meta.glob, so it loads through Vite, as the dev server loads it.
const server = await createServer({ root: new URL("../..", import.meta.url).pathname, configFile: false, logLevel: "error", server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { allSeasons } = (await server.ssrLoadModule("/src/lib/season.ts")) as typeof import("./season.ts");
const { ledger, minuteRows, walk } = (await server.ssrLoadModule("/src/lib/ledger.ts")) as typeof import("./ledger.ts");
const { counted, EARLY, phi, PARAMS } = (await server.ssrLoadModule("/src/lib/elo.ts")) as typeof import("./elo.ts");

/** Names ESPN gives more than one athlete id, which can rightly show twice in a walk. */
const SHARED = new Set(Object.values(players).filter((n, i, all) => all.indexOf(n) !== i));

const LOGS = [["2026-27", "OKC"], ["2024-25", "LAL"], ["2024-25", "OKC"], ["2023-24", "BOS"], ["2019-20", "MIA"]] as const;

test("every row's walk adds up, part by part and in all, shows each player once, and keeps 1.0 out of the under-a-point lines", () => {
  const seasons = allSeasons();
  let rows = 0, updates = 0;
  for (const [id, abbr] of LOGS) {
    const season = seasons.find((s) => s.id === id)!;
    for (const row of ledger(season, abbr)) {
      const at = `${id} ${abbr} ${row.day}`;
      const w = walk(season, row);
      rows++;
      const court = w.parts.flatMap((p) => p.lines.flatMap((l) => (l.kind === "group" ? l.items : [l]).map((x) => ({ part: p.key, ...x })))).filter((x) => x.kind === "court");
      const shown = Math.abs(row.court) >= 0.05 && w.parts.some((p) => p.key === "players");
      if (shown) updates++;
      assert.ok(court.length === Number(shown) && court.every((x) => x.part === "players" && x.points === row.court), `${at}: the on-court update of ${row.court} shows as ${JSON.stringify(court)}`);
      assert.equal(w.whole.result + w.whole.players, row.change, `${at}: the two parts add up to the change`);
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
  assert.ok(updates > 20, `walked ${updates} on-court updates`);
});

/**
 * How far a game's Result may run against its surprise, in a finished season. Across every finished team-season one
 * runs 2 at most, IND's on 2025-12-18; the whole day's change, a new player's minutes included, ran one 13. Version 5's
 * on-court update moves every player's value at once, and the walk books it on its own players' line, never in
 * the Result, which keeps it there.
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

/**
 * How far the seed's line may move a team-day of 2025-26, a finished season, so the bound does not age: its fading,
 * which runs largest after a week off. Version 4's largest was 3.64 and version 5's is 2.92, both DAL's on 2026-03-05;
 * with version 5's on-court update booked in it, it reaches 18.88.
 */
const FADING = 4;

test(`the seed's line moves no team-day of 2025-26 by ${FADING} points or more, and the on-court update moves a team after most of its games and on no day off`, () => {
  const season = allSeasons().find((s) => s.id === "2025-26")!;
  let games = 0, moved = 0;
  for (const abbr of season.model.abbrs) for (const row of ledger(season, abbr)) {
    const at = `${season.id} ${abbr} ${row.day}`;
    assert.ok(Math.abs(row.seed) < FADING, `${at}: the seed's line is ${row.seed}`);
    if (!row.game) {
      assert.ok(Math.abs(row.court) < 1e-9, `${at}: the on-court update is ${row.court} on a day off`);
      continue;
    }
    games++;
    if (Math.abs(row.court) >= 0.5) moved++;
  }
  // Refitted after every 7th game day it moved 859 of the season's 2,644 team-games by half a point or more.
  assert.ok(games > 2600 && moved > games / 2, `the on-court update moves ${moved} of ${games} team-games by half a point or more`);
});

test("minutes that change hands are credited to whoever caused the trade, a sitter never gains, and the rows still add up", () => {
  // Player 1, rated -40 a 48, sits 10 of his minutes and 4 (+10) gives up 3; 2 (-60) takes 8, 3 (+20) 2, and 5 (-50),
  // new to the rotation, 3.
  const m = (athlete: number, before: number, after: number, value: number, sat = false) => ({ athlete, before: before / 48, after: after / 48, value, gap: 0, sat });
  const changes = [m(1, 20, 10, -40, true), m(2, 10, 18, -60), m(3, 30, 32, 20), m(4, 30, 27, 10), m(5, 0, 3, -50)];
  const rows = minuteRows(changes);
  const total = changes.reduce((s, c) => s + (c.after - c.before) * c.value, 0);
  assert.ok(Math.abs([...rows.values()].reduce((s, r) => s + r.points, 0) - total) < 1e-9, "the rows add up to the rotation's change");
  // 1 sat: he answers for the trades to 2 and 5, worse than him; his trade to 3, better, is 3's.
  const ones = (10 / 48) * (8 / 13) * (-60 + 40) + (10 / 48) * (3 / 13) * (-50 + 40);
  assert.ok(Math.abs(rows.get(1)!.points - ones) < 1e-9, `1: ${rows.get(1)!.points} against ${ones}`);
  assert.ok(Math.abs(rows.get(3)!.points - ((10 / 48) * (2 / 13) * 60 + (3 / 48) * (2 / 13) * 10 * 0.5)) < 1e-9, "3 holds the gain of taking 1's minutes");
  // 5 joined, worse than 4, so that trade's loss is 4's; 4's trades with 2 and 3 are split.
  const fours = (3 / 48) * (8 / 13) * (-60 - 10) * 0.5 + (3 / 48) * (2 / 13) * (20 - 10) * 0.5 + (3 / 48) * (3 / 13) * (-50 - 10);
  assert.ok(Math.abs(rows.get(4)!.points - fours) < 1e-9, `4: ${rows.get(4)!.points} against ${fours}`);
  // A player rated below the one who takes his minutes shows nothing for sitting; the taker shows the gain.
  const low = minuteRows([m(1, 20, 10, -60, true), m(2, 20, 30, 0)]);
  assert.equal(low.get(1)!.points, 0);
  assert.ok(Math.abs(low.get(2)!.points - (10 / 48) * 60) < 1e-9);
  // An absent player's gap is his on the day he leaves, and the takers' as it fades.
  const leaving = minuteRows([{ athlete: 9, before: 0.5, after: 0, value: 30, gap: -10, sat: false }, { athlete: 1, before: 4.5, after: 5, value: 0, gap: 0, sat: false }]);
  assert.equal(leaving.get(9)!.backups, -10);
  const fading = minuteRows([{ athlete: 9, before: 0, after: 0, value: 30, gap: 2, sat: false }, { athlete: 1, before: 4, after: 4.5, value: 0, gap: 0, sat: false }, { athlete: 2, before: 1, after: 0.5, value: 0, gap: 0, sat: false }]);
  assert.equal(fading.get(9)!.points, 0, "nothing on the absent player while he stays out");
  assert.equal(fading.get(1)!.points, 2, "the fading gap goes to the teammate now counted for his minutes");
});

test("a player out for weeks stays out of his team's rating while the report still lists him out, however near his return date", () => {
  // Ja Morant (POR, out Oct 30 to Dec 1), Paolo Banchero (ORL, to Nov 22) and Kawhi Leonard (TOR, to Nov 23) each
  // came back into the rating 21 days before their return dates, while still out and missing nearly all of the next
  // 10 games.
  const season = allSeasons().find((s) => s.id === "2026-27")!;
  const early = ["POR", "ORL", "TOR"].flatMap((abbr) => ledger(season, abbr).flatMap((row) => row.players
    .filter((p) => p.status === "joined" && p.backups && p.played == null && p.injury?.status === "Out")
    .map((p) => `${abbr} ${row.day} ${p.name}`)));
  assert.deepEqual(early, []);
});
