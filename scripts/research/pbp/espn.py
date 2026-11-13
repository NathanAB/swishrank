# Fetch ESPN's public game summary (play-by-play + box score) for NBA games and cache a compact extract per game.
# python3 scripts/research/pbp/espn.py <cacheDir> <season,...|all> [perSeason]
#   perSeason: fetch only that many games per season (spread over the season), for the feasibility probe.
# Research only. At most 8 concurrent requests, exponential backoff, nothing fetched twice (cache = extract on disk).
import gzip, json, os, random, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={}"
UA = "Mozilla/5.0 (compatible; research-client)"


def get(url, tries=6):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip": raw = gzip.decompress(raw)
                return json.loads(raw), len(raw)
        except urllib.error.HTTPError as e:
            if e.code == 404: return None, 0
            time.sleep(min(60, 2 ** k + random.random()))
        except Exception:
            time.sleep(min(60, 2 ** k + random.random()))
    return None, -1


def compact(d):
    """Only what stint building needs: teams, box (team, starter, MIN, +/-), plays as tuples."""
    comp = d["header"]["competitions"][0]
    teams = {c["homeAway"]: {"id": c["team"]["id"], "abbr": c["team"].get("abbreviation")} for c in comp["competitors"]}
    box = {}
    for side in d.get("boxscore", {}).get("players", []):
        tid = side["team"]["id"]
        for st in side.get("statistics", []):
            labels = st.get("labels") or st.get("names") or []
            iMin = labels.index("MIN") if "MIN" in labels else None
            iPm = labels.index("+/-") if "+/-" in labels else None
            for a in st.get("athletes", []):
                s = a.get("stats") or []
                if not s or "id" not in a.get("athlete", {}): continue
                def num(i):
                    try: return float(s[i])
                    except Exception: return None
                box[a["athlete"]["id"]] = [tid, int(bool(a.get("starter"))), num(iMin) if iMin is not None else None, num(iPm) if iPm is not None else None]
    plays = []
    for p in d.get("plays", []):
        plays.append([p["period"]["number"], p["clock"]["displayValue"], p["type"].get("text", ""), (p.get("team") or {}).get("id"),
                      [x["athlete"]["id"] for x in p.get("participants", []) if "athlete" in x], p.get("homeScore"), p.get("awayScore"),
                      int(bool(p.get("shootingPlay"))), p.get("text", "") if "Technical" in p["type"].get("text", "") or "eject" in p.get("text", "").lower() else ""])
    return {"teams": teams, "box": box, "plays": plays}


def fetch_one(args):
    cache, season, gid = args
    path = os.path.join(cache, season, f"{gid}.json.gz")
    if os.path.exists(path): return gid, "cached", 0
    d, n = get(URL.format(gid))
    if d is None: return gid, "fail" if n < 0 else "missing", 0
    try: c = compact(d)
    except Exception as e: return gid, f"bad:{e}", n
    tmp = path + ".tmp"
    with gzip.open(tmp, "wt") as f: json.dump(c, f, separators=(",", ":"))
    os.replace(tmp, path)
    return gid, "ok", n


def main():
    cache, which = sys.argv[1], sys.argv[2]
    per = int(sys.argv[3]) if len(sys.argv) > 3 else None
    seasons = sorted(json.load(open(os.path.join(ROOT, "src/data/seasons.json"))), key=lambda s: s["id"], reverse=True)
    seasons = [s["id"] for s in seasons if which == "all" or s["id"] in which.split(",")]
    jobs = []
    for s in seasons:
        os.makedirs(os.path.join(cache, s), exist_ok=True)
        games = [g["id"] for g in json.load(open(os.path.join(ROOT, f"src/data/games/{s}.json")))["games"] if g["final"]]
        if per: games = [games[int(i * (len(games) - 1) / max(1, per - 1))] for i in range(per)]
        jobs += [(cache, s, g) for g in games]
    t0 = time.time(); stats = {}; nbytes = 0
    with ThreadPoolExecutor(8) as ex:
        for i, (gid, st, n) in enumerate(ex.map(fetch_one, jobs)):
            k = st.split(":")[0]; stats[k] = stats.get(k, 0) + 1; nbytes += n
            if k in ("fail", "bad", "missing"): print("WARN", gid, st, flush=True)
            if i % 500 == 0: print(f"{i}/{len(jobs)} {time.time() - t0:.0f}s {stats} {nbytes / 1e6:.0f}MB", flush=True)
    print("done", len(jobs), f"{time.time() - t0:.0f}s", stats, f"{nbytes / 1e6:.0f}MB uncompressed", flush=True)


if __name__ == "__main__":
    main()
