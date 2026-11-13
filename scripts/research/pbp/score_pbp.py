# Results-only scoring of variants against v4: outcome log loss and squared error of the counted margin.
# <venv>/bin/python scripts/research/pbp/score_pbp.py <scratchpad> <variants.json> [base]
# Same pricing as <scratchpad>/score.py (sigma refit on tuning outcomes, early-season widening), but every final
# game counts and nothing reads betting lines. Paired differences vs base with weekly block-bootstrap 95% intervals.
import sys, json, numpy as np, pandas as pd, warnings
warnings.filterwarnings("ignore")
from scipy.stats import norm
from scipy.optimize import minimize_scalar
S = sys.argv[1]; R = json.load(open(sys.argv[2])); base = sys.argv[3] if len(sys.argv) > 3 else "v4"
df = pd.read_pickle(S + "/df3.pkl").set_index("id")
df = df[df.season < "2026"]; k = np.minimum(df.kh, df.ka).values; y = df.y.values
m = (df.hs - df["as"]).values.astype(float); cm = np.sign(m) * np.sqrt(np.abs(m) + 3)
tune = (df.season <= "2022-23").values; wk = (df.season + ":" + (df.d // 7).astype(str)).values
ll = lambda p, yy: -(yy * np.log(np.clip(p, 1e-12, 1)) + (1 - yy) * np.log(np.clip(1 - p, 1e-12, 1)))
def price(e):
    f = lambda s: ll(norm.cdf(e[tune] / s), y[tune]).mean(); sig = minimize_scalar(f, bounds=(1.5, 5), method="bounded").x
    early = tune & (k < 5); g = lambda w: ll(norm.cdf(e[early] / (sig * w)), y[early]).mean(); w = minimize_scalar(g, bounds=(0.8, 2), method="bounded").x
    return norm.cdf(e / np.where(k < 5, sig * w, sig)), sig
def boot(x, blk, n=1000):
    g = pd.DataFrame({"x": x, "b": blk}).groupby("b").x.agg(["sum", "count"]).values; r = np.random.default_rng(7); i = r.integers(0, len(g), (n, len(g))); mm = g[i, 0].sum(1) / g[i, 1].sum(1); return np.percentile(mm, 2.5), np.percentile(mm, 97.5)
E = {n: pd.Series(es).reindex(df.index).values for n, es in R.items()}
assert not any(np.isnan(e).any() for e in E.values()), "a variant misses games"
P = {n: price(e) for n, e in E.items()}
pb = P[base][0]; eb = E[base]
print(f"games: tuning {tune.sum()}, exploration {(~tune).sum()}; base {base}: LL tune {ll(pb, y)[tune].mean():.4f} expl {ll(pb, y)[~tune].mean():.4f}, MSE tune {((eb - cm) ** 2)[tune].mean():.4f} expl {((eb - cm) ** 2)[~tune].mean():.4f}")
print(f"{'variant':22s} sigma | dLL tune [95%]             dLL expl [95%]             | dMSE tune [95%]            dMSE expl [95%]")
for n, (p, sig) in P.items():
    row = f"{n:22s} {sig:.3f} |"
    for d in (ll(p, y) - ll(pb, y), (E[n] - cm) ** 2 - (eb - cm) ** 2):
        for msk in (tune, ~tune):
            lo, hi = boot(d[msk], wk[msk]); row += f" {d[msk].mean():+.4f} [{lo:+.4f},{hi:+.4f}]"
        row += " |"
    print(row)
