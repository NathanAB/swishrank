# Refetch ESPN game summaries (same host and limits as scripts/research/pbp/espn.py) and cache, per game, one entry per
# play aligned with the compact cache's plays: points attempted (0 for non-shots, 1 for free throws, 2 or 3) and made.
# python3 scripts/research/pbp2/espn_shots.py <cacheDir> <season,...|all>
# pointsAttempted when the feed has it, else read from the play text ("three point", "free throw"). Research only.
import gzip, json, os, sys, time
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "pbp"))
from espn import get, URL, ROOT  # noqa: E402


def shots(d):
    out = []
    for p in d.get("plays", []):
        if not p.get("shootingPlay"):
            out.append([0, 0]); continue
        t = (p.get("text") or "").lower(); typ = p["type"].get("text", "")
        pa = p.get("pointsAttempted")
        if "Free Throw" in typ: pa = 1
        elif pa not in (2, 3): pa = 3 if "three point" in t else 2
        made = int(bool(p.get("scoringPlay"))) if "scoringPlay" in p else int(" makes " in t)
        out.append([pa, made])
    return out


def fetch_one(args):
    cache, season, gid = args
    path = os.path.join(cache, season, f"{gid}.json.gz")
    if os.path.exists(path): return "cached"
    d, n = get(URL.format(gid))
    if d is None: return "fail" if n < 0 else "missing"
    try: c = shots(d)
    except Exception: return "bad"
    tmp = path + ".tmp"
    with gzip.open(tmp, "wt") as f: json.dump(c, f, separators=(",", ":"))
    os.replace(tmp, path)
    return "ok"


def main():
    cache, which = sys.argv[1], sys.argv[2]
    seasons = sorted((s["id"] for s in json.load(open(os.path.join(ROOT, "src/data/seasons.json")))), reverse=True)
    seasons = [s for s in seasons if (which == "all" or s in which.split(",")) and s >= "2015-16"]
    jobs = []
    for s in seasons:
        os.makedirs(os.path.join(cache, s), exist_ok=True)
        jobs += [(cache, s, g["id"]) for g in json.load(open(os.path.join(ROOT, f"src/data/games/{s}.json")))["games"] if g["final"]]
    t0 = time.time(); stats = {}
    with ThreadPoolExecutor(8) as ex:
        for i, st in enumerate(ex.map(fetch_one, jobs)):
            stats[st] = stats.get(st, 0) + 1
            if i % 1000 == 0: print(f"{i}/{len(jobs)} {time.time() - t0:.0f}s {stats}", flush=True)
    print("done", len(jobs), f"{time.time() - t0:.0f}s", stats, flush=True)


if __name__ == "__main__":
    main()
