// The rest of a season, played out many times: every standings game still to come drawn from the model's chances,
// the conference tables seeded with the league's tiebreakers, the play-in and the four best-of-seven rounds after
// it, and the draft lottery for the fourteen teams left out. What a team's chance of the playoffs or the title is
// here is the share of those seasons it happened in.
//
// A game is drawn as the site prices one: the home side wins with Phi((home rating - away rating + edge) /
// ELO_PER_SIGMA), with `edge` the home court and the back-to-back in Elo points. On its own that treats every game as
// independent, and a team's rating as exactly right for the rest of the season. It is not: the rating is an estimate,
// and a team gets better or worse as it goes. So each simulated season also moves each team by `drift`, a shift
// drawn once for the season (`tau`, Elo points) plus a walk that grows with the days ahead (`walk`, Elo points per
// square root of 100 days). Both carry into its playoffs. scripts/backtest-projections.ts fits them on past seasons.
import { dayKey, ELO_PER_SIGMA, phi, type Abbr, type Game, type Season } from "./elo.ts";
import { conferenceOf, stage, type Conference } from "./teams.ts";

/** The six divisions under ESPN's abbreviations; a tiebreaker reads them. Stable since 2004-05. */
export const DIVISIONS: Record<string, readonly Abbr[]> = {
  Atlantic: ["BOS", "BKN", "NY", "PHI", "TOR"],
  Central: ["CHI", "CLE", "DET", "IND", "MIL"],
  Southeast: ["ATL", "CHA", "MIA", "ORL", "WSH"],
  Northwest: ["DEN", "MIN", "OKC", "POR", "UTAH"],
  Pacific: ["GS", "LAC", "LAL", "PHX", "SAC"],
  Southwest: ["DAL", "HOU", "MEM", "NO", "SA"],
};
export const divisionOf = (abbr: Abbr): string | null => Object.keys(DIVISIONS).find((d) => DIVISIONS[d].includes(abbr)) ?? null;

/** How a season fills its playoff field: seeds 1 to 8 outright, or 1 to 6 and a play-in for 7 and 8 (2020-21 on). */
export type Format = "top-8" | "play-in";

/** A standings game still to play: its day, its sides, and the home side's edge in Elo points (home court and back-to-back). */
export type Fixture = { id: string; day: string; home: Abbr; away: Abbr; edge: number; synthetic?: boolean };
/** A standings game already played. */
export type Played = { home: Abbr; away: Abbr; homeWon: boolean };

/**
 * Each team's rating for the games ahead, in Elo points: `steps` from a day on, in day order, the first from the
 * season's next day. A team with players out for weeks steps up as they come back.
 */
export type Outlook = Record<Abbr, { day: string; rating: number }[]>;

/** What to play out: the season so far, the games ahead, each team's ratings for them, and the drift. */
export type Setup = {
  abbrs: Abbr[];
  played: Played[];
  fixtures: Fixture[];
  outlook: Outlook;
  /** The home edge in Elo points for the playoffs, where no game is on a second night. */
  home: number;
  format: Format;
  /** The day the projection stands on: the walk counts days ahead from it. */
  today: string;
  drift: Drift;
};
/**
 * `tau` and `walk` in Elo points; `playoff`, how much of a team's drift carries into its play-in and playoff games
 * (1 when left out).
 */
export type Drift = { tau: number; walk: number; playoff?: number };

/** What happened to each team across the simulated seasons, as counts out of `runs`. */
export type TeamOdds = {
  /** Final wins: wins[k] is how many seasons the team finished on k wins. */
  wins: number[];
  /** Seed in its conference, 1 to 15: seed[s - 1]. */
  seed: number[];
  playIn: number;
  playoffs: number;
  /** Won its first-round series, its conference semifinal, its conference final, the Finals. */
  round2: number;
  confFinals: number;
  finals: number;
  title: number;
  /** Pick in the draft lottery's order, 1 to 14, when left out of the playoffs: pick[k - 1]. */
  pick: number[];
};
export type Projection = {
  runs: number;
  teams: Record<Abbr, TeamOdds>;
  /** First-round series and Finals matchups, "BOS-NY" with the higher seed (Finals: better record) first, by count. */
  firstRound: Map<string, number>;
  finalsPairs: Map<string, number>;
  /** Per conference, how many wins the 6th, 8th and 10th seeds finished on: cut[conf][k][w]. */
  cut: Record<Conference, Record<6 | 8 | 10, number[]>>;
  /** For each fixture in `watch`, per run, whether the home side won; and per run per team, whether it made the playoffs. */
  watched?: { ids: string[]; homeWon: Uint8Array[]; made: Uint8Array; title: Uint8Array };
};

