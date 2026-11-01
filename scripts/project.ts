// npm run project -- <out.json>: the current season played out (src/lib/project.ts), written as JSON for the
// projection prototypes: each team's final wins, seeds, playoff rounds and lottery picks; the week ahead's games by
// how much they move the playoff race; the cut lines; the likeliest series; remaining schedule strength; and each
// team's odds on every day so far, this season and last.
//
// Two things here stand in for what the site would read:
//   - The games file holds two weeks ahead (FIXTURE_DAYS in scripts/fetch-season.mjs). Past them this builds a
//     stand-in schedule by the league's formula: 4 games against each division rival, 4 against six of the other ten
//     conference teams and 3 against the other four, 2 against each team in the other conference, 41 at home, every
//     pair's count kept at or above what the file already holds. Which conference pairs play 4 is a guess, so the
//     site would fetch the real schedule, which ESPN's scoreboard carries for the whole season.
//   - A team whose shown rating leaves out players the injury report lists out for weeks gets them back on their
//     listed return dates, at their minutes in the games they played for it (or last season's), so the projection
//     does not play the whole season without them.
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { addDays, compute, dayKey, ELO_PER_SIGMA, fitModel, PARAMS, phi, playerPart, shownLineups, START, type Abbr, type Fit, type Season, type SeasonData } from "../src/lib/elo.ts";
import { modelInputs, LONG_ABSENCE } from "../src/lib/inputs.ts";
import { parseArchive } from "../src/lib/injuries.ts";
import { scaled, type Lineup } from "../src/lib/players.ts";
import { DIVISIONS, divisionOf, generator, meanWins, setupAt, shownOutlook, simulate, stakes, winsAt, type Drift, type Fixture, type Outlook, type Projection } from "../src/lib/project.ts";
import { conferenceOf, stage } from "../src/lib/teams.ts";

/** The drift scripts/backtest-projections.ts chose on the tuning seasons. */
export const DRIFT: Drift = { tau: 60, walk: 20, playoff: 0.5 };
const RUNS = 20000;
const HISTORY_RUNS = 1500;
/** The stand-in schedule's last day, about when the regular season ends. */
const SEASON_END = "2027-04-11";

const out = process.argv[2];
if (!out) throw new Error("usage: node scripts/project.ts <out.json>");
const read = (path: string): unknown => {
  const url = new URL(`../src/data/${path}`, import.meta.url);
  return existsSync(url) ? JSON.parse(readFileSync(url, "utf8")) : undefined;
};
const list = read("seasons.json") as { id: string; end?: string }[];
const ids = list.map((s) => s.id).sort();
const current = list.find((s) => !s.end)!.id;
const last = ids[ids.indexOf(current) - 1];
const files = ids.map((id) => ({ data: read(`games/${id}.json`) as SeasonData, box: read(`box/${id}.json`), preseason: read(`preseason/${id}.json`), injuries: read(`injuries/${id}.json`) }));
const inputs = modelInputs(files);
const dataOf = (id: string) => files.find((f) => f.data.season === id)!.data;
const model = compute(dataOf(current), inputs.get(current));
const lastModel = compute(dataOf(last), inputs.get(last));
const today = model.series.at(-1)!.day;

// ---- The stand-in schedule ----------------------------------------------------------------------------------------

