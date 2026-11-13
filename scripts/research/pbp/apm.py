# Walk-forward ridge adjusted plus-minus from stints (stints.py), with and without the site's box rating as prior.
# <venv>/bin/python scripts/research/pbp/apm.py grid <dir>            tune ridge strength, decay, prior scale
# <venv>/bin/python scripts/research/pbp/apm.py write <dir> lam hl k lamBox   write <dir>/apm.json for apm-rules.ts
# <dir> holds stints/<season>.json and box.json (apm-rules.ts dump). Research only.
#
# Each stint is a row: +1 for the home five, -1 for the away five, a home intercept; target the margin per 100
# possessions at a fixed pace (secs / 28.8 possessions), weight those possessions times 0.5^(age in days / hl).
# A rating is the ridge solution pulled with strength lam toward 0 (pure) or toward k * box rating (box prior).
# Refits after every 7th game day of a season and on its last; a day's rating is the latest refit on or before it,
# so it uses stints of that day or earlier only. The tuning score is out of sample: each refit predicts the games
# up to the next refit from the lineups that played them, game margin squared error, tuning seasons only.
import json, os, sys
import numpy as np
from scipy.linalg import solve

TUNE = lambda s: s <= "2022-23"


def epoch(day):
    return int(np.datetime64(day, "D").astype(int))


def load(d):
    box = json.load(open(os.path.join(d, "box.json")))
    seasons = sorted(box)
    rows = []  # (day, season, gid, home5, away5, w, margin)
    players = {}
    for s in seasons:
        p = os.path.join(d, "stints", f"{s}.json")
        if not os.path.exists(p): continue
        st = json.load(open(p))
        for gid, g in st.items():
            day = box[s]["games"].get(gid)
            if day is None: continue
            for h, a, secs, hp, ap, poss in g["stints"]:
                if len(h) != 5 or len(a) != 5 or secs <= 0: continue
                ih = [players.setdefault(int(x), len(players)) for x in h]; ia = [players.setdefault(int(x), len(players)) for x in a]
                rows.append((epoch(day), s, gid, ih, ia, secs / 28.8, hp - ap))
    rows.sort(key=lambda r: r[0])
    return box, seasons, rows, players


def refits(box, seasons):
    out = []
    for s in seasons:
        days = box[s]["days"]
        for i, dd in enumerate(days):
            if i % 7 == 6 or i == len(days) - 1: out.append((epoch(dd), s, dd))
    return out


def box_vec(box, players, s, day):
    """Box rating per player index on `day` (the season's after-day rating), NaN where the season has none."""
    v = np.full(len(players), np.nan)
    b = box[s]; arr = b["after"][day] if day else b["start"]
    for a, x in zip(b["athletes"], arr):
        j = players.get(int(a))
        if j is not None: v[j] = x
    return v


def run(box, seasons, rows, players, hl, configs, record=None):
    """configs: list of (lam, k). Returns tuning SSE per config; with record, per-refit solutions of config 0."""
    P = len(players); n = P + 1
    A = np.zeros((n, n)); b = np.zeros(n)
    f = 0.5 ** (1 / hl)
    day = np.array([r[0] for r in rows]); ptr = 0
    sols = [np.zeros(n) for _ in configs]
    sse = np.zeros(len(configs)); cnt = 0
    last_t = None; lastbox = {}
    for t, s, dd in refits(box, seasons):
        end = np.searchsorted(day, t, side="right")
        block = rows[ptr:end]; ptr = end
        # out of sample: games in this block, priced with the solutions so far
        if TUNE(s) and block:
            games = {}
            for r in block:
                g = games.setdefault(r[2], [0.0, np.zeros(len(configs))])
                g[0] += r[6]
                for c, sol in enumerate(sols):
                    g[1][c] += r[5] / 100 * (sol[P] + sol[r[3]].sum() - sol[r[4]].sum())
            for m, pr in games.values(): sse += (pr - m) ** 2; cnt += 1
        if last_t is not None:
            dec = f ** (t - last_t); A *= dec; b *= dec
        last_t = t
        for r in block:
            wt = r[5] * f ** (t - r[0])
            idx = np.array(r[3] + r[4] + [P]); sg = np.array([1.0] * 5 + [-1.0] * 5 + [1.0])
            A[np.ix_(idx, idx)] += wt * np.outer(sg, sg)
            b[idx] += wt * sg * (100 * r[6] / r[5])
        bx = box_vec(box, players, s, dd); lastbox[s] = bx
        bx0 = np.nan_to_num(bx)
        act = np.where(np.diag(A)[:P] > 0.5)[0]
        ai = np.append(act, P)
        for c, (lam, k) in enumerate(configs):
            prior = np.append(k * bx0, 0.0)
            M = A[np.ix_(ai, ai)].copy(); M[np.diag_indices(len(ai))] += np.append(np.full(len(act), lam), 1e-3)
            rhs = b[ai] + np.append(lam * k * bx0[act], 0.0)
            sol = prior.copy(); sol[ai] = solve(M, rhs, assume_a="pos")
            sols[c] = sol
        if record is not None: record.append((s, dd, [x.copy() for x in sols], bx0.copy()))
    return sse / max(cnt, 1), cnt


