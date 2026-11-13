# Fetch fixed attributes (height, weight, birth date, position) of every athlete with a box line, from ESPN's public
# core API. python3 scripts/research/newdata/espn_athletes.py <outFile.json> [workers]
# Research only. At most 8 concurrent requests (default 6), backoff, cached: re-runs fetch only missing athletes.
import json, os, random, sys, time, urllib.request, urllib.error, glob
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
URL = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes/{}?lang=en&region=us"
UA = "Mozilla/5.0 (compatible; research-client)"


def get(url, tries=6):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 404: return {}
            time.sleep(min(60, 2 ** k + random.random()))
        except Exception:
            time.sleep(min(60, 2 ** k + random.random()))
    return None


def one(a):
    d = get(URL.format(a))
    if d is None: return a, None
    return a, {"h": d.get("height"), "w": d.get("weight"), "dob": d.get("dateOfBirth"), "pos": ((d.get("position") or {}).get("$ref") or "").split("?")[0].rsplit("/", 1)[-1],
               "debut": (d.get("debutYear")), "draft": (d.get("draft") or {}).get("year")}


def main():
    out = sys.argv[1]; workers = min(8, int(sys.argv[2]) if len(sys.argv) > 2 else 6)
    have = json.load(open(out)) if os.path.exists(out) else {}
    ids = set()
    for f in glob.glob(os.path.join(ROOT, "src/data/box/*.json")):
        for sides in json.load(open(f))["games"].values():
            for lines in sides.values():
                for l in lines: ids.add(str(l[0]))
    todo = sorted(ids - set(k for k, v in have.items() if v is not None))
    print(len(ids), "athletes,", len(todo), "to fetch", flush=True)
    with ThreadPoolExecutor(workers) as ex:
        for i, (a, v) in enumerate(ex.map(one, todo)):
            have[a] = v
            if i % 300 == 0:
                print(i, flush=True); json.dump(have, open(out, "w"))
    json.dump(have, open(out, "w"))
    print("done", sum(v is not None for v in have.values()), flush=True)


if __name__ == "__main__":
    main()
