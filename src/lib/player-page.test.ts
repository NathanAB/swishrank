import { test } from "node:test";
import assert from "node:assert/strict";
import type { Game, PlayerPart, Season } from "./elo.ts";
import { gameLog, impactStrip, pageIds, partsOf, placeAmong, playerView, seriesOf, shown, standings, waterfall, worthOf, type PlayerWorld } from "./player-page.ts";
import type { PlayerTimeline, TimelinePlayer } from "./player-timeline.ts";
import type { BoxLine } from "./players.ts";

const days = ["2026-10-19", "2026-11-12", "2026-11-13", "2026-11-14"];
const p = (id: number, v: (number | null)[], stints: [number, string][] = [[0, "A"]]): TimelinePlayer => ({ id, name: `P${id}`, v, stints });
// Twelve fillers rated 50 down to 39 at every sample, so every sample has a full list and the top twelve are known.
const fillers = Array.from({ length: 12 }, (_, k) => p(100 + k, days.map(() => 50 - k)));
const full: PlayerTimeline = {
  days,
  seasons: [{ id: "2026-27", label: "2026–27", from: 0, to: 3 }],
  players: [
    ...fillers,
    p(1, [60, 55, 38.5, 45.4]), // first twice, then 13th, then 6th
    p(2, [-10.4, -11, -12.6, -14]), // never near the top
    p(3, [30, 30, 30, null]), // out of the league by the last sample
    p(5, [null, null, null, null]), // a rookie short of the minutes to be rated, who has played this season
    p(6, [null, null, null, null]), // never rated and no game this season
    p(4, [null, null, 45.4, 45.4]), // tied with player 1 at the last sample
  ],
};
// The players page keeps those ever in the top twelve: the fillers and players 1 and 4.
const kept: PlayerTimeline = { ...full, players: full.players.filter((x) => x.id >= 100 || x.id === 1 || x.id === 4) };

test("a player's rank is among everyone rated at the last sample, ties sharing a place, not among the players page's table", () => {
  const s = standings(full);
  assert.deepEqual(s.get(1), { rank: 6, of: 15 });
  assert.deepEqual(s.get(4), { rank: 6, of: 15 });
  assert.deepEqual(s.get(2), { rank: 15, of: 15 }, "ranked though the players page never kept him");
  assert.equal(s.get(3), undefined, "no rating at the last sample, no rank");
});

test("the players with a page are everyone ever rated and everyone who has played this season", () => {
  const line = (athlete: number): BoxLine => [athlete, 12, 4, 2, 5, 0, 0, 1, 2, 1, 0, 0, 1, 2];
  const ids = pageIds({ full, box: { season: "2026-27", games: { g1: { A: [line(5)] } } } });
  assert.deepEqual([...ids].sort((a, b) => a - b), [1, 2, 3, 4, 5, ...fillers.map((f) => f.id)]);
});

test("a sample shows his place only while he is in the top twelve", () => {
  const one = full.players.find((x) => x.id === 1)!;
  assert.deepEqual(seriesOf(one, full, kept), [["2026-10-19", 60, 1], ["2026-11-12", 55, 1], ["2026-11-13", 38.5, null], ["2026-11-14", 45.4, 6]]);
  const two = full.players.find((x) => x.id === 2)!;
  assert.deepEqual(seriesOf(two, full, kept).map((s) => s[2]), [null, null, null, null]);
});

const team = (name: string) => ({ name, short: name, color: "000000", alternateColor: "ffffff" });
const line = (athlete: number, minutes: number): BoxLine => [athlete, minutes, 20, 8, 15, 2, 2, 1, 4, 5, 1, 0, 2, 2];
// 10:30 pm in New York on Nov 13 is Nov 14 in UTC.
const late: Game = { id: "g1", t: "2026-11-14T03:30Z", home: "B", away: "A", hs: 113, as: 112, final: true, neutral: false, note: null };
const early: Game = { id: "g0", t: "2026-11-12T00:00Z", home: "A", away: "B", hs: 100, as: 90, final: true, neutral: false, note: null };
const slot = (athlete: number, worth: number, out = false): PlayerPart => ({ athlete, minutes: 30, adds: 5, out, weekAgo: 0, worth });
const model = (players: Record<string, PlayerPart[]>, r: Record<string, number>) =>
  ({ abbrs: Object.keys(r), r, players, data: { season: "2026-27", teams: { A: team("A"), B: team("B") }, games: [early, late] } }) as unknown as Season;
const box = { season: "2026-27", games: { g0: { A: [line(2, 30)] }, g1: { A: [line(2, 31)] } } };