/** How many times each team hosts each other team in an 82-game season, chosen to fit the games already in the file. */
function standIn(model: Season, seed: number): Fixture[] {
  const abbrs = model.abbrs;
  const known = new Map<string, number>();
  const key = (h: Abbr, a: Abbr) => `${h}>${a}`;
  for (const g of model.data.games) if (stage(g.note).standings) known.set(key(g.home, g.away), (known.get(key(g.home, g.away)) ?? 0) + 1);
  const host = new Map<string, number>();
  const flexible: [Abbr, Abbr][] = [];
  for (const x of abbrs) for (const y of abbrs) {
    if (x >= y) continue;
    const sameConf = conferenceOf(x) === conferenceOf(y);
    const sameDiv = divisionOf(x) === divisionOf(y);
    if (!sameConf) { host.set(key(x, y), 1); host.set(key(y, x), 1); }
    else if (sameDiv) { host.set(key(x, y), 2); host.set(key(y, x), 2); }
    else flexible.push([x, y]);
  }
  // Each flexible pair is 2-2 (four games), 2-1 or 1-2 (three). Every team needs six four-game pairs and 41 home games.
  const rng = generator(seed);
  const kinds = [[2, 2], [2, 1], [1, 2]] as const;
  const choice = flexible.map(() => Math.floor(rng.next() * 3));
  const cost = () => {
    const four = new Map<Abbr, number>(), home = new Map<Abbr, number>();
    let c = 0;
    flexible.forEach(([x, y], i) => {
      const [hx, hy] = kinds[choice[i]];
      if (hx + hy === 4) { four.set(x, (four.get(x) ?? 0) + 1); four.set(y, (four.get(y) ?? 0) + 1); }
      home.set(x, (home.get(x) ?? 0) + hx); home.set(y, (home.get(y) ?? 0) + hy);
      c += 10 * (Math.max(0, (known.get(key(x, y)) ?? 0) - hx) + Math.max(0, (known.get(key(y, x)) ?? 0) - hy));
    });
    // Outside the flexible pairs every team hosts 15 + 8 = 23 games, so 18 of its 41 come from them.
    for (const a of abbrs) c += Math.abs((four.get(a) ?? 0) - 6) + Math.abs((home.get(a) ?? 0) - 18);
    return c;
  };
  let now = cost();
  for (let step = 0; step < 400000 && now > 0; step++) {
    const i = Math.floor(rng.next() * flexible.length), was = choice[i];
    choice[i] = (was + 1 + Math.floor(rng.next() * 2)) % 3;
    const next = cost();
    if (next <= now || rng.next() < 0.002) now = next;
    else choice[i] = was;
  }
  if (now > 0) throw new Error(`the stand-in schedule could not meet the formula (cost ${now})`);
  flexible.forEach(([x, y], i) => { host.set(key(x, y), kinds[choice[i]][0]); host.set(key(y, x), kinds[choice[i]][1]); });
  for (const [k, n] of known) if ((host.get(k) ?? 0) < n) throw new Error(`the file already has ${n} games ${k}, more than the formula's ${host.get(k)}`);

  // The games left, spread over the days after the file's last: each team's own games in a shuffled order, each game
  // on the day halfway between where its two teams' orders put it.
  const after = model.data.games.reduce((m, g) => (dayKey(g.t) > m ? dayKey(g.t) : m), today);
  const span = (Date.parse(SEASON_END) - Date.parse(after)) / 86_400_000;
  const games: { home: Abbr; away: Abbr; order: number }[] = [];
  for (const [k, n] of host) {
    const [h, a] = k.split(">");
    for (let j = (known.get(k) ?? 0); j < n; j++) games.push({ home: h, away: a, order: rng.next() });
  }
  games.sort((x, y) => x.order - y.order);
  const slot = new Map<string, number>();
  const count = new Map<Abbr, number>();
  for (const g of games) for (const a of [g.home, g.away]) count.set(a, (count.get(a) ?? 0) + 1);
  const seen = new Map<Abbr, number>();
  const at = (a: Abbr) => { const k = seen.get(a) ?? 0; seen.set(a, k + 1); return (k + 0.5) / count.get(a)!; };
  return games.map((g, i) => {
    const f = (at(g.home) + at(g.away)) / 2;
    const day = addDays(after, 1 + Math.min(span - 1, Math.floor(f * span)));
    slot.set(day, (slot.get(day) ?? 0) + 1);
    return { id: `standin-${i}`, day, home: g.home, away: g.away, edge: model.home, synthetic: true };
  });
}

const extra = standIn(model, 20261101);

// ---- Players back from injury --------------------------------------------------------------------------------------

