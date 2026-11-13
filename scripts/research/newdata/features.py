# Build pre-tip game features from new data (ESPN game metadata, ESPN athlete attributes, basketball-reference coaches)
# and from data on file (games, box scores), one row per game, oriented home minus away where it has a side.
# <venv>/bin/python scripts/research/newdata/features.py <scratchpad>  -> <scratchpad>/newdata/feat.pkl
# Every feature reads only games strictly before the game's day (or facts fixed before tip: schedule, venue, crew,
# national TV, attendance policy, birth dates, heights). Research only.
import sys, os, json, re, glob, math, numpy as np, pandas as pd
from collections import defaultdict, deque

S = sys.argv[1]; ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
N = S + "/newdata"
df = pd.read_pickle(S + "/df3.pkl").sort_values(["t", "id"]).reset_index(drop=True)
df["dt"] = pd.to_datetime(df.day)

from features_geo import ARENA, CITY, miles  # noqa: E402

meta = {}
for f in glob.glob(N + "/meta/*/*.json"):
    meta[os.path.basename(f)[:-5]] = json.load(open(f))
ath = json.load(open(N + "/athletes.json")) if os.path.exists(N + "/athletes.json") else {}


def venue_of(r):
    m = meta.get(r.id)
    return CITY[m["venue"][2]] if m and m["venue"][2] in CITY else ARENA[r.home]


df["venue"] = [venue_of(r) for r in df.itertuples()]
df["vname"] = [meta.get(i, {}).get("venue", [None, None])[1] for i in df.id]

# ---------- per-team walk: travel, home/road streaks, load ----------
F = defaultdict(dict)  # id -> features
last = {}  # team -> (dt, venue, was_home)
legs = defaultdict(deque)  # team -> (dt, miles)
lasthome = {}
streak = defaultdict(int)  # +home streak / -road streak
for r in df.itertuples():
    for side, team, home in (("h", r.home, True), ("a", r.away, False)):
        here = r.venue
        if team in last:
            pdt, pv, ph = last[team]
            mi = miles(pv, here); tz = here[3] - pv[3]; gap = (r.dt - pdt).days
        else:
            mi, tz, gap = 0.0, 0, 9
        q = legs[team]; q.append((r.dt, mi))
        while q and (r.dt - q[0][0]).days > 6: q.popleft()
        F[r.id][f"mi_{side}"] = mi
        F[r.id][f"mi7_{side}"] = sum(x for _, x in q)
        F[r.id][f"tz_{side}"] = tz  # + = moved east
        F[r.id][f"tzabs_{side}"] = abs(tz)
        F[r.id][f"eastb2b_{side}"] = float(tz > 0 and gap == 1)
        F[r.id][f"sincehome_{side}"] = min(30, (r.dt - lasthome[team]).days) if team in lasthome else 0
        F[r.id][f"streak_{side}"] = streak[team]
        F[r.id][f"bodyhome_{side}"] = ARENA[team][3] - here[3]  # body-clock offset of venue vs home zone
        is_home = home and not r.neutral
        streak[team] = (max(0, streak[team]) + 1) if is_home else (min(0, streak[team]) - 1)
        if is_home: lasthome[team] = r.dt
        last[team] = (r.dt, here, is_home)

# ---------- player minutes from box ----------
box = {}
for f in sorted(glob.glob(ROOT + "/src/data/box/*.json")):
    for gid, sides in json.load(open(f))["games"].items(): box[gid] = sides
pmin = defaultdict(list)  # athlete -> [(dt, minutes, team)]
team_games = defaultdict(list)  # team -> [dt]
first_team = {}  # (athlete, team) -> games with team so far
gcount = defaultdict(int)
teams_of = defaultdict(set)
missed_run = {}  # athlete -> consecutive team games missed (for players on the team's roster)
roster_last = defaultdict(dict)  # team -> athlete -> index of team's last game the player played

