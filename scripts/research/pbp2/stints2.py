# Copy of scripts/research/pbp/stints.py that also keeps, per stint: period, game seconds elapsed at its start, the home
# margin at its start, starters on the floor per side, and per side free throws and threes attempted and made (from
# espn_shots.py's cache, aligned with the compact plays; zeros when a game has none).
# python3 scripts/research/pbp2/stints2.py <cacheDir> <shotsDir> <outDir> [season,...]
# Writes <outDir>/<season>.json: {gameId: {"stints": [[home5], [away5], secs, homePts, awayPts, poss, period, t0, m0,
#   homeStarters, awayStarters, [hFTA, hFTM, h3PA, h3PM, aFTA, aFTM, a3PA, a3PM]], "check": {...}}}
# and prints the per-season checks: reconstructed minutes vs box MIN, reconstructed on-court +/- vs box +/-.
# Period-start fives are not in the feed: a player whose first mention in a period is anything but entering as a
# substitute was on the floor at its start. Short of five, the five who ended the last period (and are not seen
# entering) fill in, then the most-minutes players not seen entering; over five, the most-minutes five stay.
import gzip, json, os, sys

REPAIR = os.environ.get("REPAIR", "1") == "1"  # REPAIR=0: no in-period repairs, for the probe
IGNORE = ("Technical", "Ejection", "Delay", "Coach")  # can name a bench player; Free Throw - Technical and 3-Seconds kept


def secs(clock):
    if ":" in clock:
        m, s = clock.split(":"); return int(m) * 60 + float(s)
    return float(clock)


def ignorable(typ):
    return any(w in typ for w in IGNORE) and "Free Throw" not in typ and "3-Seconds" not in typ


def build(c, shots=None):
    home, away = c["teams"]["home"]["id"], c["teams"]["away"]["id"]
    box = c["box"]
    team = {a: v[0] for a, v in box.items()}
    mins = {a: (v[2] or 0) for a, v in box.items()}
    plays = c["plays"]
    shot_of = {id(p): sh for p, sh in zip(plays, shots)} if shots is not None and len(shots) == len(plays) else {}
    starters = {a for a, v in box.items() if v[1]}
    periods = sorted({p[0] for p in plays})
    on = {home: set(), away: set()}
    segs = []  # [homeSet, awaySet, secs, hpts, apts, hposs, aposs]
    fixes = 0; bad = 0; repairs = 0
    hs = as_ = 0
    for per in periods:
        length = 720 if per <= 4 else 300
        pp = [p for p in plays if p[0] == per]
        first = {}
        for p in pp:
            typ, parts = p[2], p[4]
            if typ == "Substitution" and len(parts) >= 2:
                first.setdefault(parts[0], "in"); first.setdefault(parts[1], "start")
            elif not ignorable(typ):
                for a in parts: first.setdefault(a, "start")
        prev_end = {t: set(on[t]) for t in on}
        for t in (home, away):
            if per == 1:
                start = {a for a, v in box.items() if v[0] == t and v[1]}
                if len(start) == 5:
                    on[t] = start; continue
            start = {a for a, k in first.items() if k == "start" and team.get(a) == t}
            if len(start) < 5:
                fixes += 1
                for a in sorted(prev_end[t], key=lambda a: -mins.get(a, 0)):
                    if len(start) < 5 and a not in first: start.add(a)
                for a in sorted((a for a in box if team[a] == t), key=lambda a: -mins.get(a, 0)):
                    if len(start) < 5 and a not in first: start.add(a)
            elif len(start) > 5:
                fixes += 1
                start = set(sorted(start, key=lambda a: -mins.get(a, 0))[:5])
            on[t] = start
        tprev = 0.0
        cur = None

        base = (per - 1) * 720 if per <= 4 else 2880 + (per - 5) * 300

        def open_seg():
            return [frozenset(on[home]), frozenset(on[away]), 0.0, 0, 0, 0.0, 0.0, per, base + tprev, hs - as_, [0] * 8]
        cur = open_seg(); segs.append(cur)
        seen = {}
        subbed = {(q[1], a) for q in pp if q[2] == "Substitution" for a in q[4]}  # mentions around a sub at the same clock are out of order
        for n, p in enumerate(pp):
            t = min(length, max(tprev, length - secs(p[1])))
            cur[2] += t - tprev; tprev = t
            h = p[5] if p[5] is not None else hs; a_ = p[6] if p[6] is not None else as_
            cur[3] += h - hs; cur[4] += a_ - as_; hs, as_ = h, a_
            typ, tid = p[2], p[3]
            sh = shot_of.get(id(p))
            if sh and sh[0] in (1, 3) and tid in (home, away):
                o = (0 if tid == home else 4) + (0 if sh[0] == 1 else 2)
                cur[10][o] += 1; cur[10][o + 1] += sh[1]
            if tid in (home, away):
                k = 5 if tid == home else 6
                if p[7] and "Free Throw" not in typ: cur[k] += 1
                elif "Free Throw" in typ and "Technical" not in typ: cur[k] += 0.44
                elif typ == "Offensive Rebound": cur[k] -= 1
                elif "Turnover" in typ: cur[k] += 1
            changed = False
            if typ == "Substitution" and len(p[4]) >= 2:
                i, o = p[4][0], p[4][1]
                t2 = team.get(i) or team.get(o)
                if t2 not in on: continue
                if o not in on[t2] or i in on[t2]: bad += 1
                on[t2].discard(o); on[t2].add(i); seen[i] = n
                if len(on[t2]) > 5 and REPAIR: on[t2].discard(min((a for a in on[t2] if a != i), key=lambda a: seen.get(a, -1)))
                changed = True
            elif not ignorable(typ):
                # Someone who is not on the floor shows up in a play: a substitution is missing. He takes the place
                # of the teammate on the floor mentioned least recently.
                for a in p[4]:
                    t2 = team.get(a)
                    if t2 in on and a not in on[t2] and REPAIR and (p[1], a) not in subbed:
                        if len(on[t2]) >= 5: on[t2].discard(min(on[t2], key=lambda b: seen.get(b, -1)))
                        on[t2].add(a); repairs += 1; changed = True
                    seen[a] = n
            if changed: cur = open_seg(); segs.append(cur)
        cur[2] += length - tprev
    # merge consecutive identical lineups, drop empty
    st = []
    for s in segs:
        if st and st[-1][0] == s[0] and st[-1][1] == s[1]:
            for k in range(2, 7): st[-1][k] += s[k]
            st[-1][10] = [x + y for x, y in zip(st[-1][10], s[10])]
        elif s[2] > 0 or s[3] or s[4]:
            st.append(list(s))
    # checks
    sec = {}; pm = {}
    for s in st:
        for a in s[0]: sec[a] = sec.get(a, 0) + s[2]; pm[a] = pm.get(a, 0) + s[3] - s[4]
        for a in s[1]: sec[a] = sec.get(a, 0) + s[2]; pm[a] = pm.get(a, 0) + s[4] - s[3]
    errs = [abs(sec.get(a, 0) / 60 - v[2]) for a, v in box.items() if v[2] is not None and (v[2] > 0 or a in sec)]
    pms = [abs(pm.get(a, 0) - v[3]) for a, v in box.items() if v[3] is not None and v[2]]
    final_ok = (hs, as_)
    out = [[sorted(s[0]), sorted(s[1]), round(s[2], 1), s[3], s[4], round((s[5] + s[6]) / 2, 2), s[7], round(s[8], 1), s[9],
            len(starters & s[0]), len(starters & s[1]), s[10]] for s in st]
    five = sum(s[2] for s in out if len(s[0]) == 5 and len(s[1]) == 5) / max(1, sum(s[2] for s in out))
    check = {"minMAE": sum(errs) / max(1, len(errs)), "minMax": max(errs, default=0), "pmMAE": sum(pms) / max(1, len(pms)) if pms else None,
             "fixes": fixes, "badSubs": bad, "repairs": repairs, "five": five, "score": final_ok, "secs": sum(s[2] for s in out), "nplayers": len(errs)}
    return out, check


