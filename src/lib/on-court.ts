// The on-court rating (GLOSSARY.md), version 5's addition to each player's value: how his team does on the
// scoreboard while he is on the floor, adjusted for the teammates and opponents out there with him. It is a ridge
// regression on every stint so far (src/lib/stints.ts), older stints counting less, refitted every `refitEvery` game
// days and walked forward through the seasons, so a rating never reads a later game. The fit is the version 5
// prototype's (branch prototype/model-v5, scripts/research/pbp2/apm2.py) with three-point luck taken out.
import { finalDays, type SeasonData } from "./elo.ts";
import type { Athlete, BoxRatings } from "./players.ts";
import type { SeasonStints, Stint } from "./stints.ts";

/**
 * `ridge` is how many possessions of evidence pull each player toward his prior, `boxPrior` times his box rating;
 * `halfLife` is the days after which a stint counts half; `refitEvery` is the game days from one refit to the next,
 * a whole number, 1 for a refit after every game day.
 */
export type OnCourtRule = { ridge: number; halfLife: number; boxPrior: number; refitEvery: number };
/** A fixed pace: 100 possessions a side per 48 minutes. */
export const SECONDS_PER_POSSESSION = 28.8;
/** A season's games and its play-by-play record, undefined when none is on file. */
export type OnCourtSeason = { data: SeasonData; stints?: SeasonStints };
/** A walk through the seasons, oldest first. */
export type OnCourtWalk = { next(season: OnCourtSeason, box: BoxRatings): BoxRatings };

/** The home term's own ridge, small enough to leave it fitted by the stints alone. */
const HOME_RIDGE = 1e-3;
/** Decayed possessions a player needs on record to be fitted; anyone with fewer keeps a residual of 0. */
const ACTIVE = 0.5;
/** The relative residual the conjugate gradients stop at. */
const TOLERANCE = 1e-10;
const MAX_ITERATIONS = 2000;

const epochDay = (day: string) => Date.parse(day) / 86_400_000;
const usable = (s: Stint) => s[0].length === 5 && s[1].length === 5 && s[2] > 0;
/** Where row i starts in the packed lower triangle. */
const tri = (i: number) => (i * (i + 1)) / 2;
function grown<T extends Float64Array | Uint8Array>(v: T, make: (length: number) => T, length: number): T {
  const out = make(length);
  out.set(v);
  return out;
}

type Pending = { t: number; stint: Stint };
/** The season whose last game day may still need its refit, with the stints since its last refit. */
type Open = { box: BoxRatings; day: string; refitted: boolean; pending: Pending[]; seen: ReadonlySet<Athlete>; rate: number | null; threes: [attempted: number, made: number] };

/**
 * A fresh walk. Each `next()` takes the next season, oldest first, with its box ratings (src/lib/players.ts
 * boxRatings), and returns, in the box ratings' `athletes` order, each player's on-court rating minus `boxPrior`
 * times his box rating: the part of the on-court rating the box rating does not explain, 0 for a player with no
 * stint on record yet. `start` is the walk's latest refit before the season; `after.get(day)` is the season's latest
 * refit on or before `day`, or `start`'s values before its first, and the days between two refits share one array.
 *
 * The walk keeps one set of weighted normal equations over every stint so far: a column per player, in order of
 * first appearance, and one for the home side. A stint counts when both sides have five players and it lasted, in
 * a final game, on its game's day: its row is +1 for each home player and the home column, -1 for each away player,
 * its target 100 times the margin per possession, at SECONDS_PER_POSSESSION, and its weight its possessions times
 * 0.5^(days since / halfLife). Each side's points lose 3 times its threes made beyond the league's rate over the
 * seasons before, so a first season keeps its points as scored. A season refits after every `refitEvery`-th game
 * day, with that day's stints, and once more after its last game day, when that was not a refit already, as the walk
 * goes on to the next season: that refit is the next season's `start`, and the walk's last season never gets it.
 * A refit solves (A + ridge I) x = b + ridge * prior for the players with more than ACTIVE decayed possessions and
 * the home term, whose ridge is HOME_RIDGE and prior 0, by conjugate gradients from the refit before. A player's
 * prior is boxPrior times his box rating on the refit's day once he has a stint this season. Until then it stays
 * where his last refit of an earlier season left it, so whether he plays later in the season changes nothing.
 */
