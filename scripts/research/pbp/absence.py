# Model-free check: when a team's lineup changes (a regular sits, a trade), does the change in its players' summed
# rating predict the change in its margin, and which rating predicts it better?
# <venv>/bin/python scripts/research/pbp/absence.py <dir>     (<dir>/box.json and <dir>/apm.json)
# For each game and side: V = sum over the players who played of (expected minutes / 48) * rating, expected minutes
# being each one's mean over his last 10 appearances (15 with none), scaled to 240; ratings as of the day before.
# dV = V - the mean V of the team's previous 10 lineups priced with the same ratings, so only who plays changes it.
# y = home margin - (home's mean margin over its last 10 games - away's). x = dV_home - dV_away.
# Fit y = c + s * x on tuning seasons (2015-16..2022-23); score squared error on exploration seasons (2023-24..2025-26).
import json, os, sys
import numpy as np

d = sys.argv[1]
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
box = json.load(open(os.path.join(d, "box.json")))
apm = json.load(open(os.path.join(d, "apm.json")))["kinds"]
KINDS = {"box": box, **apm}
rows = []
for s in sorted(box):
    games = {g["id"]: g for g in json.load(open(os.path.join(ROOT, f"src/data/games/{s}.json")))["games"] if g["final"]}
    lines = json.load(open(os.path.join(ROOT, f"src/data/box/{s}.json")))["games"]
    days = box[s]["days"]; gday = box[s]["games"]
    byday = {}
    for gid, dd in gday.items(): byday.setdefault(dd, []).append(gid)
    pos = {k: {int(a): j for j, a in enumerate(v[s]["athletes"])} for k, v in KINDS.items()}
    mins = {}; lus = {}; margins = {}
    for i, dd in enumerate(days):
        rat = {k: np.array(v[s]["start"] if i == 0 else v[s]["after"][days[i - 1]]) for k, v in KINDS.items()}
        val = lambda k, lu: sum(sh * rat[k][pos[k][a]] for a, sh in lu if a in pos[k])
        done = []
        for gid in byday.get(dd, []):
            g = games[gid]; sides = lines.get(gid, {})
            if g["home"] not in sides or g["away"] not in sides: continue
            out = {}
            for t in (g["home"], g["away"]):
                exp = [(l[0], np.mean(mins[l[0]]) if l[0] in mins else 15.0) for l in sides[t]]
                tot = sum(m for _, m in exp); lu = [(a, m * 240 / tot / 48) for a, m in exp]
                prev = lus.get(t, [])
                if len(prev) >= 5:
                    played = {a for a, _ in lu}
                    reg = [a for a, _ in prev[-1] if a not in played and np.mean(mins.get(a, [0])) >= 24]
                    out[t] = ({k: val(k, lu) - np.mean([val(k, p) for p in prev]) for k in KINDS}, np.mean(margins[t]), bool(reg))
                done.append((t, lu))
            if len(out) == 2:
                h, a = out[g["home"]], out[g["away"]]
                rows.append((s, g["hs"] - g["as"] - (h[1] - a[1]), {k: h[0][k] - a[0][k] for k in KINDS}, h[2] or a[2]))
            margins.setdefault(g["home"], []).append(g["hs"] - g["as"]); margins.setdefault(g["away"], []).append(g["as"] - g["hs"])
            margins[g["home"]] = margins[g["home"]][-10:]; margins[g["away"]] = margins[g["away"]][-10:]
        for t, lu in done: lus[t] = (lus.get(t, []) + [lu])[-10:]
        for gid in byday.get(dd, []):
            for t, ls in lines.get(gid, {}).items():
                for l in ls: mins[l[0]] = (mins.get(l[0], []) + [l[1]])[-10:]

y = np.array([r[1] for r in rows]); tune = np.array([r[0] <= "2022-23" for r in rows]); expl = np.array(["2023-24" <= r[0] <= "2025-26" for r in rows])
miss = np.array([r[3] for r in rows])
print(f"games {len(rows)} (tuning {tune.sum()}, exploration {expl.sum()}), with a regular (>=24 mpg) out: {miss.sum()}")
rng = np.random.default_rng(7)
def oos(cols, mask_eval):
    X = np.column_stack([np.ones(len(y))] + [np.array([r[2][c] for r in rows]) for c in cols])
    beta = np.linalg.lstsq(X[tune], y[tune], rcond=None)[0]
    e = (y - X @ beta) ** 2
    return beta, e
_, e0 = oos([], None)
_, eb = oos(["box"], None)
print(f"{'predictor':22s} slope(tune)   corr(all)  dMSE expl vs intercept [95% boot]   same, games with a regular out   | dMSE expl vs box [95%]    same, regular out")
for cols in [["box"], ["apm"], ["apmbox"], ["resid"], ["box", "apm"], ["box", "resid"]]:
    beta, e = oos(cols, None)
    x = np.array([r[2][cols[0]] for r in rows])
    out = []
    for ref, m in ((e0, expl), (e0, expl & miss), (eb, expl), (eb, expl & miss)):
        dd = (e - ref)[m]; bs = [dd[rng.integers(0, len(dd), len(dd))].mean() for _ in range(1000)]
        out.append(f"{dd.mean():+.3f} [{np.percentile(bs, 2.5):+.3f},{np.percentile(bs, 97.5):+.3f}]")
    print(f"{'+'.join(cols):22s} {' '.join(f'{b:.3f}' for b in beta[1:]):12s}  {np.corrcoef(x, y)[0, 1]:.3f}     {out[0]}      {out[1]}   | {out[2]}  {out[3]}")
print(f"exploration MSE, intercept only: {e0[expl].mean():.2f}")
