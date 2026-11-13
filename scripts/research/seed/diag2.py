# Regression diagnostics of seed variants on tuning seasons (2016-17 to 2022-23): R^2 of each team-season's mean counted
# margin over its first 20 and all games on the seed's parts. python3 scripts/research/seed/diag2.py <S>
import sys, json, numpy as np

import importlib.util
spec = importlib.util.spec_from_file_location("seed", __file__.rsplit("/", 1)[0] + "/seed.py"); sd = importlib.util.module_from_spec(spec)
try: spec.loader.exec_module(sd)
except SystemExit: pass
def fit(X, y):
    X = np.column_stack([np.ones(len(y))] + X); c, *_ = np.linalg.lstsq(X, y, rcond=None); return c[1:], 1 - (y - X @ c).var() / y.var()
for b in (0.0, 0.12):
    for kw in (json.loads(x) for x in sys.argv[2:]):
        rows = sd.table(sd.TUNE, b=b, hold=0, **kw)
        Z, L, W, y20, y82 = (np.array([r[j] for r in rows]) for j in range(2, 7))
        o = [f"b={b} {kw}:"]
        for nm, y in (("y20", y20), ("y82", y82)):
            (cz, cl), r2 = fit([Z, L], y); (c1,), r1 = fit([Z], y); o.append(f"{nm} Z R2 {r1:.3f} Z+L R2 {r2:.3f} (Z x{cz:.2f} L x{cl:.2f})")
        print("  ".join(o))