def lineup_feats(lu, team, dt, idx):
    out = {}
    if not lu: return dict(load3=0, load7=0, back=0, backv=0, newp=0, age=np.nan, ht=np.nan, wt=np.nan, exp=np.nan)
    sh = np.array([p[1] for p in lu]); tot = sh.sum() or 1
    l3 = l7 = back = backv = newp = 0.0; ages = []; hts = []; wts = []; exps = []
    for a, s, v, c in lu:
        hist = pmin.get(a, [])
        m3 = sum(m for d, m, _ in hist[-6:] if 0 < (dt - d).days <= 3)
        m7 = sum(m for d, m, _ in hist[-10:] if 0 < (dt - d).days <= 7)
        l3 += s * m3; l7 += s * m7
        li = roster_last[team].get(a)
        gap = idx - li - 1 if li is not None else 0
        if gap >= 5: back += s; backv += s * v
        if gcount[(a, team)] < 10 and len(teams_of[a] - {team}) > 0: newp += s
        at = ath.get(str(a)) or {}
        if at.get("dob"): ages.append((s, (dt - pd.Timestamp(at["dob"][:10])).days / 365.25))
        if at.get("h"): hts.append((s, at["h"]))
        if at.get("w"): wts.append((s, at["w"]))
        if at.get("debut"): exps.append((s, dt.year + (dt.month >= 8) - at["debut"]))
    wavg = lambda xs: sum(s * x for s, x in xs) / sum(s for s, _ in xs) if xs else np.nan
    return dict(load3=l3 / tot, load7=l7 / tot, back=back, backv=backv, newp=newp, age=wavg(ages), ht=wavg(hts), wt=wavg(wts), exp=wavg(exps))

for day, g in df.groupby("dt", sort=True):
    for r in g.itertuples():
        for side, team, lu in (("h", r.home, r.luh), ("a", r.away, r.lua)):
            for k, v in lineup_feats(lu, team, r.dt, len(team_games[team])).items(): F[r.id][f"{k}_{side}"] = v
    for r in g.itertuples():
        for team in (r.home, r.away):
            idx = len(team_games[team]); team_games[team].append(r.dt)
            for l in (box.get(r.id, {}).get(team) or []):
                pmin[l[0]].append((r.dt, l[1], team)); roster_last[team][l[0]] = idx; gcount[(l[0], team)] += 1; teams_of[l[0]].add(team)

# ---------- standings and stakes (regular season), playoff series state ----------
conf = {t: "E" for t in ["ATL", "BKN", "BOS", "CHA", "CHI", "CLE", "DET", "IND", "MIA", "MIL", "NY", "ORL", "PHI", "TOR", "WSH"]}
conf.update({t: "W" for t in ARENA if t not in conf})
sched = {}
for f in sorted(glob.glob(ROOT + "/src/data/games/*.json")):
    d = json.load(open(f)); sched[d["season"]] = d["games"]
for season, g in df.groupby("season"):
    total = defaultdict(int)
    for x in sched[season]:
        n = x.get("note") or ""
        if not n.startswith(("East ", "West ", "NBA Finals", "NBA Play-In")) and "Championship" not in n:
            total[x["home"]] += 1; total[x["away"]] += 1
    W = defaultdict(int); L = defaultdict(int)
    for day, gd in g.groupby("dt", sort=True):
        for r in gd.itertuples():
            if r.playoff: continue
            for side, t in (("h", r.home), ("a", r.away)):
                c = conf[t]; teams = [x for x in ARENA if conf[x] == c]; others = [x for x in teams if x != t]
                rem = {x: max(0, min(82, total[x]) - W[x] - L[x]) for x in teams}
                best = sorted((W[x] + rem[x] for x in others), reverse=True); worst = sorted((W[x] for x in others), reverse=True)
                elim = float(worst[9] > W[t] + rem[t])
                clin6 = float(sum(b >= W[t] for b in best) <= 5)
                above = [W[x] for x in others if W[x] > W[t]]; below = [W[x] + rem[x] for x in others if W[x] <= W[t]]
                locked = float((not above or min(above) > W[t] + rem[t]) and (not below or max(below) < W[t]) and rem[t] < 20)
                F[r.id].update({f"elim_{side}": elim, f"clin6_{side}": clin6, f"locked_{side}": locked, f"nostake_{side}": float(elim or locked), f"rem_{side}": rem[t]})
        for r in gd.itertuples():
            if r.playoff: continue
            if r.y == 1: W[r.home] += 1; L[r.away] += 1
            else: W[r.away] += 1; L[r.home] += 1

