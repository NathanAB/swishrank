# Do five-man units and pairs beat the sum of their players in a way that lasts? For each season: ridge plus-minus
# (players and home edge) fitted on each half of the season's stints separately; each unit's (and pair's) residual
# per 100 possessions, actual minus its half's players' sum, in each half. A small lam keeps player shrinkage, which
# would repeat in both halves, from posing as a unit effect.
# Persistence is the possession-weighted correlation of the two halves' residuals over units seen in both, with a
# bootstrap interval over units. Tuning seasons only.
# <venv>/bin/python scripts/research/pbp2/lineup.py <stintsDir> [lam] [minPoss]
import itertools, json, os, sys
import numpy as np
from scipy import sparse
from scipy.sparse.linalg import spsolve

sdir = sys.argv[1]; lam = float(sys.argv[2]) if len(sys.argv) > 2 else 3000; mn = float(sys.argv[3]) if len(sys.argv) > 3 else 30
rng = np.random.default_rng(1)


def wcorr(x, y, w):
    mx, my = np.average(x, weights=w), np.average(y, weights=w)
    return np.average((x - mx) * (y - my), weights=w) / np.sqrt(np.average((x - mx) ** 2, weights=w) * np.average((y - my) ** 2, weights=w))


out = {"unit": [], "pair": []}
for f in sorted(os.listdir(sdir)):
    s = f[:7]
    if not f.endswith(".json") or s > "2022-23": continue
    st = json.load(open(os.path.join(sdir, f)))
    rows = [(gid, x) for gid, g in st.items() for x in g["stints"] if len(x[0]) == 5 and len(x[1]) == 5 and x[2] > 0]
    gids = sorted(st, key=lambda g: int(g)); half = set(gids[: len(gids) // 2])
    pl = {}
    for _, x in rows:
        for p in x[0] + x[1]: pl.setdefault(p, len(pl))
    P = len(pl)
    def design(rs):
        r, c, v = [], [], []
        for i, (_, x) in enumerate(rs):
            for p in x[0]: r.append(i); c.append(pl[p]); v.append(1.0)
            for p in x[1]: r.append(i); c.append(pl[p]); v.append(-1.0)
            r.append(i); c.append(P); v.append(1.0)
        return sparse.csr_matrix((v, (r, c)), shape=(len(rs), P + 1))
    first = [r for r in rows if r[0] in half]; second = [r for r in rows if r[0] not in half]
    def fit(rs):
        X1 = design(rs); w1 = np.array([x[2] / 28.8 for _, x in rs]); y1 = np.array([100 * (x[3] - x[4]) / (x[2] / 28.8) for _, x in rs])
        M = (X1.T.multiply(w1) @ X1).tocsc() + sparse.diags(np.append(np.full(P, lam), 1e-3))
        return spsolve(M, X1.T @ (w1 * y1))
    betas = (fit(first), fit(second))
    for kind, size in (("unit", 5), ("pair", 2)):
        acc = [{}, {}]
        for h, rs in enumerate((first, second)):
            beta = betas[h]
            for _, x in rs:
                w = x[2] / 28.8; pred = beta[P] + sum(beta[pl[p]] for p in x[0]) - sum(beta[pl[p]] for p in x[1])
                res = (x[3] - x[4]) - pred * w / 100  # points above the players' sum, home side's view
                for side, sgn in ((x[0], 1), (x[1], -1)):
                    for u in itertools.combinations(sorted(side), size):
                        # a pair's residual minus its five's player-sum is shared by the other three: count it anyway,
                        # the question is only whether it repeats
                        a = acc[h].setdefault(u, [0.0, 0.0]); a[0] += sgn * res; a[1] += w
        both = [u for u in acc[0] if u in acc[1] and acc[0][u][1] >= mn and acc[1][u][1] >= mn]
        r1 = np.array([100 * acc[0][u][0] / acc[0][u][1] for u in both]); r2 = np.array([100 * acc[1][u][0] / acc[1][u][1] for u in both])
        w = np.array([min(acc[0][u][1], acc[1][u][1]) for u in both])
        out[kind].append((s, len(both), r1, r2, w))
for kind, L in out.items():
    r1 = np.concatenate([x[2] for x in L]); r2 = np.concatenate([x[3] for x in L]); w = np.concatenate([x[4] for x in L])
    bs = [wcorr(r1[i], r2[i], w[i]) for i in (rng.integers(0, len(w), len(w)) for _ in range(300))]
    # what a persistent effect would be worth: the slope of second-half residual on first-half residual
    slope = np.average((r1 - np.average(r1, weights=w)) * r2, weights=w) / np.average((r1 - np.average(r1, weights=w)) ** 2, weights=w)
    print(f"{kind}: {len(w)} seen >= {mn:g} possessions in both halves; weighted corr {wcorr(r1, r2, w):+.3f} [{np.percentile(bs, 2.5):+.3f},{np.percentile(bs, 97.5):+.3f}], slope {slope:+.3f}; "
          + " ".join(f"{s}:{wcorr(a, b, ww):+.2f}" for s, n, a, b, ww in L))