def main():
    cache, shotdir, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(outdir, exist_ok=True)
    seasons = sys.argv[4].split(",") if len(sys.argv) > 4 else sorted(os.listdir(cache))
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
    print("season  games  minMAE  pass(max<=2min) pass(<=3)  pmMAE  periodFixes/game  fiveShare  scoreMatch")
    for s in seasons:
        finals = {g["id"]: (g["hs"], g["as"]) for g in json.load(open(os.path.join(root, f"src/data/games/{s}.json")))["games"] if g["final"]}
        res = {}; rows = []
        for f in sorted(os.listdir(os.path.join(cache, s))):
            if not f.endswith(".json.gz"): continue
            gid = f[:-8]
            c = json.load(gzip.open(os.path.join(cache, s, f)))
            if not c["plays"] or len(c["box"]) < 10: rows.append(None); continue
            sp = os.path.join(shotdir, s, f)
            shots = json.load(gzip.open(sp)) if os.path.exists(sp) else None
            try: st, ch = build(c, shots)
            except Exception as e: print("ERR", gid, e); rows.append(None); continue
            ch["scoreMatch"] = tuple(ch["score"]) == tuple(finals.get(gid, (None, None)))
            ch["shots"] = shots is not None and len(shots) == len(c["plays"])
            res[gid] = {"stints": st, "check": ch}; rows.append(ch)
        ok = [r for r in rows if r]
        n = len(ok)
        if not n: print(s, "no games"); continue
        mean = lambda k: sum(r[k] for r in ok if r[k] is not None) / max(1, sum(r[k] is not None for r in ok))
        print(f"{s} shots {sum(r['shots'] for r in ok)} {s}  {n:5d}/{len(rows):<5d} {mean('minMAE'):.3f}  {sum(r['minMax'] <= 2 for r in ok) / n:.3f}  {sum(r['minMax'] <= 3 for r in ok) / n:.3f}  {mean('pmMAE'):.3f}  {mean('fixes'):.2f}  {mean('five'):.4f}  {sum(r['scoreMatch'] for r in ok) / n:.3f}", flush=True)
        json.dump(res, open(os.path.join(outdir, f"{s}.json"), "w"), separators=(",", ":"))


if __name__ == "__main__":
    main()
