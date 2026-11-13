# How well each candidate centre, as a seed-rules spec holds it, explains team results: R^2 and slope of each team-season's
# mean counted margin over its first 20 and all games on the centre, tuning (2016-17..2022-23) and exploration seasons.
# python3 scripts/research/seed/diag3.py <S> <spec.json>[,...]   (the win-total centres from dump.json are the baseline row)
import sys, json, numpy as np, importlib.util
spec = importlib.util.spec_from_file_location("seed", __file__.rsplit("/", 1)[0] + "/seed.py"); sd = importlib.util.module_from_spec(spec); spec.loader.exec_module(sd)
S = sys.argv[1]; V = {}
for f in sys.argv[2].split(","): V.update(json.load(open(f))["variants"])
res = {s: sd.team_results(s) for s in sd.TUNE + sd.EXPL}
cands = {"win totals": {s: sd.D[s]["winCentres"] for s in res}}
cands.update({n: v["centres"] for n, v in V.items() if "centres" in v})
for n, c in cands.items():
    o = [f"{n:22s}"]
    for lab, ss in (("tune", sd.TUNE), ("expl", sd.EXPL)):
        for j, yn in ((0, "y20"), (1, "y82")):
            x = np.array([c[s][a] for s in ss for a in sd.D[s]["abbrs"]]); y = np.array([res[s][a][j] for s in ss for a in sd.D[s]["abbrs"]])
            r = np.corrcoef(x, y)[0, 1]; o.append(f"{lab} {yn} R2 {r*r:.3f}")
    print("  ".join(o))
