import { test } from "node:test";
import assert from "node:assert/strict";
import { fitSeason, PARAMS, type FitRule, type Game, type SeasonData } from "./elo.ts";
import { boxRatings, lineups, type BoxLine, type SeasonBox } from "./players.ts";
import { newcomers } from "./rookies.ts";

const team = (name: string) => ({ name, short: name, color: "000000", alternateColor: "ffffff" });
const line = (athlete: number, min: number, pts: number): BoxLine => [athlete, min, pts, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const game = (id: string, t: string, home: string, away: string, hs: number, as: number): Game => ({ id, t, home, away, hs, as, final: true, neutral: false, note: null });

/** A season of `n` games, A at home to B, A winning each by 20; A plays players 1 and 2, B plays 3 and 4, plus `extra` for A. */
function season(id: string, year: number, n: number, extra?: number): { data: SeasonData; box: SeasonBox } {
  const games = Array.from({ length: n }, (_, i) => game(`${id}-${i}`, `${year}-11-${String(i * 2 + 1).padStart(2, "0")}T23:00Z`, "A", "B", 120, 100));
  const box: SeasonBox = { season: id, games: Object.fromEntries(games.map((g) => [g.id, {
    A: [line(1, 30, 15), line(2, 30, 15), ...(extra ? [line(extra, 30, 15)] : [])],
    B: [line(3, 30, 15), line(4, 30, 15)],
  }])) };
  return { data: { season: id, teams: { A: team("A"), B: team("B") }, games }, box };
}

test("a rookie is a player whose first line on file is in that season, and the first season on file has none", () => {
  const seasons = [season("2016-17", 2016, 2, 5), season("2015-16", 2015, 2), season("2017-18", 2017, 2, 6)];
  const rookies = newcomers(seasons);
  assert.deepEqual([...rookies.get("2015-16")!], []);
  assert.deepEqual([...rookies.get("2016-17")!], [5]);
  assert.deepEqual([...rookies.get("2017-18")!], [6]);
});

test("a weaker hold on a rookie lets his team's results move his value, and changes no one else's hold", () => {
  const seasons = [season("2015-16", 2015, 3), season("2016-17", 2016, 6, 5)];
  const rookies = newcomers(seasons).get("2016-17")!;
  const ratings = boxRatings(seasons, 365).get("2016-17")!;
  const inputs = { players: { box: seasons[1].box, ratings, lineups: lineups(seasons).get("2016-17")!.previous, rookies } };
  const v = (rule: FitRule) => fitSeason(seasons[1].data, rule, inputs).at(-1)!.after.v;
  const base: FitRule = { ...PARAMS, players: { ...PARAMS.players } };
  const held = v(base), loose = v({ ...base, players: { ...base.players!, rookieNp: 40 } });
  const centre = PARAMS.players.a * ratings.after.get(seasons[1].data.games.at(-1)!.t.slice(0, 10))![ratings.athletes.indexOf(5)];
  // A wins every game by 20, so the fit credits A's players; the rookie, held with 40 games, takes more of it.
  assert.ok(loose.get(5)! - centre > 2 * (held.get(5)! - centre), `rookie: ${held.get(5)} held, ${loose.get(5)} loose, centre ${centre}`);
  // Without rookieNp the rookies set changes nothing.
  const plain = fitSeason(seasons[1].data, base, { players: { ...inputs.players, rookies: undefined } }).at(-1)!.after.v;
  for (const [a, x] of plain) assert.ok(Math.abs(x - held.get(a)!) < 1e-12, `player ${a}`);
});