export function onCourtWalk(rule: OnCourtRule): OnCourtWalk {
  const every = rule.refitEvery;
  if (!Number.isInteger(every) || every < 1) throw new Error(`onCourtWalk: refitEvery is ${every}, not a whole number of game days`);
  const f = 0.5 ** (1 / rule.halfLife);
  const index = new Map<Athlete, number>();
  // Column 0 is the home term. The normal equations are a packed lower triangle, so a new player appends a row.
  let size = 1, cap = 1;
  let A = new Float64Array(64), b = new Float64Array(cap), x = new Float64Array(cap), prior = new Float64Array(cap);
  let on = new Uint8Array(cap), was = new Uint8Array(cap);
  let lastT: number | null = null;
  let latest: Float64Array | null = null;
  let open: Open | null = null;
  const league = { attempted: 0, made: 0 };
  const floats = (n: number) => new Float64Array(n), flags = (n: number) => new Uint8Array(n);

  const columnOf = (a: Athlete) => {
    const known = index.get(a);
    if (known !== undefined) return known;
    const j = size++;
    index.set(a, j);
    if (tri(size) > A.length) A = grown(A, floats, Math.max(2 * A.length, tri(size)));
    if (size > cap) {
      cap *= 2;
      [b, x, prior, on, was] = [grown(b, floats, cap), grown(x, floats, cap), grown(prior, floats, cap), grown(on, flags, cap), grown(was, flags, cap)];
    }
    return j;
  };

  const add = ({ t: day, stint }: Pending, t: number, rate: number | null) => {
    const [home, away, seconds, homePoints, awayPoints, homeAttempted, homeMade, awayAttempted, awayMade] = stint;
    const luck = rate === null ? 0 : 3 * (homeMade - rate * homeAttempted - (awayMade - rate * awayAttempted));
    const w = seconds / SECONDS_PER_POSSESSION;
    const y = (100 * (homePoints - awayPoints - luck)) / w;
    const weight = w * f ** (t - day);
    const cols = [0, ...home.map(columnOf), ...away.map(columnOf)];
    const sign = (p: number) => (p <= 5 ? 1 : -1);
    for (let p = 0; p < cols.length; p++) {
      b[cols[p]] += weight * sign(p) * y;
      for (let q = 0; q < cols.length; q++) if (cols[p] >= cols[q]) A[tri(cols[p]) + cols[q]] += weight * sign(p) * sign(q);
    }
  };

  const refit = (day: string, pending: readonly Pending[], seen: ReadonlySet<Athlete>, rate: number | null, box: BoxRatings) => {
    const t = epochDay(day);
    if (lastT !== null) {
      const decay = f ** (t - lastT);
      for (let k = 0, n = tri(size); k < n; k++) A[k] *= decay;
      for (let k = 0; k < size; k++) b[k] *= decay;
    }
    lastT = t;
    for (const p of pending) add(p, t, rate);

    const today = box.after.get(day);
    if (!today) throw new Error(`onCourtWalk: the box ratings have no ${day}`);
    box.athletes.forEach((a, j) => {
      const c = index.get(a);
      if (c !== undefined && seen.has(a)) prior[c] = rule.boxPrior * today[j];
    });
    const ridge = floats(size), rhs = floats(size);
    let bb = 0;
    for (let k = 0; k < size; k++) {
      on[k] = Number(k === 0 || A[tri(k) + k] > ACTIVE);
      ridge[k] = k === 0 ? HOME_RIDGE : rule.ridge;
      rhs[k] = on[k] ? b[k] + ridge[k] * prior[k] : 0;
      bb += rhs[k] * rhs[k];
      if (!on[k]) x[k] = 0;
      else if (k > 0 && !was[k]) x[k] = prior[k];
      was[k] = on[k];
    }

    // (A + ridge) v over the active columns. v is 0 on the rest, so their rows are skipped and their outputs unread.
    const matvec = (v: Float64Array, out: Float64Array) => {
      out.fill(0);
      for (let i = 0; i < size; i++) {
        if (!on[i]) continue;
        const row = tri(i), vi = v[i];
        let s = 0;
        for (let j = 0; j < i; j++) {
          const a = A[row + j];
          s += a * v[j];
          out[j] += a * vi;
        }
        out[i] += s + (A[row + i] + ridge[i]) * vi;
      }
    };
    const res = floats(size), z = floats(size), q = floats(size), Aq = floats(size);
    const precondition = (k: number) => (on[k] ? res[k] / (A[tri(k) + k] + ridge[k]) : 0);
    matvec(x, Aq);
    let rz = 0;
    for (let k = 0; k < size; k++) {
      res[k] = on[k] ? rhs[k] - Aq[k] : 0;
      z[k] = precondition(k);
      q[k] = z[k];
      rz += res[k] * z[k];
    }
    for (let it = 0; ; it++) {
      let rr = 0;
      for (let k = 0; k < size; k++) rr += res[k] * res[k];
      if (rr <= TOLERANCE ** 2 * bb) break;
      if (it === MAX_ITERATIONS) throw new Error(`onCourtWalk: the refit after ${day} did not converge`);
      matvec(q, Aq);
      let qa = 0;
      for (let k = 0; k < size; k++) if (on[k]) qa += q[k] * Aq[k];
      const alpha = rz / qa;
      let rz2 = 0;
      for (let k = 0; k < size; k++) {
        if (!on[k]) continue;
        x[k] += alpha * q[k];
        res[k] -= alpha * Aq[k];
        z[k] = precondition(k);
        rz2 += res[k] * z[k];
      }
      const beta = rz2 / rz;
      rz = rz2;
      for (let k = 0; k < size; k++) q[k] = z[k] + beta * q[k];
    }

    const residual = floats(size);
    for (let k = 1; k < size; k++) if (on[k]) residual[k] = x[k] - prior[k];
    latest = residual;
  };

  return {
    next({ data, stints }, box) {
      if (open) {
        if (!open.refitted) refit(open.day, open.pending, open.seen, open.rate, open.box);
        league.attempted += open.threes[0];
        league.made += open.threes[1];
        open = null;
      }
      const rate = league.attempted > 0 ? league.made / league.attempted : null;
      const onAthletes = (residual: Float64Array | null) =>
        Float64Array.from(box.athletes, (a) => {
          const c = index.get(a);
          return residual && c !== undefined && c < residual.length ? residual[c] : 0;
        });
      const start = onAthletes(latest);
      const after = new Map<string, Float64Array>();
      const days = finalDays(data);
      const threes: Open["threes"] = [0, 0];
      let pending: Pending[] = [];
      const seen = new Set<Athlete>();
      let current = start;
      days.forEach(({ day, games }, i) => {
        const t = epochDay(day);
        for (const g of games) for (const stint of stints?.games[g.id] ?? []) {
          if (!usable(stint)) continue;
          pending.push({ t, stint });
          for (const a of stint[0]) seen.add(a);
          for (const a of stint[1]) seen.add(a);
          threes[0] += stint[5] + stint[7];
          threes[1] += stint[6] + stint[8];
        }
        if (i % every === every - 1) {
          refit(day, pending, seen, rate, box);
          pending = [];
          current = onAthletes(latest);
        }
        after.set(day, current);
      });
      const last = days.at(-1);
      if (last) open = { box, day: last.day, refitted: days.length % every === 0, pending, seen, rate, threes };
      return { athletes: box.athletes, start, after };
    },
  };
}

/** A fresh onCourtWalk() through `seasons`, oldest first, each season with its box ratings from `box`, by season id. */
export function onCourtRatings(seasons: readonly OnCourtSeason[], box: ReadonlyMap<string, BoxRatings>, rule: OnCourtRule): Map<string, BoxRatings> {
  const walk = onCourtWalk(rule);
  return new Map(seasons.map((s) => {
    const ratings = box.get(s.data.season);
    if (!ratings) throw new Error(`onCourtRatings: no box ratings for ${s.data.season}`);
    return [s.data.season, walk.next(s, ratings)];
  }));
}
