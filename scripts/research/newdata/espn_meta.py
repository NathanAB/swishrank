# Fetch ESPN's public game summary for every final game and keep only game metadata the pbp cache dropped:
# venue, attendance, officiating crew, broadcasts, playoff series note, team statistics (fouls, technicals).
# Betting fields (pickcenter, odds, againstTheSpread) and post-fetch snapshots (standings, injuries, news) are discarded.
# python3 scripts/research/newdata/espn_meta.py <cacheDir> <season,...|all> [workers]
# Research only. At most 8 concurrent requests (default 6), exponential backoff, nothing fetched twice.
import gzip, json, os, random, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={}"
UA = "Mozilla/5.0 (compatible; research-client)"
STOP = {"n": 0}


def get(url, tries=6):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip": raw = gzip.decompress(raw)
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            if e.code in (403, 429): STOP["n"] += 1
            time.sleep(min(60, 2 ** k + random.random()))
        except Exception:
            time.sleep(min(60, 2 ** k + random.random()))
    return None


def compact(d):
    gi = d.get("gameInfo", {})
    v = gi.get("venue", {})
    comp = d["header"]["competitions"][0]
    teams = {}
    for t in d.get("boxscore", {}).get("teams", []):
        teams[t["team"]["abbreviation"]] = {s.get("name"): s.get("displayValue") for s in t.get("statistics", [])}
    return {
        "venue": [v.get("id"), v.get("fullName"), v.get("address", {}).get("city"), v.get("address", {}).get("state")],
        "att": gi.get("attendance"),
        "refs": [[o.get("displayName"), (o.get("position") or {}).get("name"), o.get("order")] for o in gi.get("officials", [])],
        "tv": [[(b.get("media") or {}).get("shortName"), (b.get("market") or {}).get("type")] for b in comp.get("broadcasts", [])],
        "series": comp.get("series"), "notes": comp.get("notes"), "neutral": comp.get("neutralSite"),
        "home": [c["team"]["abbreviation"] for c in comp["competitors"] if c["homeAway"] == "home"],
        "teams": teams,
    }


def fetch_one(args):
    cache, season, gid = args
    path = os.path.join(cache, season, f"{gid}.json")
    if os.path.exists(path): return "cached"
    if STOP["n"] > 20: return "stopped"
    d = get(URL.format(gid))
    if d is None: return "fail"
    try: c = compact(d)
    except Exception as e: return f"bad:{e}"
    with open(path + ".tmp", "w") as f: json.dump(c, f, separators=(",", ":"))
    os.replace(path + ".tmp", path)
    return "ok"


def main():
    cache, which = sys.argv[1], sys.argv[2]
    workers = min(8, int(sys.argv[3]) if len(sys.argv) > 3 else 6)
    seasons = sorted((s["id"] for s in json.load(open(os.path.join(ROOT, "src/data/seasons.json")))), reverse=True)
    seasons = [s for s in seasons if which == "all" or s in which.split(",")]
    jobs = []
    for s in seasons:
        os.makedirs(os.path.join(cache, s), exist_ok=True)
        jobs += [(cache, s, g["id"]) for g in json.load(open(os.path.join(ROOT, f"src/data/games/{s}.json")))["games"] if g["final"]]
    t0 = time.time(); stats = {}
    with ThreadPoolExecutor(workers) as ex:
        for i, r in enumerate(ex.map(fetch_one, jobs)):
            stats[r] = stats.get(r, 0) + 1
            if i % 500 == 0: print(f"{i}/{len(jobs)} {stats} {time.time() - t0:.0f}s", flush=True)
    print("done", stats, f"{time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