/** A small, fast, seedable generator (Chris Doty-Humphrey's sfc32), so every projection reads the same twice. */
export function generator(seed: number) {
  let a = 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = seed >>> 0;
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  let spare: number | null = null;
  const normal = () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0;
    while (u === 0) u = next();
    const r = Math.sqrt(-2 * Math.log(u)), t = 2 * Math.PI * next();
    spare = r * Math.sin(t);
    return r * Math.cos(t);
  };
  return { next, normal };
}

/** The lottery's chances at the first pick by pre-lottery slot, in combinations of 1000, since 2019. Four picks are drawn. */
export const LOTTERY = [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5];

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.max(0, (Date.parse(to) - Date.parse(from)) / DAY_MS);

/** A best-of-seven between `hi`, with home court, and `lo`, home in games 1, 2, 5 and 7: whether `hi` wins. */
function series(rHi: number, rLo: number, home: number, u: () => number): boolean {
  const atHi = phi((rHi - rLo + home) / ELO_PER_SIGMA);
  const atLo = phi((rHi - rLo - home) / ELO_PER_SIGMA);
  let w = 0, l = 0;
  for (let g = 0; w < 4 && l < 4; g++) {
    const p = g === 0 || g === 1 || g === 4 || g === 6 ? atHi : atLo;
    if (u() < p) w++;
    else l++;
  }
  return w === 4;
}

/** The chance `hi`, with home court, wins a best-of-seven against `lo`, worked out exactly. */
export function seriesChance(rHi: number, rLo: number, home: number): number {
  const atHi = phi((rHi - rLo + home) / ELO_PER_SIGMA);
  const atLo = phi((rHi - rLo - home) / ELO_PER_SIGMA);
  const host = [atHi, atHi, atLo, atLo, atHi, atLo, atHi];
  let ways = new Map<string, number>([["0-0", 1]]);
  let won = 0;
  for (let g = 0; g < 7; g++) {
    const next = new Map<string, number>();
    for (const [k, p] of ways) {
      const [w, l] = k.split("-").map(Number);
      const add = (key: string, q: number) => next.set(key, (next.get(key) ?? 0) + q);
      if (w + 1 === 4) won += p * host[g];
      else add(`${w + 1}-${l}`, p * host[g]);
      if (l + 1 < 4) add(`${w}-${l + 1}`, p * (1 - host[g]));
    }
    ways = next;
  }
  return won;
}

type Tables = { wins: Int32Array; games: Int32Array; h2h: Int32Array; confW: Int32Array; confG: Int32Array; divW: Int32Array; divG: Int32Array };

/**
 * Seeds one conference's teams by win share, ties broken as the league breaks them, in order: a division leader
 * over a team that is not, head-to-head record among the tied teams, division record when they share a division,
 * conference record, then a draw. The league's later steps (records against playoff teams, point differential) are
 * left to the draw, and a division's leader is its best record with the same steps.
 */
function seedConference(teams: number[], t: Tables, n: number, u: () => number, leaders: ReadonlySet<number>, division: readonly number[]): number[] {
  const pct = (i: number) => (t.games[i] ? t.wins[i] / t.games[i] : 0.5);
  const ratio = (w: number, g: number) => (g ? w / g : 0.5);
  const draw = new Map(teams.map((i) => [i, u()]));
  const order = [...teams].sort((x, y) => pct(y) - pct(x));
  const out: number[] = [];
  for (let s = 0; s < order.length; ) {
    let e = s + 1;
    while (e < order.length && pct(order[e]) === pct(order[s])) e++;
    out.push(...breakTie(order.slice(s, e)));
    s = e;
  }
  return out;

  function breakTie(tied: number[]): number[] {
    if (tied.length === 1) return tied;
    const h2h = (i: number) => {
      let w = 0, g = 0;
      for (const j of tied) if (j !== i) { w += t.h2h[i * n + j]; g += t.h2h[i * n + j] + t.h2h[j * n + i]; }
      return ratio(w, g);
    };
    const sameDivision = tied.every((i) => division[i] === division[tied[0]]);
    const keys: ((i: number) => number)[] = [];
    if (!sameDivision) keys.push((i) => (leaders.has(i) ? 1 : 0));
    keys.push(h2h);
    if (sameDivision) keys.push((i) => ratio(t.divW[i], t.divG[i]));
    keys.push((i) => ratio(t.confW[i], t.confG[i]));
    for (const key of keys) {
      const best = Math.max(...tied.map(key));
      const top = tied.filter((i) => key(i) === best);
      // A step that separates some of the tied teams puts the best of them first and starts again with the rest.
      if (top.length < tied.length) return [...breakTie(top), ...breakTie(tied.filter((i) => key(i) !== best))];
    }
    return [...tied].sort((x, y) => draw.get(y)! - draw.get(x)!);
  }
}

