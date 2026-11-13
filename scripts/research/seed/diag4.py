# Do preseason team results add to the seed's parts? Regression on tuning seasons, checked on exploration seasons.
# python3 scripts/research/seed/diag4.py <S>
import sys, json, math, numpy as np, importlib.util
spec = importlib.util.spec_from_file_location("seed", __file__.rsplit("/", 1)[0] + "/seed.py"); sd = importlib.util.module_from_spec(spec); spec.loader.exec_module(sd)
S = sys.argv[1]; PRE = json.load(open(f"{S}/seed/pre/preseason.json"))
def pre_margin(s):
    out = {}
    for g in PRE.get(s, []):
        h, a = g["teams"]["home"], g["teams"]["away"]
        if h["abbr"] not in sd.D[s]["abbrs"] or a["abbr"] not in sd.D[s]["abbrs"]: continue
        try: m = float(h["score"]) - float(a["score"])
        except Exception: continue
        c = math.copysign(math.sqrt(abs(m) + 3), m)
        out.setdefault(h["abbr"], []).append(c); out.setdefault(a["abbr"], []).append(-c)
    return {k: (np.mean(v), len(v)) for k, v in out.items()}
def rows(ss, kw):
    X, y = [], []
    for s in ss:
        pm = pre_margin(s); prev = sd.seasons[sd.seasons.index(s) - 1]
        Z = sd.centred({a: sd.strength(s, a, **kw)[0] for a in sd.D[s]["abbrs"]}); L = sd.D[prev]["teamPartsApm"]; res = sd.team_results(s)
        for a in sd.D[s]["abbrs"]:
            p, n = pm.get(a, (0.0, 0)); X.append([Z[a], L.get(a, 0), p * n / (n + 4), sd.D[s]["winCentres"][a]]); y.append(res[a][0])
    return np.array(X), np.array(y)
kw = {"b": 0.12, "hold": 0, "pre": 1, "age": 1}
Xt, yt = rows(sd.TUNE, kw); Xe, ye = rows(sd.EXPL, kw)
for cols, nm in (([0, 1], "Z+L"), ([0, 1, 2], "Z+L+preMargin"), ([3], "W"), ([3, 2], "W+preMargin")):
    A = np.column_stack([np.ones(len(yt)), Xt[:, cols]]); c, *_ = np.linalg.lstsq(A, yt, rcond=None)
    pe = np.column_stack([np.ones(len(ye)), Xe[:, cols]]) @ c
    print(f"{nm:16s} coef {np.round(c[1:], 3)}  tune R2 {1 - (yt - A @ c).var() / yt.var():.3f}  expl R2 (tuning coefs) {1 - ((ye - pe) ** 2).mean() / ye.var():.3f}")
