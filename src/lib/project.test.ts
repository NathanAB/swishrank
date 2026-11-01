import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFERENCES } from "./teams.ts";
import { DIVISIONS, generator, LOTTERY, meanWins, seriesChance, simulate, winsAt, type Played, type Setup } from "./project.ts";

const abbrs = [...CONFERENCES.East, ...CONFERENCES.West];
const flat = (rating = 1000) => Object.fromEntries(abbrs.map((a) => [a, [{ day: "2026-11-01", rating }]]));
const setup = (over: Partial<Setup> = {}): Setup => ({
  abbrs, played: [], fixtures: [], outlook: flat(), home: 45, format: "play-in", today: "2026-11-01", drift: { tau: 0, walk: 0 }, ...over,
});

test("the divisions hold every team once, five to a division, inside one conference", () => {
  const all = Object.values(DIVISIONS).flat();
  assert.equal(new Set(all).size, 30);
  assert.deepEqual([...all].sort(), [...abbrs].sort());
  for (const members of Object.values(DIVISIONS)) {
    assert.equal(members.length, 5);
    assert.ok(members.every((a) => CONFERENCES.East.includes(a)) || members.every((a) => CONFERENCES.West.includes(a)));
  }
});

test("a series between level teams on neutral ground is even, and home court is worth something", () => {
  assert.ok(Math.abs(seriesChance(1000, 1000, 0) - 0.5) < 1e-9);
  const withHome = seriesChance(1000, 1000, 45);
  assert.ok(withHome > 0.5 && withHome < 0.56, `home court in a series: ${withHome}`);
  assert.ok(seriesChance(1100, 1000, 45) > seriesChance(1050, 1000, 45));
});

test("the generator repeats itself from a seed and its normals have mean 0 and spread 1", () => {
  const a = generator(7), b = generator(7);
  for (let i = 0; i < 5; i++) assert.equal(a.next(), b.next());
  const g = generator(11);
  let s = 0, s2 = 0;
  const n = 200_000;
  for (let i = 0; i < n; i++) { const z = g.normal(); s += z; s2 += z * z; }
  assert.ok(Math.abs(s / n) < 0.01);
  assert.ok(Math.abs(s2 / n - 1) < 0.01);
});

test("a finished season seeds by record and sends the 14 teams left out to the lottery", () => {
  // Inside each conference every team plays every other once, and the team earlier in the list wins.
  const east = [...CONFERENCES.East];
  const played: Played[] = [];
  for (let i = 0; i < east.length; i++) for (let j = i + 1; j < east.length; j++) played.push({ home: east[i], away: east[j], homeWon: true });
  const west = [...CONFERENCES.West];
  for (let i = 0; i < west.length; i++) for (let j = i + 1; j < west.length; j++) played.push({ home: west[i], away: west[j], homeWon: true });
  const p = simulate(setup({ played }), 200);
  for (const [k, a] of east.entries()) assert.equal(p.teams[a].seed[k], 200, `${a} seed ${k + 1}`);
  for (const a of abbrs) {
    const odds = p.teams[a];
    const left = odds.pick.reduce((s, x) => s + x, 0);
    assert.equal(left + odds.playoffs, 200, `${a} is either in the playoffs or in the lottery`);
  }
  // The last team in the East shares the worst record with the last in the West, so it holds the lottery's first
  // or second slot and picks no lower than 6th.
  const worst = p.teams[east.at(-1)!];
  assert.equal(worst.pick.slice(6).reduce((s, x) => s + x, 0), 0);
});

test("the lottery's combinations add up to 1000", () => {
  assert.equal(LOTTERY.reduce((s, x) => s + x, 0), 1000);
});

test("level teams split their chances, and a far better team nearly always wins the title", () => {
  const fixtures = abbrs.flatMap((h, i) => abbrs.filter((_, j) => j !== i && (i + j) % 3 === 0).map((a, k) => ({ id: `${h}-${a}-${k}`, day: "2026-12-01", home: h, away: a, edge: 45 })));
  const even = simulate(setup({ fixtures }), 3000);
  const titles = abbrs.map((a) => even.teams[a].title / even.runs);
  assert.ok(Math.max(...titles) < 0.08, `no level team should stand out: ${Math.max(...titles)}`);
  const outlook = { ...flat(), BOS: [{ day: "2026-11-01", rating: 1400 }] };
  const tilted = simulate(setup({ fixtures, outlook }), 2000);
  assert.ok(tilted.teams.BOS.title / tilted.runs > 0.9);
  assert.ok(winsAt(tilted.teams.BOS.wins, 0.5) > meanWins(tilted.teams.BKN.wins));
});

test("drift widens a team's spread of final wins without moving its middle", () => {
  const fixtures = abbrs.flatMap((h, i) => abbrs.filter((_, j) => j !== i && (i + j) % 2 === 0).map((a, k) => ({ id: `${h}-${a}-${k}`, day: "2027-02-01", home: h, away: a, edge: 0 })));
  const still = simulate(setup({ fixtures }), 3000, 1);
  const moving = simulate(setup({ fixtures, drift: { tau: 60, walk: 20 } }), 3000, 1);
  const spread = (w: number[]) => winsAt(w, 0.9) - winsAt(w, 0.1);
  assert.ok(spread(moving.teams.NY.wins) > spread(still.teams.NY.wins));
  assert.ok(Math.abs(meanWins(moving.teams.NY.wins) - meanWins(still.teams.NY.wins)) < 1);
});