/** Plays out the rest of the season `runs` times. `watch` names fixtures whose results are kept beside each run's playoff field. */
export function simulate(setup: Setup, runs: number, seed = 20261101, watch: string[] = []): Projection {
  const { abbrs, fixtures, outlook, home, format } = setup;
  const n = abbrs.length;
  const at = new Map(abbrs.map((a, i) => [a, i]));
  const conf = abbrs.map((a) => conferenceOf(a));
  const div = abbrs.map((a) => divisionOf(a));
  const divisionIndex = div.map((d) => Object.keys(DIVISIONS).indexOf(d ?? ""));
  const confTeams = (["East", "West"] as const).map((c) => abbrs.map((_, i) => i).filter((i) => conf[i] === c));
  const rng = generator(seed);
  const u = rng.next;

  // The season so far, copied into each run.
  const base: Tables = { wins: new Int32Array(n), games: new Int32Array(n), h2h: new Int32Array(n * n), confW: new Int32Array(n), confG: new Int32Array(n), divW: new Int32Array(n), divG: new Int32Array(n) };
  const record = (t: Tables, w: number, l: number) => {
    t.wins[w]++; t.games[w]++; t.games[l]++; t.h2h[w * n + l]++;
    if (conf[w] === conf[l]) { t.confW[w]++; t.confG[w]++; t.confG[l]++; }
    if (div[w] === div[l]) { t.divW[w]++; t.divG[w]++; t.divG[l]++; }
  };
  for (const g of setup.played) {
    const h = at.get(g.home)!, a = at.get(g.away)!;
    record(base, g.homeWon ? h : a, g.homeWon ? a : h);
  }

  // Each fixture's sides and base ratings, read once; the walk reads its days ahead.
  const ratingOn = (abbr: Abbr, day: string) => {
    const steps = outlook[abbr];
    let r = steps[0].rating;
    for (const s of steps) if (s.day <= day) r = s.rating;
    return r;
  };
  const fx = fixtures.map((f) => ({ h: at.get(f.home)!, a: at.get(f.away)!, rh: ratingOn(f.home, f.day), ra: ratingOn(f.away, f.day), edge: f.edge, root: Math.sqrt(daysBetween(setup.today, f.day) / 100) }));
  const lastDay = fixtures.reduce((m, f) => (f.day > m ? f.day : m), setup.today);
  const endRating = abbrs.map((a) => ratingOn(a, lastDay));
  const endRoot = Math.sqrt(daysBetween(setup.today, lastDay) / 100);
  const maxGames = Math.max(...abbrs.map((_, i) => base.games[i])) + 82 + 10;

  const blank = (): TeamOdds => ({ wins: new Array(maxGames).fill(0), seed: new Array(15).fill(0), playIn: 0, playoffs: 0, round2: 0, confFinals: 0, finals: 0, title: 0, pick: new Array(14).fill(0) });
  const odds = abbrs.map(blank);
  const firstRound = new Map<string, number>();
  const finalsPairs = new Map<string, number>();
  const cut = Object.fromEntries((["East", "West"] as const).map((c) => [c, { 6: new Array(maxGames).fill(0), 8: new Array(maxGames).fill(0), 10: new Array(maxGames).fill(0) }])) as Projection["cut"];
  const watchIdx = watch.map((id) => fixtures.findIndex((f) => f.id === id));
  const watched = watch.length ? { ids: watch, homeWon: watch.map(() => new Uint8Array(runs)), made: new Uint8Array(runs * n), title: new Uint8Array(runs * n) } : undefined;

  const t: Tables = { wins: new Int32Array(n), games: new Int32Array(n), h2h: new Int32Array(n * n), confW: new Int32Array(n), confG: new Int32Array(n), divW: new Int32Array(n), divG: new Int32Array(n) };
  const shift = new Float64Array(n), walkStep = new Float64Array(n);
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (let run = 0; run < runs; run++) {
    for (const k of Object.keys(t) as (keyof Tables)[]) t[k].set(base[k]);
    for (let i = 0; i < n; i++) { shift[i] = setup.drift.tau * rng.normal(); walkStep[i] = rng.normal(); }
    // The walk is drawn as one shape per team, scaled by the square root of the days ahead: a team's drift a month
    // out and four months out are the same direction, the later larger, which keeps a walk's correlation over a
    // season without drawing every day.
    const walk = setup.drift.walk;
    for (let i = 0; i < n; i++) walkStep[i] *= walk;
    for (let k = 0; k < fx.length; k++) {
      const f = fx[k];
      const gap = f.rh - f.ra + f.edge + shift[f.h] - shift[f.a] + (walkStep[f.h] - walkStep[f.a]) * f.root;
      const homeWon = u() < phi(gap / ELO_PER_SIGMA);
      record(t, homeWon ? f.h : f.a, homeWon ? f.a : f.h);
      if (watched) { const w = watchIdx.indexOf(k); if (w >= 0) watched.homeWon[w][run] = homeWon ? 1 : 0; }
    }
    for (let i = 0; i < n; i++) odds[i].wins[t.wins[i]]++;
    const carry = setup.drift.playoff ?? 1;
    const strength = abbrs.map((_, i) => endRating[i] + carry * (shift[i] + walkStep[i] * endRoot));

    // Division leaders, then each conference's seeds.
    const leaders = new Set<number>();
    for (const d of Object.keys(DIVISIONS)) {
      const members = abbrs.map((_, i) => i).filter((i) => div[i] === d);
      if (members.length) leaders.add(seedConference(members, t, n, u, new Set(), divisionIndex)[0]);
    }
    const field: number[][] = [];
    const out: number[] = [];
    for (let c = 0; c < 2; c++) {
      const seeds = seedConference(confTeams[c], t, n, u, leaders, divisionIndex);
      seeds.forEach((i, s) => odds[i].seed[s]++);
      const confName = c === 0 ? "East" : "West";
      for (const k of [6, 8, 10] as const) if (seeds[k - 1] !== undefined) cut[confName][k][t.wins[seeds[k - 1]]]++;
      let eight: number[];
      if (format === "play-in") {
        const [s7, s8, s9, s10] = seeds.slice(6, 10);
        for (const i of [s7, s8, s9, s10]) odds[i].playIn++;
        const game = (homeI: number, awayI: number) => u() < phi((strength[homeI] - strength[awayI] + home) / ELO_PER_SIGMA);
        const aWon = game(s7, s8);
        const seven = aWon ? s7 : s8, loserA = aWon ? s8 : s7;
        const bWinner = game(s9, s10) ? s9 : s10;
        const eighth = game(loserA, bWinner) ? loserA : bWinner;
        eight = [...seeds.slice(0, 6), seven, eighth];
        out.push(...seeds.filter((i) => !eight.includes(i)));
      } else {
        eight = seeds.slice(0, 8);
        out.push(...seeds.slice(8));
      }
      for (const i of eight) odds[i].playoffs++;
      // 1 v 8 and 4 v 5 meet in the semifinal, as do 2 v 7 and 3 v 6.
      const r1 = [[0, 7], [3, 4], [1, 6], [2, 5]].map(([x, y]) => {
        inc(firstRound, `${abbrs[eight[x]]}-${abbrs[eight[y]]}`);
        return series(strength[eight[x]], strength[eight[y]], home, u) ? { i: eight[x], s: x } : { i: eight[y], s: y };
      });
      for (const w of r1) odds[w.i].round2++;
      const semi = [[r1[0], r1[1]], [r1[2], r1[3]]].map(([x, y]) => {
        const [hi, lo] = x.s < y.s ? [x, y] : [y, x];
        return series(strength[hi.i], strength[lo.i], home, u) ? hi : lo;
      });
      for (const w of semi) odds[w.i].confFinals++;
      const [hi, lo] = semi[0].s < semi[1].s ? [semi[0], semi[1]] : [semi[1], semi[0]];
      const champ = series(strength[hi.i], strength[lo.i], home, u) ? hi : lo;
      odds[champ.i].finals++;
      field.push([champ.i]);
      if (watched) for (const i of eight) watched.made[run * n + i] = 1;
    }
    // The Finals: home court to the better record, then a draw.
    const [e, w] = [field[0][0], field[1][0]];
    const pe = t.wins[e] / t.games[e], pw = t.wins[w] / t.games[w];
    const [fHi, fLo] = pe > pw || (pe === pw && u() < 0.5) ? [e, w] : [w, e];
    const winner = series(strength[fHi], strength[fLo], home, u) ? fHi : fLo;
    odds[winner].title++;
    if (watched) watched.title[run * n + winner] = 1;
    inc(finalsPairs, `${abbrs[fHi]}-${abbrs[fLo]}`);

    // The lottery: the fourteen teams left out, worst record first, ties drawn; four picks drawn by combinations.
    const draw = new Map(out.map((i) => [i, u()]));
    const slots = [...out].sort((x, y) => t.wins[x] / t.games[x] - t.wins[y] / t.games[y] || draw.get(x)! - draw.get(y)!);
    const left = slots.map((i, s) => ({ i, c: LOTTERY[s] ?? 0 }));
    const picked: number[] = [];
    for (let p = 0; p < 4 && left.length; p++) {
      const total = left.reduce((s, x) => s + x.c, 0);
      let r = u() * total, k = 0;
      while (k < left.length - 1 && r >= left[k].c) { r -= left[k].c; k++; }
      picked.push(left[k].i);
      left.splice(k, 1);
    }
    [...picked, ...left.map((x) => x.i)].forEach((i, p) => odds[i].pick[p]++);
  }

  return {
    runs,
    teams: Object.fromEntries(abbrs.map((a, i) => [a, odds[i]])),
    firstRound,
    finalsPairs,
    cut,
    watched,
  };
}

