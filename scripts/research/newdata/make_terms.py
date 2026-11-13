# Turn screened features into per-game terms for rules_extra.ts: term = scale * slope_tune * x, with slope_tune the
# tuning-season OLS slope of version 4's miss on x (x centred on its tuning mean unless listed in RAW). Missing x -> 0.
# <venv>/bin/python scripts/research/newdata/make_terms.py <scratchpad> <out.json> feat[,feat...]:scale[,scale] ...
#   each argument is one variant; several features in one argument are fitted jointly (multiple regression).
import sys, json, numpy as np, pandas as pd, statsmodels.api as sm

S = sys.argv[1]; out = sys.argv[2]
f = pd.read_pickle(S + "/newdata/feat.pkl")
allg = pd.read_pickle(S + "/df3.pkl").set_index("id")
tune = (f.season <= "2022-23").values
RAW = {"empty", "empty_he", "po_lostlast_h", "po_elim_game", "po_g7", "alt", "natTV", "early", "weekend"}
terms = {}
for arg in sys.argv[3:]:
    names, scales = arg.split(":")
    names = names.split(","); scale = float(scales)
    X = pd.DataFrame({n: f[n if n in f else n + "_d"].astype(float) for n in names})
    for n in names:
        if n not in RAW: X[n] = X[n] - X[n][tune].mean()
    X = X.fillna(0.0)
    m = sm.OLS(f.res.values[tune], sm.add_constant(X.values[tune])).fit()
    t = (X.values @ m.params[1:]) * scale
    name = "+".join(names) + f"@{scale:g}"
    terms[name] = {i: round(float(v), 5) for i, v in zip(f.index, t) if abs(v) > 1e-6}
    print(name, dict(zip(names, np.round(m.params[1:], 4))), "sd(term)", round(float(np.std(t)), 4), file=sys.stderr)
json.dump(terms, open(out, "w"))