const SCALE = ELO_PER_SIGMA / PARAMS.sigma;
const fit: Fit = fitModel(model.data, inputs.get(current)!).at(-1)!.after;
const plain = modelInputs(files.map((f) => (f.data.season === current ? { ...f, injuries: undefined } : f))).get(current)!;
const usual = shownLineups(model.data, plain.players!.rotation).after.get(today)!;
const archive = parseArchive(read(`injuries/${current}.json`), current);
const report = archive.days[Object.keys(archive.days).sort().at(-1)!];

/** A player's minutes per game for `abbr` this season, or last season's anywhere, from the box scores. */
function minutesOf(athlete: number, abbr: Abbr): number {
  for (const [id, team] of [[current, abbr], [last, null]] as const) {
    const box = files.find((f) => f.data.season === id)!.box as { games: Record<string, Record<Abbr, [number, number][]>> };
    let min = 0, games = 0;
    for (const sides of Object.values(box.games)) for (const [t, lines] of Object.entries(sides)) {
      if (team && t !== team) continue;
      for (const l of lines) if (l[0] === athlete) { min += l[1]; games++; }
    }
    if (games) return min / games;
  }
  return 0;
}

type Return = { athlete: number; name: string; date: string; minutes: number };
const names = read("players.json") as Record<string, string>;
const returns: Record<Abbr, Return[]> = {};
for (const e of report.injuries) {
  if (e.status !== "Out" || !e.returnDate || e.returnDate <= addDays(today, LONG_ABSENCE)) continue;
  if (e.returnDate > SEASON_END) continue;
  (returns[e.team] ??= []).push({ athlete: e.athlete, name: names[e.athlete] ?? "", date: e.returnDate, minutes: minutesOf(e.athlete, e.team) });
}
const rated = (lineup: Lineup, abbr: Abbr) => START + (fit.r[abbr] + playerPart(fit, lineup)) * SCALE;

/** The usual rotation without `away`, with `back` added at their minutes when it lacks them. */
function lineupWith(abbr: Abbr, back: Return[], away: Set<number>): Lineup {
  const players = (usual[abbr] ?? []).filter((s) => !away.has(s.athlete)).map((s) => ({ athlete: s.athlete, min: s.share * 48 }));
  for (const b of back) if (!players.some((p) => p.athlete === b.athlete) && b.minutes > 0) players.push({ athlete: b.athlete, min: b.minutes });
  return scaled(players);
}

const withReturns: Outlook = shownOutlook(model, today);
const returnRows: { abbr: Abbr; players: Return[]; now: number; full: number }[] = [];
for (const [abbr, list] of Object.entries(returns)) {
  const sorted = [...list].sort((x, y) => x.date.localeCompare(y.date));
  const steps = [{ day: today, rating: model.r[abbr] }];
  for (let k = 0; k < sorted.length; k++) {
    const back = sorted.slice(0, k + 1);
    const still = new Set(sorted.slice(k + 1).map((r) => r.athlete));
    steps.push({ day: sorted[k].date, rating: rated(lineupWith(abbr, back, still), abbr) });
  }
  withReturns[abbr] = steps;
  returnRows.push({ abbr, players: sorted, now: model.r[abbr], full: steps.at(-1)!.rating });
}

// ---- The projection ------------------------------------------------------------------------------------------------

const weekAhead = model.upcoming.filter((g) => stage(g.note).standings && dayKey(g.t) > today && dayKey(g.t) <= addDays(today, 7));
const setup = setupAt(model, today, DRIFT, { outlook: withReturns, extra });
const games82 = new Map<Abbr, number>();
for (const g of [...setup.played, ...setup.fixtures]) for (const a of [g.home, g.away]) games82.set(a, (games82.get(a) ?? 0) + 1);
if ([...games82.values()].some((n) => n !== 82)) throw new Error(`a team has ${[...games82].find(([, n]) => n !== 82)} games`);

console.error(`projecting ${current} from ${today}: ${setup.played.length} played, ${setup.fixtures.length} to play (${extra.length} stand-ins), ${RUNS} runs`);
const p = simulate(setup, RUNS, 20261101, weekAhead.map((g) => g.id));
const without = simulate(setupAt(model, today, DRIFT, { extra }), RUNS, 20261101);

