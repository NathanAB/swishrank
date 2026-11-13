# Results-only scoring, as scripts/research/pbp/score_pbp.py (sigma refit on tuning outcomes, early-season widening,
# weekly block bootstrap), against two bases at once, over one or more variants files.
# <venv>/bin/python scripts/research/pbp2/score2.py <scratchpad> <base> <ref> <variants.json> [more.json ...]
# Prints dLL (outcome log loss) vs base and vs ref, tuning (<= 2022-23) and exploration seasons, and dMSE vs base.
# Nothing reads betting lines.
import sys, json, numpy as np, pandas as pd, warnings
warnings.filterwarnings("ignore")
from scipy.stats import norm
from scipy.optimize import minimize_scalar
S, base, ref = sys.argv[1:4]
R = {}
for f in sys.argv[4:]: R.update(json.load(open(f)))
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
bad = [n for n, e in E.items() if np.isnan(e).any()]
assert not bad, f"variants miss games: {bad}"
P = {n: price(e) for n, e in E.items()}
L = {n: ll(p, y) for n, (p, _) in P.items()}
print(f"games: tuning {tune.sum()}, exploration {(~tune).sum()}; {base}: LL tune {L[base][tune].mean():.4f} expl {L[base][~tune].mean():.4f}")
print(f"{'variant':34s} sigma | dLL vs {base}: tune [95%]  expl [95%]       | dLL vs {ref}: tune [95%]  expl [95%]       | dMSE vs {base} tune  expl")
for n in R:
    row = f"{n:34s} {P[n][1]:.3f} |"
    for b in (base, ref):
        d = L[n] - L[b]
        for msk in (tune, ~tune):
            lo, hi = boot(d[msk], wk[msk]); row += f" {d[msk].mean():+.4f} [{lo:+.4f},{hi:+.4f}]"
        row += " |"
    dm = (E[n] - cm) ** 2 - (E[base] - cm) ** 2
    row += f" {dm[tune].mean():+.4f} {dm[~tune].mean():+.4f} | tune dLL vs {base} {(L[n] - L[base])[tune].mean():+.5f}"
    print(row, flush=True)
