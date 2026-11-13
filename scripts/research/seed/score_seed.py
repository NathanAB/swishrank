# Results-only scoring, scripts/research/pbp/score_pbp.py with early-season slices and the seed's season range.
# <venv>/bin/python scripts/research/seed/score_seed.py <S> <variants.json>[,<more.json>...] [base] [--only a,b] [--nowiden a,b]
# Same pricing as score_pbp.py (sigma and early widening refitted per variant on tuning outcomes; nothing reads betting
# lines). Tuning is 2016-17 to 2022-23 here: 2015-16 has no season before it on file, so no own seed and no opening
# roster can be built for it. Paired log-loss differences vs base with weekly block-bootstrap 95% intervals, for all
# games and for games where the side that had played fewer games had played fewer than 10 (k<10) or 20 (k<20) before it.
import sys, json, numpy as np, pandas as pd, warnings
warnings.filterwarnings("ignore")
from scipy.stats import norm
from scipy.optimize import minimize_scalar
S = sys.argv[1]
R = {}
for f in sys.argv[2].split(","): R.update(json.load(open(f)))
base = sys.argv[3] if len(sys.argv) > 3 and not sys.argv[3].startswith("--") else "v4"
only = sys.argv[sys.argv.index("--only") + 1].split(",") if "--only" in sys.argv else None
df = pd.read_pickle(S + "/df3.pkl").set_index("id")
df = df[(df.season < "2026") & (df.season >= "2016")]; k = np.minimum(df.kh, df.ka).values; y = df.y.values
m = (df.hs - df["as"]).values.astype(float); cm = np.sign(m) * np.sqrt(np.abs(m) + 3)
tune = (df.season <= "2022-23").values; wk = (df.season + ":" + (df.d // 7).astype(str)).values
ll = lambda p, yy: -(yy * np.log(np.clip(p, 1e-12, 1)) + (1 - yy) * np.log(np.clip(1 - p, 1e-12, 1)))
def price(e, widen=True):
    f = lambda s: ll(norm.cdf(e[tune] / s), y[tune]).mean(); sig = minimize_scalar(f, bounds=(1.5, 5), method="bounded").x
    early = tune & (k < 5); g = lambda w: ll(norm.cdf(e[early] / (sig * w)), y[early]).mean(); w = minimize_scalar(g, bounds=(0.8, 2), method="bounded").x if widen else 1.0
    return norm.cdf(e / np.where(k < 5, sig * w, sig)), sig, w
def boot(x, blk, n=1000):
    g = pd.DataFrame({"x": x, "b": blk}).groupby("b").x.agg(["sum", "count"]).values; r = np.random.default_rng(7); i = r.integers(0, len(g), (n, len(g))); mm = g[i, 0].sum(1) / g[i, 1].sum(1); return np.percentile(mm, 2.5), np.percentile(mm, 97.5)
names = [n for n in R if (only is None or n in only or n == base)]
E = {n: pd.Series(R[n]).reindex(df.index).values for n in names}
assert not any(np.isnan(e).any() for e in E.values()), "a variant misses games"
P = {n: price(e) for n, e in E.items()}
# --nowiden a,b: also score those variants with no early widening, as "<name>@w1".
for n in (sys.argv[sys.argv.index("--nowiden") + 1].split(",") if "--nowiden" in sys.argv else []):
    E[n + "@w1"] = E[n]; P[n + "@w1"] = price(E[n], widen=False); names.append(n + "@w1")
pb = P[base][0]; eb = E[base]
sl = [("tune", tune), ("tune k<10", tune & (k < 10)), ("tune k<20", tune & (k < 20)), ("expl", ~tune), ("expl k<10", ~tune & (k < 10)), ("expl k<20", ~tune & (k < 20))]
print("games: " + ", ".join(f"{a} {b.sum()}" for a, b in sl) + f"; base {base} LL: " + ", ".join(f"{a} {ll(pb, y)[b].mean():.4f}" for a, b in sl))
print(f"{'variant':26s} sigma  widen | " + " | ".join(f"{a:>23s}" for a, _ in sl) + " | dMSE tune, expl")
for n in names:
    p, sig, w = P[n]; d = ll(p, y) - ll(pb, y); row = f"{n:26s} {sig:.3f} {w:.3f} |"
    for a, msk in sl:
        lo, hi = boot(d[msk], wk[msk]); row += f" {d[msk].mean():+.4f} [{lo:+.4f},{hi:+.4f}] |"
    dm = (E[n] - cm) ** 2 - (eb - cm) ** 2
    row += f" {dm[tune].mean():+.4f} {dm[~tune].mean():+.4f}"
    print(row)