/** A count's share of the runs. */
export const share = (count: number, runs: number) => count / runs;

/** The wins at quantile `q` of a team's final wins. */
export function winsAt(wins: readonly number[], q: number): number {
  const total = wins.reduce((s, x) => s + x, 0);
  let acc = 0;
  for (let k = 0; k < wins.length; k++) {
    acc += wins[k];
    if (acc >= q * total) return k;
  }
  return wins.length - 1;
}

export const meanWins = (wins: readonly number[]) => wins.reduce((s, x, k) => s + x * k, 0) / wins.reduce((s, x) => s + x, 0);

/**
 * How much one game moves each team's chances: the share of runs a team made the playoffs (or won the title) when
 * the home side won the watched game, less when it lost. Read from the same runs, so it carries their noise.
 */
export function stakes(p: Projection, abbrs: Abbr[], what: "made" | "title" = "made"): Map<string, { abbr: Abbr; ifHome: number; ifAway: number }[]> {
  const w = p.watched;
  if (!w) return new Map();
  const n = abbrs.length;
  const flags = what === "made" ? w.made : w.title;
  return new Map(w.ids.map((id, k) => {
    const homeWon = w.homeWon[k];
    let hw = 0;
    for (let r = 0; r < p.runs; r++) hw += homeWon[r];
    const rows = abbrs.map((abbr, i) => {
      let a = 0, b = 0;
      for (let r = 0; r < p.runs; r++) if (flags[r * n + i]) { if (homeWon[r]) a++; else b++; }
      return { abbr, ifHome: hw ? a / hw : 0, ifAway: p.runs - hw ? b / (p.runs - hw) : 0 };
    });
    return [id, rows];
  }));
}