def main():
    mode, d = sys.argv[1], sys.argv[2]
    box, seasons, rows, players = load(d)
    print(f"{len(rows)} stints, {len(players)} players, seasons with stints: {sorted({r[1] for r in rows})}", flush=True)
    if mode == "grid":
        lams = [float(x) for x in (sys.argv[3] if len(sys.argv) > 3 else "1000,3000,8000").split(",")]
        hls = [float(x) for x in (sys.argv[4] if len(sys.argv) > 4 else "180,365,730").split(",")]
        ks = [0.0, 0.25, 0.5, 0.75]
        configs = [(l, k) for k in ks for l in lams]
        print("hl  " + "  ".join(f"lam{l:g}/k{k:g}" for l, k in configs))
        for hl in hls:
            mse, cnt = run(box, seasons, rows, players, hl, configs)
            print(f"{hl:g} n={cnt} " + "  ".join(f"{x:.3f}" for x in mse), flush=True)
        # reference: intercept only and box-only (k * box with lam huge)
        mse, cnt = run(box, seasons, rows, players, 365, [(1e9, 0.0)] + [(1e9, k) for k in (0.25, 0.5, 0.75)])
        print("reference: home intercept only, then box only k=.25,.5,.75:", " ".join(f"{x:.3f}" for x in mse))
        return
    lam, hl, k, lamb = (float(x) for x in sys.argv[3:7])
    rec = []
    run(box, seasons, rows, players, hl, [(lam, 0.0), (lamb, k)], record=rec)
    kinds = {"apm": {}, "apmbox": {}, "resid": {}}
    by_day = {}
    for s, dd, sols, bxR in rec: by_day.setdefault(s, []).append((dd, sols, bxR))
    prev = None  # the last refit so far: (day, sols, box by player index at that refit)
    for s in seasons:
        b = box[s]; ath = [int(a) for a in b["athletes"]]
        idx = np.array([players.get(a, -1) for a in ath]); seen = idx >= 0; ix = np.maximum(idx, 0)
        def vec(ref, which, bx_today):
            bt = np.asarray(bx_today)
            if ref is None:  # nothing fitted yet: the ridge's centre
                v = {"apm": 0 * bt, "apmbox": k * bt, "resid": 0 * bt}[which]
            else:
                _, sols, bxR = ref
                if which == "apm": v = np.where(seen, sols[0][ix], 0.0)
                elif which == "apmbox": v = np.where(seen, sols[1][ix], k * bt)
                else: v = np.where(seen, sols[1][ix] - k * bxR[ix], 0.0)
            return [round(float(x), 3) for x in v]
        rf = by_day.get(s, [])
        for which in kinds:
            st = vec(prev, which, b["start"])
            after = {}; j = -1; cur = prev
            for dd in b["days"]:
                while j + 1 < len(rf) and rf[j + 1][0] <= dd: j += 1; cur = rf[j]
                after[dd] = vec(cur, which, b["after"][dd])
            kinds[which][s] = {"athletes": ath, "start": st, "after": after}
        if rf: prev = rf[-1]
    json.dump({"kinds": kinds, "params": {"lam": lam, "hl": hl, "k": k, "lamBox": lamb}}, open(os.path.join(d, "apm.json"), "w"), separators=(",", ":"))
    print("wrote", os.path.join(d, "apm.json"))


if __name__ == "__main__":
    main()
