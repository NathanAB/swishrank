# Opening rosters, expected minutes and roster strength for every team-season, from what is known before its first game.
# python3 scripts/research/seed/rosters.py <S>      (S = scratchpad; reads <S>/seed/dump.json, <S>/seed/pre/preseason.json,
#                                                   <S>/pbp/apm.json; writes <S>/seed/rosters.json)
# A team's opening roster is:
#   1. every player with a line for it in an ESPN preseason game of the season (all before its first game), the player's
#      last preseason team winning when he played for two;
#   2. every player the NBA's injury report for the team's first game lists, any status (2019-20 on; published before tip);
#   3. players whose last regular-season team (season before) was this one, who played no preseason game for anyone and are
#      not on another team's report: "holdovers", kept with weight HOLD (likely injured or unsigned).
# Ratings are the v4 box rating at the season's start (dump.start; values read only earlier games), else the player's rating
# after the previous season's last day, else a rookie's replacement start; APM (resid) likewise from its walk-forward start.
import json, sys, math
from collections import defaultdict

S = sys.argv[1]
D = json.load(open(f"{S}/seed/dump.json"))
PRE = json.load(open(f"{S}/seed/pre/preseason.json"))
APM = json.load(open(f"{S}/pbp/apm.json"))["kinds"]["resid"]
ROOT = __file__.rsplit("/scripts/", 1)[0]
seasons = sorted(D)
GS = [1, 0.4, -0.7, 0.4, -0.4, 0.7, 0.3, 0.7, 1, 0.7, -1, -0.4]


def box(season):
    return json.load(open(f"{ROOT}/src/data/box/{season}.json"))["games"]


def games(season):
    return json.load(open(f"{ROOT}/src/data/games/{season}.json"))["games"]


def reports(season):
    try: return json.load(open(f"{ROOT}/src/data/nba-reports/{season}.json"))["games"]
    except FileNotFoundError: return {}


# Regular-season (and playoff) minutes per player per season, in date order, and each player's last team.
hist = {}
for s in seasons:
    bx = box(s); gs = sorted((g for g in games(s) if g["final"]), key=lambda g: (g["t"], g["id"]))
    mins = defaultdict(list); last_team = {}
    for g in gs:
        for abbr, lines in (bx.get(g["id"]) or {}).items():
            for l in lines:
                mins[l[0]].append(l[1]); last_team[l[0]] = abbr
    hist[s] = {"mins": mins, "team": last_team, "games": {a: sum(1 for g in gs if a in (g["home"], g["away"])) for a in D[s]["abbrs"]}}

out = {}
for i, s in enumerate(seasons):
    if i == 0: continue
    prev = seasons[i - 1]; d = D[s]; dp = D[prev]
    start = dict(zip(d["athletes"], d["start"])); endp = dict(zip(dp["athletes"], dp["end"]))
    rk = [start[a] for a in d["rookies"] if a in start]
    rookie_default = max(set(rk), key=rk.count) if rk else min(start.values())
    a_s = APM.get(s); a_p = APM.get(prev)
    apm_start = dict(zip(a_s["athletes"], a_s["start"])) if a_s else {}
    apm_prev = {}
    if a_p:
        lastday = max(a_p["after"]); apm_prev = dict(zip(a_p["athletes"], a_p["after"][lastday]))
    def rating(a):
        if a in start: return start[a], "start"
        if a in endp: return endp[a], "prev"
        return rookie_default, "rookie"
    def apm(a): return apm_start.get(a, apm_prev.get(a, 0.0))
    # preseason appearances
    pre_team = {}; pre_min = defaultdict(float); pre_gp = defaultdict(int); pre_starts = defaultdict(int); pre_gs = defaultdict(float)
    for g in sorted(PRE.get(s, []), key=lambda g: g["date"]):
        for abbr, lines in g["lines"].items():
            if abbr not in d["abbrs"]: continue
            for l in lines:
                pre_team[l[0]] = abbr; pre_min[l[0]] += l[1]; pre_gp[l[0]] += 1; pre_starts[l[0]] += l[14]; pre_gs[l[0]] += sum(w * l[j + 2] for j, w in enumerate(GS))
    rep = reports(s)
    on_report = {}; status = {}
    for abbr, gid in d["firstGames"].items():
        r = rep.get(gid)
        if not r: continue
        g = next(x for x in games(s) if x["id"] == gid)
        side = r.get("home" if g["home"] == abbr else "away") or {}
        for a, st in side.items(): on_report[int(a)] = abbr; status[(abbr, int(a))] = st
    hp = hist[prev]
    seen_pre = set(pre_team)
    teams = {}
    for abbr in d["abbrs"]:
        members = {}
        for a, t in pre_team.items():
            if t == abbr and on_report.get(a, abbr) == abbr: members[a] = ("pre", 1.0)
        for a, t in on_report.items():
            if t == abbr and a not in members: members[a] = ("report", 1.0)
        for a, t in hp["team"].items():
            if t == abbr and a not in members and a not in seen_pre and a not in on_report: members[a] = ("hold", None)
        rows = []
        for a, (src, w) in members.items():
            m = hp["mins"].get(a, [])
            r, rsrc = rating(a)
            rows.append({"a": a, "src": src, "mpg_last": sum(m) / len(m) if m else None, "gp_last": len(m), "last5": sum(m[-5:]) / len(m[-5:]) if m else None,
                         "pre_mpg": pre_min[a] / pre_gp[a] if pre_gp[a] else None, "pre_gp": pre_gp[a], "pre_starts": pre_starts[a], "pre_min": round(pre_min[a], 1), "pre_gs": round(pre_gs[a], 2), "last_team": hp["team"].get(a),
                         "box": round(r, 4), "rsrc": rsrc, "apm": round(apm(a), 4), "status": status.get((abbr, a))})
        teams[abbr] = rows
    pm = sum(pre_min.values()); out[s] = {"pre_mean36": 36 * sum(pre_gs.values()) / pm if pm else None, "teams": teams, "rookie_default": rookie_default, "has_pre": {abbr: any(r["src"] == "pre" for r in rows) for abbr, rows in teams.items()}}
    n = {k: sum(1 for rows in teams.values() for r in rows if r["src"] == k) for k in ("pre", "report", "hold")}
    print(s, "players by source", n, "teams without preseason", [k for k, v in out[s]["has_pre"].items() if not v], file=sys.stderr)
json.dump(out, open(f"{S}/seed/rosters.json", "w"))
