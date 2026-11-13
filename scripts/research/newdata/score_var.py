# Game-specific sigma from variance features, results only. Version 4's e unchanged; chance = Phi(e / (sig * exp(g.z)))
# with z the tuning-centred, tuning-scaled features, sig, early widening and g all fitted on tuning outcomes; then the
# paired dLL against plain v4 pricing with the same weekly block bootstrap as scripts/research/pbp/score_pbp.py.
# <venv>/bin/python scripts/research/newdata/score_var.py <scratchpad> feat[,feat] ...
import sys, json, numpy as np, pandas as pd
from scipy.stats import norm
from scipy.optimize import minimize

S = sys.argv[1]
df = pd.read_pickle(S + "/df3.pkl").set_index("id"); df = df[df.season < "2026"]
f = pd.read_pickle(S + "/newdata/feat.pkl").reindex(df.index)
e = pd.Series(json.load(open(S + "/rules.json"))["v4"]).reindex(df.index).values
f["absdiff_e"] = np.abs(e); f["pace_sum"] = f.pace_h + f.pace_a; f["par3_prod"] = f.par3_h * f.par3_a; f["playoff"] = f.playoff.astype(float)
y = df.y.values; k = np.minimum(df.kh, df.ka).values; early = k < 5
tune = (df.season <= "2022-23").values; wk = (df.season + ":" + (df.d // 7).astype(str)).values
ll = lambda p: -(y * np.log(np.clip(p, 1e-12, 1)) + (1 - y) * np.log(np.clip(1 - p, 1e-12, 1)))
def boot(x, blk, n=1000):
    g = pd.DataFrame({"x": x, "b": blk}).groupby("b").x.agg(["sum", "count"]).values; r = np.random.default_rng(7); i = r.integers(0, len(g), (n, len(g))); mm = g[i, 0].sum(1) / g[i, 1].sum(1); return np.percentile(mm, 2.5), np.percentile(mm, 97.5)
def fit(Z):
    def nll(th):
        s = np.exp(th[0]) * np.where(early, th[1], 1) * np.exp(Z @ th[2:])
        return ll(norm.cdf(e / s))[tune].mean()
    th = minimize(nll, np.r_[np.log(3.0), 1.2, np.zeros(Z.shape[1])], method="Nelder-Mead", options={"maxiter": 4000, "xatol": 1e-6, "fatol": 1e-9}).x
    return norm.cdf(e / (np.exp(th[0]) * np.where(early, th[1], 1) * np.exp(Z @ th[2:]))), th
p0, _ = fit(np.zeros((len(e), 0)))
for arg in sys.argv[2:]:
    cols = arg.split(",")
    Z = np.column_stack([f[c if c in f else c + "_d"].astype(float).values for c in cols])
    Z = (Z - np.nanmean(Z[tune], 0)) / np.nanstd(Z[tune], 0); Z = np.nan_to_num(Z)
    p, th = fit(Z); d = ll(p) - ll(p0)
    print(f"{arg:30s} g={np.round(th[2:], 4)} | dLL tune {d[tune].mean():+.5f} [{boot(d[tune], wk[tune])[0]:+.5f},{boot(d[tune], wk[tune])[1]:+.5f}]"
          f" expl {d[~tune].mean():+.5f} [{boot(d[~tune], wk[~tune])[0]:+.5f},{boot(d[~tune], wk[~tune])[1]:+.5f}]")