const pct = (n: number, runs: number) => Math.round((1000 * n) / runs) / 10;
const record = (abbr: Abbr) => {
  let w = 0, l = 0;
  for (const g of setup.played) { if (g.home === abbr || g.away === abbr) { if ((g.home === abbr) === g.homeWon) w++; else l++; } }
  return [w, l];
};

/** What a league-average team would win of a schedule, in Elo: the mean of its chances against each opponent where they meet. */
const mean = model.abbrs.reduce((s, a) => s + model.r[a], 0) / model.abbrs.length;
const ratingOn = (o: Outlook, abbr: Abbr, day: string) => o[abbr].filter((s) => s.day <= day).at(-1)?.rating ?? o[abbr][0].rating;
function difficulty(abbr: Abbr, games: { home: Abbr; away: Abbr; day: string }[], o: Outlook) {
  const mine = games.filter((g) => g.home === abbr || g.away === abbr);
  const won = mine.reduce((s, g) => {
    const home = g.home === abbr;
    const opp = ratingOn(o, home ? g.away : g.home, g.day);
    return s + phi((mean - opp + (home ? model.home : -model.home)) / ELO_PER_SIGMA);
  }, 0);
  return { games: mine.length, avgWin: won / mine.length };
}
const playedGames = model.results.filter((r) => stage(r.game.note).standings).map((r) => ({ home: r.game.home, away: r.game.away, day: r.day }));
const nowOutlook = shownOutlook(model, today);

const teams = model.abbrs.map((abbr) => {
  const o = p.teams[abbr], b = without.teams[abbr];
  const t = model.data.teams[abbr];
  return {
    abbr, name: t.name, short: t.short, color: t.color, alt: t.alternateColor,
    conf: conferenceOf(abbr), div: divisionOf(abbr),
    record: record(abbr), rating: Math.round(model.r[abbr]), full: Math.round(withReturns[abbr].at(-1)!.rating), seedRating: Math.round(model.series[0].r[abbr]),
    preseasonTotal: (read(`preseason/${current}.json`) as { totals: Record<Abbr, number> }).totals[abbr],
    wins: { mean: Math.round(meanWins(o.wins) * 10) / 10, p10: winsAt(o.wins, 0.1), p25: winsAt(o.wins, 0.25), p50: winsAt(o.wins, 0.5), p75: winsAt(o.wins, 0.75), p90: winsAt(o.wins, 0.9), hist: o.wins.map((c) => pct(c, RUNS)) },
    seed: o.seed.map((c) => pct(c, RUNS)),
    playIn: pct(o.playIn, RUNS), playoffs: pct(o.playoffs, RUNS), round2: pct(o.round2, RUNS), confFinals: pct(o.confFinals, RUNS), finals: pct(o.finals, RUNS), title: pct(o.title, RUNS),
    top6: pct(o.seed.slice(0, 6).reduce((s, x) => s + x, 0), RUNS),
    pick: o.pick.map((c) => pct(c, RUNS)),
    lottery: { first: pct(o.pick[0], RUNS), top4: pct(o.pick.slice(0, 4).reduce((s, x) => s + x, 0), RUNS), inLottery: pct(o.pick.reduce((s, x) => s + x, 0), RUNS) },
    withoutReturns: { playoffs: pct(b.playoffs, RUNS), title: pct(b.title, RUNS), wins: Math.round(meanWins(b.wins) * 10) / 10 },
    schedule: { played: difficulty(abbr, playedGames, nowOutlook), ahead: difficulty(abbr, setup.fixtures, withReturns) },
  };
});

