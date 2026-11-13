# python fetch_team_stats.py <repo> <scratch>: each final game's team shooting (FGM/FGA, 3PM/3PA, FTM/FTA, points) for
# 2015-16 to 2025-26 from ESPN's public scoreboard, one request per US Eastern day. Caches each day's extracted numbers in
# <scratch>/sb-cache/<YYYYMMDD>.json so a rerun never refetches; writes <scratch>/team-stats.json {gameId: {abbr: {...}}}.
import json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
REPO, S = sys.argv[1], sys.argv[2]
CACHE = os.path.join(S, 'sb-cache'); os.makedirs(CACHE, exist_ok=True)
ET = ZoneInfo('America/New_York')
SEASONS = [f"{y}-{str(y+1)[2:]}" for y in range(2015, 2026)]
KEYS = {'fieldGoalsMade': 'fgm', 'fieldGoalsAttempted': 'fga', 'threePointFieldGoalsMade': 'tpm', 'threePointFieldGoalsAttempted': 'tpa',
        'freeThrowsMade': 'ftm', 'freeThrowsAttempted': 'fta', 'points': 'pts'}
UA = 'Mozilla/5.0 (research script)'

def fetch(date):
    path = os.path.join(CACHE, date + '.json')
    if os.path.exists(path): return
    url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={date}&limit=100"
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30) as r: d = json.load(r)
            out = {}
            for e in d.get('events', []):
                c = e['competitions'][0]; out[e['id']] = {}
                for t in c['competitors']:
                    st = {KEYS[s['name']]: float(s['displayValue']) for s in t.get('statistics', []) if s['name'] in KEYS and s.get('displayValue') not in (None, '', '--')}
                    st['score'] = float(t.get('score') or 'nan'); st['homeAway'] = t['homeAway']
                    out[e['id']][t['team']['abbreviation']] = st
            tmp = path + '.tmp'; json.dump(out, open(tmp, 'w')); os.replace(tmp, path); return
        except Exception as ex:
            time.sleep(2 ** attempt); err = ex
    print('FAILED', date, err, file=sys.stderr)

games = {}
for s in SEASONS:
    for g in json.load(open(f"{REPO}/src/data/games/{s}.json"))['games']:
        if g['final'] and g['hs'] is not None:
            day = datetime.fromisoformat(g['t'].replace('Z', '+00:00')).astimezone(ET).strftime('%Y%m%d')
            games[g['id']] = (day, g)
dates = sorted({d for d, _ in games.values()})
print(len(games), 'games on', len(dates), 'days', file=sys.stderr)
with ThreadPoolExecutor(8) as ex: list(ex.map(fetch, dates))
# Games missing from their own day's board: try the neighbouring days.
def load(date):
    p = os.path.join(CACHE, date + '.json'); return json.load(open(p)) if os.path.exists(p) else {}
out, missing = {}, []
for gid, (day, g) in games.items():
    hit = load(day).get(gid)
    if hit is None: missing.append((gid, day))
    else: out[gid] = hit
extra = set()
for gid, day in missing:
    dt = datetime.strptime(day, '%Y%m%d')
    for k in (-1, 1):
        extra.add(datetime.fromtimestamp(dt.timestamp() + k * 86400).strftime('%Y%m%d'))
with ThreadPoolExecutor(8) as ex: list(ex.map(fetch, sorted(extra)))
still = []
for gid, day in missing:
    dt = datetime.strptime(day, '%Y%m%d')
    for k in (-1, 1):
        hit = load(datetime.fromtimestamp(dt.timestamp() + k * 86400).strftime('%Y%m%d')).get(gid)
        if hit: out[gid] = hit; break
    else: still.append(gid)
json.dump(out, open(os.path.join(S, 'team-stats.json'), 'w'))
full = sum(1 for v in out.values() if len(v) == 2 and all('tpa' in t and 'fta' in t for t in v.values()))
print(f"games {len(games)} found {len(out)} with full shooting {full}; not found {len(still)}: {still[:20]}", file=sys.stderr)