# playoffs: series state from games before
series = defaultdict(list)
for r in df[df.playoff == 1].itertuples():
    key = (r.season, frozenset((r.home, r.away)))
    prev = series[key]
    wh = sum(1 for (w) in prev if w == r.home); wa = sum(1 for w in prev if w == r.away)
    F[r.id].update(dict(sgame=len(prev) + 1, slead=wh - wa, elim_game=float(wh == 3 or wa == 3), lostlast_h=float(bool(prev) and prev[-1] != r.home), g7=float(len(prev) == 6)))
    series[key].append(r.home if r.y == 1 else r.away)

# ---------- referees, attendance, TV ----------
for r in df.itertuples():
    m = meta.get(r.id)
    if not m: continue
    F[r.id]["refs"] = tuple(sorted(x[0] for x in m["refs"] if x[0]))
    F[r.id]["att"] = m["att"] if m["att"] is not None else np.nan
    nat = [x[0] for x in m["tv"] if x[1] == "National"]
    F[r.id]["natTV"] = float(any(n in ("ESPN", "TNT", "ABC", "NBC", "Prime Video", "Amazon Prime Video", "Peacock") for n in nat))
    F[r.id]["nbatv"] = float("NBA TV" in nat)
    tm = m.get("teams", {})
    def num(t, k):
        try: return float(tm.get(t, {}).get(k))
        except Exception: return np.nan
    def two(t, k, i):
        try: return float(str(tm.get(t, {}).get(k)).split("-")[i])
        except Exception: return np.nan
    for side, t in (("h", r.home), ("a", r.away)):
        F[r.id][f"pf_{side}"] = num(t, "fouls") if not np.isnan(num(t, "fouls")) else num(t, "totalFouls")
        F[r.id][f"3pa_{side}"] = two(t, "threePointFieldGoalsMade-threePointFieldGoalsAttempted", 1)
        F[r.id][f"fga_{side}"] = two(t, "fieldGoalsMade-fieldGoalsAttempted", 1)
        F[r.id][f"fta_{side}"] = two(t, "freeThrowsMade-freeThrowsAttempted", 1)
        F[r.id][f"tov_{side}"] = num(t, "totalTurnovers") if not np.isnan(num(t, "totalTurnovers")) else num(t, "turnovers")
        F[r.id][f"orb_{side}"] = num(t, "offensiveRebounds")
        F[r.id][f"drb_{side}"] = num(t, "defensiveRebounds")


# ---------- mid-season coaching changes (basketball-reference season coach tables) ----------
BB = {"BRK": "BKN", "CHO": "CHA", "GSW": "GS", "NOP": "NO", "NYK": "NY", "PHO": "PHX", "SAS": "SA", "UTA": "UTAH", "WAS": "WSH"}
change_at = {}  # (season, team) -> regular-season game number after which a new coach took over
for path in glob.glob(N + "/bbref/NBA_*_coaches.html"):
    y = int(re.search(r"NBA_(\d+)_", path).group(1)); season = f"{y - 1}-{str(y)[2:]}"
    rows = defaultdict(list)
    for tr in re.findall(r'<tr ><th scope="row".*?</tr>', open(path, encoding="utf-8", errors="ignore").read()):
        cell = lambda k: (re.search(rf'data-stat="{k}" >(?:<a[^>]*>)?([^<]*)', tr) or [None, ""])[1]
        try: rows[BB.get(cell("team"), cell("team"))].append((int(cell("cur_g") or 0), int(cell("fr_g") or 0)))
        except ValueError: pass
    for t, cs in rows.items():
        if len(cs) < 2: continue
        first = max(cs, key=lambda c: c[1] - c[0])
        change_at[(season, t)] = first[0]
regn = defaultdict(int)
for r in df.itertuples():
    if r.playoff: continue
    for side, t in (("h", r.home), ("a", r.away)):
        c = change_at.get((r.season, t))
        k = regn[(r.season, t)]
        F[r.id][f"newcoach_{side}"] = float(c is not None and c <= k < c + 20)
        regn[(r.season, t)] += 1

feat = pd.DataFrame.from_dict(F, orient="index")
feat.index.name = "id"
out = df.set_index("id")[["season", "t", "day", "dt", "d", "home", "away", "hs", "as", "neutral", "note", "playoff", "e4", "cm", "res", "y", "kh", "ka", "b2bh", "b2ba", "resth", "resta", "venue", "vname"]].join(feat)
out.to_pickle(N + "/feat_raw.pkl")
print(out.shape, out.columns.tolist())
