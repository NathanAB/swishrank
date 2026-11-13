# Walk-forward ridge adjusted plus-minus, a faster and configurable copy of scripts/research/pbp/apm.py (sparse block
# updates). Writes <out> in apm.json's format with the "resid" kind (box-prior APM minus k * box at the refit), which
# apm2-rules.ts mixes into the site's player prior centre.
#   <venv>/bin/python scripts/research/pbp2/apm2.py <stintsDir> <box.json> <out.json> [key=value ...]
#   <venv>/bin/python scripts/research/pbp2/apm2.py <stintsDir> <box.json> <margins.json> gtmargins=1 [gt=...]
# keys: lam (8000) hl (365) k (0.5) cadence (7: refit after every 7th game day; 1: daily)
#       gt (none | ctg: CTG rule with <=2 starters on the floor combined | score: CTG score/clock rule alone) gtw (0)
#       luck3 / luckft (0..1: share of each side's made-minus-expected threes / free throws taken out of its points,
#       expected at the league rate of the seasons before; the first season uses its own)
#       po (1: playoff stint weight) minposs (0: a player with fewer decayed possessions keeps resid 0)
#       carry (1: everything from earlier seasons is multiplied by this at each season's first refit)
# Research only. Stints from stints2.py (or pbp/stints.py, without the extra fields: gt and luck need stints2).
import json, os, pickle, re, sys
import numpy as np
from scipy.linalg import solve
from scipy import sparse

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
PLAYOFF = re.compile(r"(1st Round|Semifinals|Conf\.? Finals|NBA Finals|Conference Finals)")


def epoch(day):
    return int(np.datetime64(day, "D").astype(int))


def load(sdir, box):
    seasons = sorted(box)
    rows = []
    players = {}
    for s in seasons:
        p = os.path.join(sdir, f"{s}.json")
        if not os.path.exists(p): continue
        notes = {g["id"]: g["note"] for g in json.load(open(os.path.join(ROOT, f"src/data/games/{s}.json")))["games"]}
        st = json.load(open(p))
        for gid, g in st.items():
            day = box[s]["games"].get(gid)
            if day is None: continue
            po = int(bool(notes.get(gid)) and bool(PLAYOFF.search(notes.get(gid) or "")))
            for x in g["stints"]:
                h, a, secs, hp, ap, poss = x[:6]
                if len(h) != 5 or len(a) != 5 or secs <= 0: continue
                ih = [players.setdefault(int(q), len(players)) for q in h]; ia = [players.setdefault(int(q), len(players)) for q in a]
                ext = x[6:11] + [x[11]] if len(x) > 6 else [0, 0, 0, 5, 5, [0] * 8]
                rows.append((epoch(day), s, gid, ih, ia, secs / 28.8, hp, ap, po, *ext))
    rows.sort(key=lambda r: r[0])
    R = {
        "day": np.array([r[0] for r in rows]), "season": np.array([r[1] for r in rows]), "gid": np.array([r[2] for r in rows]),
        "H": np.array([r[3] for r in rows]), "A": np.array([r[4] for r in rows]), "w": np.array([r[5] for r in rows]),
        "hp": np.array([r[6] for r in rows], float), "ap": np.array([r[7] for r in rows], float), "po": np.array([r[8] for r in rows]),
        "period": np.array([r[9] for r in rows]), "t0": np.array([r[10] for r in rows], float), "m0": np.array([r[11] for r in rows], float),
        "hst": np.array([r[12] for r in rows]), "ast": np.array([r[13] for r in rows]), "shots": np.array([r[14] for r in rows], float),
    }
    return seasons, R, players


def garbage(R, rule):
    if rule == "none": return np.zeros(len(R["w"]), bool)
    left = 2880 - R["t0"]; m = np.abs(R["m0"])
    score = (R["period"] == 4) & (((left <= 720) & (left > 540) & (m >= 25)) | ((left <= 540) & (left > 360) & (m >= 20)) | ((left <= 360) & (m >= 10)))
    if rule == "score": return score
    return score & (R["hst"] + R["ast"] <= 2)


def points(R, seasons, luck3, luckft):
    """Each side's points with a share of its shooting luck taken out: made minus expected at the league rate before."""
    hp, ap = R["hp"].copy(), R["ap"].copy()
    if not (luck3 or luckft): return hp, ap
    sh = R["shots"]; tot = {}
    for s in seasons:
        m = R["season"] == s
        if m.any(): tot[s] = sh[m].sum(0)
    acc = np.zeros(8); rate = {}
    for i, s in enumerate(seasons):
        if s not in tot: continue
        base = acc if acc[0] > 0 else tot[s]
        rate[s] = ((base[1] + base[5]) / (base[0] + base[4]), (base[3] + base[7]) / (base[2] + base[6]))  # FT%, 3P%
        acc = acc + tot[s]
    ft = np.array([rate[s][0] for s in R["season"]]); p3 = np.array([rate[s][1] for s in R["season"]])
    hp -= luckft * (sh[:, 1] - ft * sh[:, 0]) + luck3 * 3 * (sh[:, 3] - p3 * sh[:, 2])
    ap -= luckft * (sh[:, 5] - ft * sh[:, 4]) + luck3 * 3 * (sh[:, 7] - p3 * sh[:, 6])
    return hp, ap


def refits(box, seasons, cadence):
    out = []
    for s in seasons:
        days = box[s]["days"]
        for i, dd in enumerate(days):
            if i % cadence == cadence - 1 or i == len(days) - 1: out.append((epoch(dd), s, dd))
    return out