const swingRows = stakes(p, model.abbrs);
const titleRows = stakes(p, model.abbrs, "title");
const leverage = weekAhead.map((g) => {
  const rows = swingRows.get(g.id)!;
  const moved = rows.map((r) => ({ abbr: r.abbr, ifHome: pct(r.ifHome * RUNS, RUNS), ifAway: pct(r.ifAway * RUNS, RUNS), swing: Math.round(1000 * (r.ifHome - r.ifAway)) / 10 }))
    .filter((r) => Math.abs(r.swing) >= 0.5).sort((x, y) => Math.abs(y.swing) - Math.abs(x.swing));
  const total = rows.reduce((s, r) => s + Math.abs(r.ifHome - r.ifAway), 0) * 50;
  const t = titleRows.get(g.id)!;
  const titleTotal = t.reduce((s, r) => s + Math.abs(r.ifHome - r.ifAway), 0) * 50;
  const pHome = phi((ratingOn(withReturns, g.home, dayKey(g.t)) - ratingOn(withReturns, g.away, dayKey(g.t)) + (g.neutral ? 0 : model.home) + (model.b2b[g.id] ?? 0)) / ELO_PER_SIGMA);
  return { id: g.id, t: g.t, day: dayKey(g.t), home: g.home, away: g.away, pHome: Math.round(1000 * pHome) / 10, stake: Math.round(total * 10) / 10, titleStake: Math.round(titleTotal * 10) / 10, moved: moved.slice(0, 6) };
}).sort((x, y) => y.stake - x.stake);

const top = (m: Map<string, number>, k: number) => [...m].sort((x, y) => y[1] - x[1]).slice(0, k).map(([pair, n]) => ({ pair, p: pct(n, RUNS) }));
const cutLines = Object.fromEntries((["East", "West"] as const).map((c) => [c, Object.fromEntries(([6, 8, 10] as const).map((k) => {
  const w = p.cut[c][k];
  return [k, { p10: winsAt(w, 0.1), p50: winsAt(w, 0.5), p90: winsAt(w, 0.9), hist: w.map((x) => pct(x, RUNS)) }];
}))]));

/** Each team's odds at the end of every day of a season, from that day's shown ratings. */
function history(m: Season, standIns: Fixture[], runs: number) {
  const days = m.series.slice(0).map((s) => s.day);
  const rows = days.map((day, k) => {
    // The eve of opening night stands before every game.
    const q = simulate(setupAt(m, day, DRIFT, { extra: standIns }), runs, 7 + k);
    return { day, odds: Object.fromEntries(m.abbrs.map((a) => [a, { po: pct(q.teams[a].playoffs, runs), title: pct(q.teams[a].title, runs), wins: Math.round(meanWins(q.teams[a].wins) * 10) / 10 }])) };
  });
  return rows;
}
const t0 = Date.now();
const lastHistory = history(lastModel, [], HISTORY_RUNS);
console.error(`${last} history: ${lastHistory.length} days in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const currentHistory = history(model, extra, HISTORY_RUNS * 2);

const lastTeams = lastModel.abbrs.map((a) => ({ abbr: a, short: lastModel.data.teams[a].short, color: model.data.teams[a]?.color ?? lastModel.data.teams[a].color, conf: conferenceOf(a) }));
const champion = (() => {
  const finals = lastModel.results.filter((r) => /^NBA Finals/.test(r.game.note ?? ""));
  const wins = new Map<Abbr, number>();
  for (const r of finals) { const w = r.game.hs! > r.game.as! ? r.game.home : r.game.away; wins.set(w, (wins.get(w) ?? 0) + 1); }
  return [...wins].find(([, n]) => n === 4)?.[0] ?? null;
})();

writeFileSync(out, JSON.stringify({
  season: current, today, runs: RUNS, drift: DRIFT, home: Math.round(model.home), standIns: extra.length, fileThrough: model.data.games.reduce((m, g) => (dayKey(g.t) > m ? dayKey(g.t) : m), today),
  teams, leverage, cutLines, firstRound: top(p.firstRound, 24), finals: top(p.finalsPairs, 12), returns: returnRows.map((r) => ({ ...r, now: Math.round(r.now), full: Math.round(r.full) })),
  history: { current: currentHistory, last: { season: last, champion, teams: lastTeams, days: lastHistory } },
}));
console.error(`wrote ${out}`);
