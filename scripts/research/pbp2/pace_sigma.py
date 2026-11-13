# Does a game-specific spread of outcomes beat the model's one sigma? Each team's pace (possessions per 48) and three-
# point attempt rate, as exponentially weighted means of its earlier games (from stints2.py, carried across seasons),
# give each game's expected pace and three-point rate relative to the league's recent games. Then
#   p = Phi(e / (sigma * w_early * exp(g1 * log pace ratio + g2 * log 3PA ratio)))
# with sigma, g1, g2 fitted on tuning outcomes (early widening fitted as score2.py does), scored on results only.
# <venv>/bin/python scripts/research/pbp2/pace_sigma.py <S> <stints2Dir> <variants.json> <name> [alpha]
import json, os, sys, numpy as np, pandas as pd, warnings
warnings.filterwarnings("ignore")
from scipy.stats import norm
from scipy.optimize import minimize, minimize_scalar
S, sdir, vf, name = sys.argv[1:5]; alpha = float(sys.argv[5]) if len(sys.argv) > 5 else 0.1
df = pd.read_pickle(S + "/df3.pkl").set_index("id"); df = df[df.season < "2026"]
games = {}
for f in sorted(os.listdir(sdir)):
    if not f.endswith(".json"): continue
    for gid, g in json.load(open(os.path.join(sdir, f))).items():
        st = g["stints"]; secs = sum(x[2] for x in st)
        if secs < 2800: continue
        poss = sum(x[5] for x in st) * 2880 / secs
        tpa = sum(x[11][2] + x[11][6] for x in st) * 2880 / secs
        games[gid] = (poss, tpa)
order = df.sort_values(["t"]).index
team = {}; lg = [None, None]; feat = {}
for gid in order:
    r = df.loc[gid]
    h, a = r.home, r.away
    if lg[0] is not None:
        th, ta = team.get(h, lg), team.get(a, lg)
        feat[gid] = (np.log((th[0] + ta[0]) / 2 / lg[0]), np.log((th[1] + ta[1]) / 2 / lg[1]))
    if gid in games:
        x = games[gid]
        for t in (h, a): team[t] = [(1 - alpha) * team.get(t, lg if lg[0] else list(x))[i] + alpha * x[i] for i in range(2)]
        lg = [x[i] if lg[0] is None else 0.99 * lg[i] + 0.01 * x[i] for i in range(2)]
F = np.array([feat.get(g, (0.0, 0.0)) for g in df.index])
e = pd.Series(json.load(open(vf))[name]).reindex(df.index).values
k = np.minimum(df.kh, df.ka).values; y = df.y.values; tune = (df.season <= "2022-23").values; wk = (df.season + ":" + (df.d // 7).astype(str)).values
ll = lambda p: -(y * np.log(np.clip(p, 1e-12, 1)) + (1 - y) * np.log(np.clip(1 - p, 1e-12, 1)))
def probs(th):
    s, w, g1, g2 = th
    return norm.cdf(e / (s * np.where(k < 5, w, 1) * np.exp(g1 * F[:, 0] + g2 * F[:, 1])))
def fit(free):
    def f(v):
        th = [3, 1.1, 0, 0]
        for i, j in enumerate(free): th[j] = v[i]
        return ll(probs(th))[tune].mean()
    x0 = [[3, 1.1, 0, 0][j] for j in free]
    v = minimize(f, x0, method="Nelder-Mead", options={"xatol": 1e-5, "fatol": 1e-9, "maxiter": 4000}).x
    th = [3, 1.1, 0, 0]
    for i, j in enumerate(free): th[j] = v[i]
    return th
def boot(x, blk, n=1000):
    g = pd.DataFrame({"x": x, "b": blk}).groupby("b").x.agg(["sum", "count"]).values; r = np.random.default_rng(7); i = r.integers(0, len(g), (n, len(g))); mm = g[i, 0].sum(1) / g[i, 1].sum(1); return np.percentile(mm, 2.5), np.percentile(mm, 97.5)
base = fit([0, 1]); L0 = ll(probs(base))
print(f"{name}: games with features {np.mean(F[:, 0] != 0):.3f}; pace ratio sd {F[:, 0].std():.4f}, 3PA ratio sd {F[:, 1].std():.4f}; constant sigma {base[0]:.3f}")
for lab, free in (("pace", [0, 1, 2]), ("3PA", [0, 1, 3]), ("pace+3PA", [0, 1, 2, 3])):
    th = fit(free); d = ll(probs(th)) - L0
    print(f"  {lab:9s} g1 {th[2]:+.3f} g2 {th[3]:+.3f} | dLL tune {d[tune].mean():+.5f} [{boot(d[tune], wk[tune])[0]:+.5f},{boot(d[tune], wk[tune])[1]:+.5f}] expl {d[~tune].mean():+.5f} [{boot(d[~tune], wk[~tune])[0]:+.5f},{boot(d[~tune], wk[~tune])[1]:+.5f}]")