def box_vec(box, players, s, day):
    v = np.zeros(len(players))
    b = box[s]; arr = b["after"][day] if day else b["start"]
    for a, x in zip(b["athletes"], arr):
        j = players.get(int(a))
        if j is not None: v[j] = x
    return v


def run(box, seasons, R, players, o):
    P = len(players); n = P + 1
    A = np.zeros((n, n)); b = np.zeros(n)
    f = 0.5 ** (1 / o["hl"])
    gt = garbage(R, o["gt"])
    hp, ap = points(R, seasons, o["luck3"], o["luckft"])
    wt0 = R["w"] * np.where(gt, o["gtw"], 1.0) * np.where(R["po"] == 1, o["po"], 1.0)
    y = 100 * (hp - ap) / R["w"]
    m = len(wt0)
    cols = np.concatenate([R["H"], R["A"], np.full((m, 1), P)], 1)
    sg = np.concatenate([np.ones((m, 5)), -np.ones((m, 5)), np.ones((m, 1))], 1)
    ptr = 0; last_t = None; rec = []; cur_season = None
    for t, s, dd in refits(box, seasons, o["cadence"]):
        end = np.searchsorted(R["day"], t, side="right")
        if last_t is not None:
            dec = f ** (t - last_t); A *= dec; b *= dec
            if s != cur_season: A *= o["carry"]; b *= o["carry"]  # extra weight on (or off) earlier seasons
        cur_season = s
        last_t = t
        if end > ptr:
            sl = slice(ptr, end)
            w = wt0[sl] * f ** (t - R["day"][sl])
            k = end - ptr
            X = sparse.csr_matrix((sg[sl].ravel(), (np.repeat(np.arange(k), 11), cols[sl].ravel())), shape=(k, n))
            A += (X.T.multiply(w) @ X).toarray()
            b += X.T @ (w * y[sl])
        ptr = end
        bx0 = box_vec(box, players, s, dd)
        act = np.where(np.diag(A)[:P] > max(0.5, o["minposs"]))[0]
        ai = np.append(act, P)
        lam, kk = o["lam"], o["k"]
        M = A[np.ix_(ai, ai)].copy(); M[np.diag_indices(len(ai))] += np.append(np.full(len(act), lam), 1e-3)
        rhs = b[ai] + np.append(lam * kk * bx0[act], 0.0)
        sol = np.append(kk * bx0, 0.0); sol[ai] = solve(M, rhs, assume_a="pos")
        resid = np.zeros(P); resid[act] = sol[act] - kk * bx0[act]
        rec.append((s, dd, resid))
    return rec


def write(box, seasons, players, rec, out):
    by_day = {}
    for s, dd, r in rec: by_day.setdefault(s, []).append((dd, r))
    prev = None; kind = {}
    for s in seasons:
        b = box[s]; ath = [int(a) for a in b["athletes"]]
        idx = np.array([players.get(a, -1) for a in ath]); seen = idx >= 0; ix = np.maximum(idx, 0)
        vec = lambda ref: [0.0] * len(ath) if ref is None else [round(float(x), 3) for x in np.where(seen, ref[1][ix], 0.0)]
        rf = by_day.get(s, [])
        st = vec(prev); after = {}; j = -1; cur = prev
        for dd in b["days"]:
            while j + 1 < len(rf) and rf[j + 1][0] <= dd: j += 1; cur = rf[j]
            after[dd] = vec(cur)
        kind[s] = {"athletes": ath, "start": st, "after": after}
        if rf: prev = rf[-1]
    json.dump({"kinds": {"resid": kind}}, open(out, "w"), separators=(",", ":"))


def gtmargins(box, R, o, out):
    """Each game's final score with the points of its garbage-time stints taken out, for the team model's fit."""
    gt = garbage(R, o["gt"])
    tot = {}
    for g, h, a, isg in zip(R["gid"], R["hp"], R["ap"], gt):
        if isg: t = tot.setdefault(g, [0.0, 0.0]); t[0] += h; t[1] += a
    json.dump({g: [round(v[0]), round(v[1])] for g, v in tot.items()}, open(out, "w"))
    print(f"{len(tot)} games with garbage time, {gt.mean():.4f} of stints, {np.average(gt, weights=R['w']):.4f} of time")


def main():
    sdir, boxp, out = sys.argv[1:4]
    o = {"lam": 8000.0, "hl": 365.0, "k": 0.5, "cadence": 7, "gt": "none", "gtw": 0.0, "luck3": 0.0, "luckft": 0.0, "po": 1.0, "minposs": 0.0, "carry": 1.0, "gtmargins": 0}
    for kv in sys.argv[4:]:
        key, v = kv.split("="); o[key] = v if key == "gt" else float(v)
    o["cadence"] = int(o["cadence"])
    box = json.load(open(boxp))
    cache = os.path.join(sdir, "rows.pkl")
    if os.path.exists(cache): seasons, R, players = pickle.load(open(cache, "rb"))
    else: seasons, R, players = load(sdir, box); pickle.dump((seasons, R, players), open(cache, "wb"))
    if o["gtmargins"]: return gtmargins(box, R, o, out)
    rec = run(box, seasons, R, players, o)
    write(box, seasons, players, rec, out)
    print("wrote", out, o, flush=True)


if __name__ == "__main__":
    main()
