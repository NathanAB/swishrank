# Tuning-only feature selection: keep a screened feature when its slope on v4's miss has the same sign and |t| >= 1.5
# in both halves of the tuning seasons (2015-16..2018-19 and 2019-20..2022-23). Exploration seasons are not read.
# <venv>/bin/python scripts/research/newdata/split_select.py <scratchpad>
import sys, numpy as np, pandas as pd, statsmodels.api as sm
S = sys.argv[1]; f = pd.read_pickle(S + "/newdata/feat.pkl"); f = f[f.season <= "2022-23"]
lines = open(S + "/newdata/screen.txt").read().split("variance")[0].splitlines()[1:]
names = [l.split()[0] for l in lines]
A = (f.season <= "2018-19").values; keep = []
for n in names:
    x = f[n if n in f else n + "_d"].astype(float).values; ts = []
    for m in (A, ~A):
        ok = m & ~np.isnan(x)
        if ok.sum() < 200 or np.std(x[ok]) == 0: ts.append(0); continue
        r = sm.OLS(f.res.values[ok], sm.add_constant(x[ok])).fit(cov_type="cluster", cov_kwds={"groups": pd.factorize(f.wk.values[ok])[0]})
        ts.append(r.params[1] / r.bse[1])
    print(f"{n:14s} t_first {ts[0]:+.2f} t_second {ts[1]:+.2f}")
    if abs(ts[0]) >= 1.5 and abs(ts[1]) >= 1.5 and np.sign(ts[0]) == np.sign(ts[1]): keep.append(n)
print("KEEP", ",".join(keep))
