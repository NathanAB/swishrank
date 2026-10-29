import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { compute, counted, dayKey, EARLY, ELO_PER_SIGMA, finalDays, fitModel, PARAMS, phi, playerPart, shownChange, shownLineups, type Abbr, type SeasonData } from "./elo.ts";
import { modelInputs } from "./inputs.ts";
import type { Lineup } from "./players.ts";

// Every season the site shows, read and rated as src/lib/season.ts does: a new season has no box scores or
// preseason totals until they are fetched or entered.
const read = (path: string): unknown => {
  const url = new URL(`../data/${path}`, import.meta.url);
  return existsSync(url) ? JSON.parse(readFileSync(url, "utf8")) : undefined;
};
const list = read("seasons.json") as { id: string; end?: string }[];
const files = list.map(({ id }) => ({ data: read(`games/${id}.json`) as SeasonData, box: read(`box/${id}.json`), preseason: read(`preseason/${id}.json`) }));
const inputs = modelInputs(files);
const seasons = files.map(({ data }) => ({ id: data.season, data, finished: list.find((s) => s.id === data.season)!.end !== undefined, model: compute(data, inputs.get(data.season)) }));
// The caps read finished seasons only. The deploy runs this suite before it fetches, so a cap on the season
// in progress could fail on a new game and stop the scores updating.
const finished = seasons.filter((s) => s.finished);

/** How far a team's first game may move its shown rating. Version 2 moves one 37 at most, NO's in 2018-19; showing the lineup a team took into its next game moved one 134. */
const FIRST_GAME = 40;
/** How far a shown change may run against the game's surprise. Version 2 runs one 7 at most; the next-game lineup ran one 178. */
const AGAINST = 8;
/**
 * How far a day's new rotation may move a team's shown rating, the fit held fixed. Weighting players
 * by minutes per team game moves one 36 at most from a team's own games, a star's first game of a season; by
 * minutes per appearance moved one 62. A player leaves his old team's rotation the day he plays for a new one, and
 * James Harden's first game for BKN took 57 off HOU on 2021-01-16.
 */
const ROTATION = 60;

test(`no team's first game of a finished season moves its shown rating by more than ${FIRST_GAME}`, () => {
  for (const { id, model } of finished) {
    for (const abbr of model.abbrs) {
      const first = model.log[abbr][0];
      if (!first) continue;
      const { pre, post, game } = first.result;
      const change = shownChange(pre[first.side], post[first.side]);
      assert.ok(Math.abs(change) <= FIRST_GAME, `${id} ${game.id} ${abbr}: ${change}`);
    }
  }
});

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

test(`no shown change in a finished season runs more than ${AGAINST} points against the game's surprise`, () => {
  for (const { id, model } of finished) {
    const played: Record<string, number> = Object.fromEntries(model.abbrs.map((a) => [a, 0]));
    for (const { game, p, pre, post } of model.results) {
      const widen = Math.min(played[game.home], played[game.away]) < EARLY.games ? EARLY.widen : 1;
      const surprise = counted(game.hs! - game.as!, PARAMS.margin) - expectedMargin(p, widen);
      for (const [side, sign] of [["h", 1], ["a", -1]] as const) {
        const change = shownChange(pre[side], post[side]);
        const better = sign * surprise > 0;
        assert.ok(better ? change >= -AGAINST : change <= AGAINST, `${id} ${game.id} ${side}: did ${better ? "better" : "worse"} than expected, moved ${change}`);
      }
      played[game.home]++;
      played[game.away]++;
    }
  }
});

test(`no day's new rotation in a finished season moves a team's shown rating by more than ${ROTATION}`, () => {
  const scale = ELO_PER_SIGMA / PARAMS.sigma;
  for (const { id, data } of finished) {
    const season = inputs.get(id)!;
    const usual: Partial<Record<Abbr, Lineup>> = {};
    for (const { day, after } of fitModel(data, season)) {
      for (const [abbr, lineup] of Object.entries(season.players!.rotation.get(day) ?? {})) {
        const was = usual[abbr];
        const move = was && lineup ? (playerPart(after, lineup) - playerPart(after, was)) * scale : 0;
        assert.ok(Math.abs(move) <= ROTATION, `${id} ${day} ${abbr}: ${move}`);
        usual[abbr] = lineup;
      }
    }
  }
});

test("no team's shown rating counts players while none of its last 10 games has a box score", () => {
  for (const { id, data } of seasons) {
    const { box, rotation } = inputs.get(id)!.players!;
    const shown = shownLineups(data, rotation);
    const boxed: Record<Abbr, boolean[]> = Object.fromEntries(Object.keys(data.teams).map((a) => [a, []]));
    const days = finalDays(data);
    const first = new Map<Abbr, string>();
    for (const { games } of days) for (const g of games) for (const a of [g.home, g.away]) if (!first.has(a)) first.set(a, g.id);
    for (const [a, lineup] of Object.entries(shown.opening)) {
      assert.ok(!lineup.length || box.games[first.get(a)!]?.[a], `${id} ${a} opens with the players of a first game without a box score`);
    }
    for (const { day, games } of days) {
      for (const g of games) for (const a of [g.home, g.away]) boxed[a].push(box.games[g.id]?.[a] !== undefined);
      for (const [a, lineup] of Object.entries(shown.after.get(day)!)) {
        if (!boxed[a].length) continue;
        assert.ok(boxed[a].slice(-10).some((b) => b) || !lineup.length, `${id} ${day} ${a} counts ${lineup.length} players`);
      }
    }
  }
});

test("no player counts for two teams on the same day", () => {
  for (const { id, data } of seasons) {
    const shown = shownLineups(data, inputs.get(id)!.players!.rotation);
    for (const [day, lineups] of [["opening", shown.opening] as const, ...shown.after]) {
      const teamOf = new Map<number, Abbr>();
      for (const [a, lineup] of Object.entries(lineups)) for (const { athlete } of lineup) {
        assert.ok(!teamOf.has(athlete), `${id} ${day}: athlete ${athlete} counts for ${teamOf.get(athlete)} and ${a}`);
        teamOf.set(athlete, a);
      }
    }
  }
});

test("after a team's last game of the season, its rating does not move", () => {
  for (const { id, data, model } of seasons) {
    const lastDay = new Map<Abbr, string>();
    for (const g of data.games) for (const a of [g.home, g.away]) if (dayKey(g.t) > (lastDay.get(a) ?? "")) lastDay.set(a, dayKey(g.t));
    for (let i = 1; i < model.series.length; i++) {
      const [was, now] = [model.series[i - 1], model.series[i]];
      for (const a of model.abbrs.filter((a) => was.day >= lastDay.get(a)!)) assert.equal(now.r[a], was.r[a], `${id} ${now.day}: ${a}`);
    }
  }
});