/** How a season filled its playoff field: the play-in from 2020-21 on. */
export const formatOf = (season: string): Format => (season >= "2020-21" ? "play-in" : "top-8");

/** Each team's rating at the end of `day` (or the latest day before it), the shown rating, as one step. */
export function shownOutlook(model: Season, day: string): Outlook {
  const snap = [...model.series].reverse().find((s) => s.day <= day) ?? model.series[0];
  const r = snap?.r ?? model.r;
  return Object.fromEntries(model.abbrs.map((a) => [a, [{ day, rating: r[a] }]]));
}

/**
 * The season as it stood at the end of `day`: the standings games final by then as played, and every later
 * standings game in the file, played or not, as a fixture. A finished season's later games are the real schedule.
 */
export function setupAt(model: Season, day: string, drift: Drift, opts: { outlook?: Outlook; extra?: Fixture[]; format?: Format } = {}): Setup {
  const counts = (g: Game) => stage(g.note).standings;
  const played = model.results.filter((r) => r.day <= day && counts(r.game)).map((r) => ({ home: r.game.home, away: r.game.away, homeWon: r.game.hs! > r.game.as! }));
  const later = [...model.results.filter((r) => r.day > day).map((r) => r.game), ...model.upcoming.filter((g) => dayKey(g.t) > day)].filter(counts);
  const fixtures: Fixture[] = later.map((g) => ({ id: g.id, day: dayKey(g.t), home: g.home, away: g.away, edge: (g.neutral ? 0 : model.home) + (model.b2b[g.id] ?? 0) }));
  return {
    abbrs: model.abbrs,
    played,
    fixtures: [...fixtures, ...(opts.extra ?? [])].sort((x, y) => x.day.localeCompare(y.day) || x.id.localeCompare(y.id)),
    outlook: opts.outlook ?? shownOutlook(model, day),
    home: model.home,
    format: opts.format ?? formatOf(model.data.season),
    today: day,
    drift,
  };
}
