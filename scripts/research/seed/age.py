# Age curve for the seed: how a player's Game Score per 36 in a season departs from his box rating at its start, by age.
# python3 scripts/research/seed/age.py <S>   (reads <S>/seed/dump.json, <S>/seed/athletes-copy.json: ESPN athlete birth dates
# fetched by scripts/research/newdata/espn_athletes.py; writes <S>/seed/age.json {season: {athlete: age}} and the curve)
import json, sys, numpy as np
from datetime import date
S = sys.argv[1]; ROOT = __file__.rsplit("/scripts/", 1)[0]
D = json.load(open(f"{S}/seed/dump.json")); ATH = json.load(open(f"{S}/seed/athletes-copy.json"))
G = [1, 0.4, -0.7, 0.4, -0.4, 0.7, 0.3, 0.7, 1, 0.7, -1, -0.4]
ages = {}
rows = []
for s in sorted(D):
    feb = date(int(s[:4]) + 1, 2, 1)
    ages[s] = {}
    for a, v in ATH.items():
        if v and v.get("dob"): ages[s][a] = round((feb - date.fromisoformat(v["dob"][:10])).days / 365.25, 2)
    if s == "2015-16" or s >= "2026": continue
    bx = json.load(open(f"{ROOT}/src/data/box/{s}.json"))["games"]
    gs, mn = {}, {}
    for sides in bx.values():
        for lines in sides.values():
            for l in lines:
                gs[l[0]] = gs.get(l[0], 0) + sum(w * l[i + 2] for i, w in enumerate(G)); mn[l[0]] = mn.get(l[0], 0) + l[1]
    mean = 36 * sum(gs.values()) / sum(mn.values())
    st = dict(zip(D[s]["athletes"], D[s]["start"])); rook = set(D[s]["rookies"])
    for a, m in mn.items():
        if m < 300 or a in rook or str(a) not in ages[s]: continue
        rows.append((s, ages[s][str(a)], 36 * gs[a] / m - mean - st[a], m))
json.dump(ages, open(f"{S}/seed/age.json", "w"))
r = np.array([(x[1], x[2], x[3]) for x in rows if x[0] <= "2022-23"])
print("players-seasons (tuning, >=300 min, non-rookies, with dob):", len(r), "athletes with dob:", len(ATH))
for lo, hi in ((19, 22), (22, 24), (24, 26), (26, 28), (28, 30), (30, 32), (32, 34), (34, 45)):
    k = (r[:, 0] >= lo) & (r[:, 0] < hi); w = r[k, 2]
    print(f"age {lo}-{hi}: n {k.sum():4d}  mean change {np.average(r[k,1], weights=w):+.2f} per 36")
# a quadratic in age, minutes-weighted; centred so the minutes-weighted mean is 0
X = np.column_stack([np.ones(len(r)), r[:, 0] - 27, (r[:, 0] - 27) ** 2]); W = np.sqrt(r[:, 2])
c, *_ = np.linalg.lstsq(X * W[:, None], r[:, 1] * W, rcond=None)
print("quadratic: change = %.3f %+.3f (age-27) %+.4f (age-27)^2" % tuple(c))
json.dump({"c": list(c)}, open(f"{S}/seed/agecurve.json", "w"))
