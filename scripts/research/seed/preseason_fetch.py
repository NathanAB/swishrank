# Fetch ESPN's NBA preseason (exhibition, seasontype=1) games and their box scores, every season on file.
# python3 scripts/research/seed/preseason_fetch.py <outDir>
#   <outDir>/sb/<YYYYMMDD>.json      scoreboard day (raw events list, compact)
#   <outDir>/games/<id>.json         compact box: {id, date, season, teams:{home,away abbr/id/score}, lines:{abbr:[[athlete, MIN, PTS, FGM, FGA, FTM, FTA, OREB, DREB, AST, STL, BLK, TO, PF, starter]]}}
#   <outDir>/preseason.json          everything merged by season
# Research only. Public JSON, at most 8 concurrent requests, generic User-Agent, every response cached on disk.
import gzip, json, os, random, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
SB = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={}&seasontype=1&limit=100"
SUM = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={}"
UA = "Mozilla/5.0 (compatible; research-client)"


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
            time.sleep(min(60, 2 ** k + random.random()))
        except Exception:
            time.sleep(min(60, 2 ** k + random.random()))
    raise RuntimeError("fetch failed: " + url)


def cached(path, url, fn):
    if os.path.exists(path): return json.load(open(path))
    d = get(url)
    out = fn(d) if d is not None else None
    tmp = path + ".tmp"; json.dump(out, open(tmp, "w")); os.replace(tmp, path)
    return out


def sb_compact(d):
    ev = []
    for e in d.get("events", []):
        c = e["competitions"][0]
        if (e.get("season") or {}).get("type") not in (1, None): continue
        ev.append({"id": e["id"], "date": e["date"], "type": (e.get("season") or {}).get("type"), "completed": c["status"]["type"].get("completed"),
                   "teams": {t["homeAway"]: {"id": t["team"]["id"], "abbr": t["team"].get("abbreviation"), "score": t.get("score")} for t in c["competitors"]}})
    return ev


def num(x):
    try: return float(x)
    except Exception: return None


def box_compact(d):
    comp = d["header"]["competitions"][0]
    teams = {c["homeAway"]: {"id": c["team"]["id"], "abbr": c["team"].get("abbreviation"), "score": c.get("score")} for c in comp["competitors"]}
    lines = {}
    for side in d.get("boxscore", {}).get("players", []):
        abbr = side["team"].get("abbreviation")
        for st in side.get("statistics", []):
            lab = st.get("labels") or []
            ix = {l: i for i, l in enumerate(lab)}
            for a in st.get("athletes", []):
                s = a.get("stats") or []
                if not s or "id" not in a.get("athlete", {}) or "MIN" not in ix: continue
                mn = num(s[ix["MIN"]])
                if not mn: continue
                def pair(k):
                    try: m, t = s[ix[k]].split("-"); return int(m), int(t)
                    except Exception: return 0, 0
                fgm, fga = pair("FG"); ftm, fta = pair("FT")
                g = lambda k: int(num(s[ix[k]]) or 0) if k in ix else 0
                lines.setdefault(abbr, []).append([int(a["athlete"]["id"]), mn, g("PTS"), fgm, fga, ftm, fta, g("OREB"), g("DREB"), g("AST"), g("STL"), g("BLK"), g("TO"), g("PF"), int(bool(a.get("starter")))])
    return {"id": comp["id"], "date": comp.get("date"), "teams": teams, "lines": lines}


def main():
    out = sys.argv[1]
    os.makedirs(out + "/sb", exist_ok=True); os.makedirs(out + "/games", exist_ok=True)
    seasons = [s["id"] for s in json.load(open(os.path.join(ROOT, "src/data/seasons.json")))]
    days = []
    for s in sorted(seasons):
        g = json.load(open(os.path.join(ROOT, f"src/data/games/{s}.json")))["games"]
        first = date.fromisoformat(min(x["t"] for x in g)[:10])
        for k in range(1, 40): days.append((s, (first - timedelta(days=k)).strftime("%Y%m%d")))
    with ThreadPoolExecutor(8) as ex:
        sbs = list(ex.map(lambda sd: (sd[0], sd[1], cached(f"{out}/sb/{sd[1]}.json", SB.format(sd[1]), sb_compact)), days))
    events = {}
    for s, day, ev in sbs:
        for e in ev or []:
            if e["type"] == 1 and e["completed"]: events[e["id"]] = (s, e)
    print("preseason events", len(events), file=sys.stderr)
    ids = sorted(events)
    with ThreadPoolExecutor(8) as ex:
        boxes = list(ex.map(lambda i: cached(f"{out}/games/{i}.json", SUM.format(i), box_compact), ids))
    merged = {}
    for i, b in zip(ids, boxes):
        s, e = events[i]
        if b is None: continue
        b["season"] = s; b["date"] = b.get("date") or e["date"]
        merged.setdefault(s, []).append(b)
    json.dump(merged, open(out + "/preseason.json", "w"))
    for s in sorted(merged):
        n = len(merged[s]); nl = sum(1 for b in merged[s] if b["lines"])
        print(s, "games", n, "with box", nl, file=sys.stderr)


if __name__ == "__main__":
    main()