test("a game is dated by its Eastern day, and the rating after it is his sample on that day, its change from the sample before", () => {
  const two = full.players.find((x) => x.id === 2)!;
  const log = gameLog(model({ A: [], B: [] }, { A: 1000, B: 1000 }), box, full, two);
  assert.deepEqual(log.map((g) => [g.day, g.after, g.change, g.us, g.them, g.home]), [
    ["2026-11-11", null, null, 100, 90, true],
    ["2026-11-13", -12.6, -2, 112, 113, false],
  ]);
});

test("what he is worth is his slot's drop to a gap slot in his team's lineup, and nothing when the lineup has him out", () => {
  const m = model({ A: [slot(2, 99), slot(5, 1)], B: [slot(6, 0, true)] }, { A: 1161, B: 900 });
  assert.deepEqual(worthOf(m, 2, "A"), { team: "A", minutes: 30, out: false, league: { A: 1161, B: 900 }, without: 1062 });
  assert.deepEqual([worthOf(m, 6, "B")!.out, worthOf(m, 6, "B")!.without], [true, 900], "out: the team's rating already has his gap slot");
  assert.equal(worthOf(m, 7, undefined), null, "in no lineup, no team");
});

test("a team's place with and without him is by rating as shown, among the other teams", () => {
  const league = { A: 1161, B: 1170, C: 1100.4, D: 1062.2 };
  assert.equal(placeAmong(league, "A", 1161), 2);
  assert.equal(placeAmong(league, "A", 1062), 3, "1062 ties D's 1062 shown, so D is not above it");
  const s = impactStrip({ team: "A", minutes: 30, out: false, league, without: 1062 });
  assert.deepEqual([s.gain, s.place, s.placeWithout], ["+99", 2, 3]);
  assert.ok(s.wo < s.now, "the ring sits left of the dot");
});

test("a negative rating shows with a minus sign, and its bars run left of zero", () => {
  assert.equal(shown(-12.79), "−13");
  assert.equal(shown(118.17), "118");
  const f = waterfall({ box: -13, onCourt: 0.5, games: -0.6, value: -13.1 });
  assert.deepEqual(f.steps.map((s) => s.text), ["−13", "+1", "−1"]);
  assert.equal(f.zero, 100, "every bar is below zero, so zero is the right edge");
  assert.deepEqual(f.total, { left: 0, width: 100 });
  assert.ok(f.steps.every((st) => st.bar.left + st.bar.width <= f.zero), "every step left of zero");
  const up = waterfall({ box: 85, onCourt: 35, games: -2, value: 118 });
  assert.deepEqual(up.steps.map((s) => [Math.round(s.bar.left), Math.round(s.bar.width)]), [[0, 71], [71, 29], [98, 2]]);
});

test("a player with no rating this season gets his last and best ratings and no figures of the season", () => {
  const w: PlayerWorld = { full, kept, model: model({ A: [], B: [] }, { A: 1000, B: 1000 }), box, ratings: undefined };
  const v = playerView(w, 3);
  assert.equal(v.now, null);
  assert.deepEqual(v.last, { day: "2026-11-13", value: 30 });
  assert.deepEqual(v.peak, { day: "2026-10-19", value: 30 });
  assert.equal(v.worth, null);
  assert.equal(v.parts, null);
  assert.deepEqual(v.log, []);
});

test("a player rated now gets his rank, and his change this season from the pre-opening sample as both show rounded", () => {
  const w: PlayerWorld = { full, kept, model: model({ A: [], B: [] }, { A: 1000, B: 1000 }), box, ratings: undefined };
  assert.deepEqual(playerView(w, 2).now, { value: -14, rank: 15, of: 15, change: -4 });
});

test("his value splits into a times his box rating, a times the rest of his rating, and what the games moved, on the latest day", () => {
  const ratings = (now: number, later: number) => ({ athletes: [2], start: Float64Array.of(0), after: new Map([["2026-11-13", Float64Array.of(now)], ["2026-11-20", Float64Array.of(later)]]) });
  const parts = partsOf({ all: ratings(3, 9), box: ratings(2, 9) }, 2, 10, "2026-11-14")!;
  assert.ok(Math.abs(parts.box - 2 * parts.onCourt) < 1e-9, "box rating 2 against an on-court part of 3 - 2 = 1");
  assert.ok(Math.abs(parts.box + parts.onCourt + parts.games - 10) < 1e-9, "the three make up his value");
  assert.equal(partsOf({ all: ratings(3, 9), box: ratings(2, 9) }, 99, 10, "2026-11-14"), null, "no box rating, no breakdown");
});
