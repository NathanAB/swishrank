# Starting-lineup announcements (public about 30 minutes before tip) against version 4's priced lineup: for each side,
# the share and value of expected starters (priced share >= 0.45) who did not start, and of starters the lineup priced
# low. Starters come from ESPN's box (starter flag) in the pbp cache, which records the announced five save rare
# late swaps. <venv>/bin/python scripts/research/newdata/starters.py <scratchpad> -> <scratchpad>/newdata/starters.pkl
import sys, gzip, json, os, numpy as np, pandas as pd

S = sys.argv[1]
df = pd.read_pickle(S + "/df3.pkl")
rows = {}
for r in df.itertuples():
    p = f"{S}/pbp/games/{r.season}/{r.id}.json.gz"
    if not os.path.exists(p): continue
    d = json.load(gzip.open(p, "rt"))
    tid = {d["teams"]["home"]["id"]: "h", d["teams"]["away"]["id"]: "a"}
    st = {"h": set(), "a": set()}
    for a, (t, s, *_rest) in d["box"].items():
        if s and t in tid: st[tid[t]].add(int(a))
    if len(st["h"]) != 5 or len(st["a"]) != 5: continue
    out = {}
    for side, lu in (("h", r.luh), ("a", r.lua)):
        exp = [x for x in lu if x[1] >= 0.45]
        miss = [x for x in exp if x[0] not in st[side]]
        priced = {x[0]: x for x in lu}
        new = [a for a in st[side] if a not in priced or priced[a][1] < 0.45]
        top5 = sorted(lu, key=lambda x: -x[1])[:5]
        miss5 = [x for x in top5 if x[0] not in st[side]]
        out[f"st5out_{side}"] = sum(x[1] for x in miss5)
        out[f"st5outv_{side}"] = sum(x[1] * x[2] for x in miss5)
        out[f"stout_{side}"] = sum(x[1] for x in miss)
        out[f"stoutv_{side}"] = sum(x[1] * x[2] for x in miss)
        out[f"stnew_{side}"] = float(len(new))
        out[f"stnewv_{side}"] = sum(priced[a][2] if a in priced else 0.0 for a in new)
    rows[r.id] = out
o = pd.DataFrame.from_dict(rows, orient="index"); o.index.name = "id"
o.to_pickle(S + "/newdata/starters.pkl"); print(o.describe().T)
