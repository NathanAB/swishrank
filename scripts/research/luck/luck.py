# python -I luck.py <repo> <scratch>: luck-adjusted final scores from <scratch>/team-stats.json (fetch_team_stats.py).
# A team's luck points = 3*(3PM - 3PA*x3) [+ (FTM - FTA*xft)], with expected rates x from information before the game's
# day only: the league's season-to-date rate (seeded by the season before's final league rate, 2000 attempts of prior),
# and, for "team" variants, the shooting team's own season-to-date rate shrunk toward it with N3 / NFT attempts.
# Writes <scratch>/adj/<name>.json {gameId: [homeAdj, awayAdj]} for every variant, and prints the sanity checks.
import json, os, sys, numpy as np, pandas as pd
from datetime import datetime
from zoneinfo import ZoneInfo
REPO, S = sys.argv[1], sys.argv[2]
ET = ZoneInfo('America/New_York')
N3, NFT, NLG = 2000.0, 200.0, 2000.0
TS = json.load(open(os.path.join(S, 'team-stats.json')))
SEASONS = [f"{y}-{str(y+1)[2:]}" for y in range(2015, 2026)]
rows = []
for s in SEASONS:
    data = json.load(open(f"{REPO}/src/data/games/{s}.json"))
    box = json.load(open(f"{REPO}/src/data/box/{s}.json"))['games']
    for g in data['games']:
        if not g['final'] or g['hs'] is None: continue
        day = datetime.fromisoformat(g['t'].replace('Z', '+00:00')).astimezone(ET).strftime('%Y-%m-%d')
        st = TS.get(g['id'], {})
        for side, abbr, opp, pts in (('h', g['home'], g['away'], g['hs']), ('a', g['away'], g['home'], g['as'])):
            t = st.get(abbr)
            bx = box.get(g['id'], {}).get(abbr)
            b3 = sum(l[2] - 2 * l[3] - l[5] for l in bx) if bx else np.nan
            rows.append(dict(id=g['id'], season=s, day=day, t=g['t'], side=side, team=abbr, opp=opp, pts=pts, neutral=g['neutral'],
                             tpm=t.get('tpm', np.nan) if t else np.nan, tpa=t.get('tpa', np.nan) if t else np.nan,
                             ftm=t.get('ftm', np.nan) if t else np.nan, fta=t.get('fta', np.nan) if t else np.nan,
                             espn_pts=t.get('score', np.nan) if t else np.nan, box3=b3))
df = pd.DataFrame(rows).sort_values(['t', 'id', 'side']).reset_index(drop=True)
ok = df.tpa.notna() & df.fta.notna() & df.tpm.notna() & df.ftm.notna()
# --- coverage and checks against the files on hand
g_ok = df.assign(ok=ok).groupby('id').ok.all()
print(f"coverage: {g_ok.sum()} of {len(g_ok)} final games have both teams' 3PA/3PM/FTA/FTM")
print('coverage by season:', df.assign(ok=ok).groupby('season').ok.mean().round(4).to_dict())
pm = ok & (df.espn_pts != df.pts); print(f"ESPN points != games-file points: {pm.sum()} team-games")
c = ok & df.box3.notna(); mm = c & (df.box3 != df.tpm)
print(f"ESPN 3PM vs box-derived 3PM: {c.sum()} team-games compared, {mm.sum()} mismatches")
if mm.sum(): print(df[mm][['id', 'season', 'team', 'tpm', 'box3']].head(10).to_string())
# --- expected rates, before each game's day
LG0 = {'3': 0.350, 'ft': 0.750}  # 2014-15 league rates, known before 2015-16
def expect(df):
    out = {k: np.full(len(df), np.nan) for k in ('lg3', 'lgft', 'tm3', 'tmft')}
    prev = dict(LG0)
    for s in SEASONS:
        idx = df.index[df.season == s]
        sub = df.loc[idx]
        L = {'tpm': 0., 'tpa': 0., 'ftm': 0., 'fta': 0.}; T = {}
        for day, grp in sub.groupby('day', sort=True):
            lg3 = (L['tpm'] + NLG * prev['3']) / (L['tpa'] + NLG); lgft = (L['ftm'] + NLG * prev['ft']) / (L['fta'] + NLG)
            for i, r in grp.iterrows():
                tt = T.get(r.team, [0., 0., 0., 0.])
                out['lg3'][i] = lg3; out['lgft'][i] = lgft
                out['tm3'][i] = (tt[0] + N3 * lg3) / (tt[1] + N3); out['tmft'][i] = (tt[2] + NFT * lgft) / (tt[3] + NFT)
            for i, r in grp.iterrows():
                if not ok[i]: continue
                tt = T.setdefault(r.team, [0., 0., 0., 0.])
                tt[0] += r.tpm; tt[1] += r.tpa; tt[2] += r.ftm; tt[3] += r.fta
                L['tpm'] += r.tpm; L['tpa'] += r.tpa; L['ftm'] += r.ftm; L['fta'] += r.fta
        prev = {'3': L['tpm'] / L['tpa'], 'ft': L['ftm'] / L['fta']}
        print(f"{s}: league 3P% {prev['3']:.4f} FT% {prev['ft']:.4f}")
    return out
E = expect(df)
for k, v in E.items(): df[k] = v
for base in ('lg', 'tm'):
    df[f'l3_{base}'] = np.where(ok, 3 * (df.tpm - df.tpa * df[f'{base}3']), 0.)
    df[f'lft_{base}'] = np.where(ok, df.ftm - df.fta * df[f'{base}ft'], 0.)
os.makedirs(os.path.join(S, 'adj'), exist_ok=True)
H = df[df.side == 'h'].set_index('id'); A = df[df.side == 'a'].set_index('id').loc[H.index]
print(f"mean luck home-minus-away (3P, team rates): {(H.l3_tm - A.l3_tm).mean():+.3f}; FT: {(H.lft_tm - A.lft_tm).mean():+.3f}")
for base in ('lg', 'tm'):
    for ft in (0, 1):
        for w in (0.5, 1.0):
            name = f"adj_{'3ft' if ft else '3'}_{base}_w{int(w*100)}"
            lh = H[f'l3_{base}'] + ft * H[f'lft_{base}']; la = A[f'l3_{base}'] + ft * A[f'lft_{base}']
            adj = {gid: [round(H.pts[gid] - w * lh[gid], 4), round(A.pts[gid] - w * la[gid], 4)] for gid in H.index}
            json.dump(adj, open(os.path.join(S, 'adj', name + '.json'), 'w'))
# --- sanity: variance and next-game prediction, team perspective, margins net of the season's mean home margin
sanity = []
for base, ft in (('tm', 1), ('tm', 0), ('lg', 1)):
    lh = H[f'l3_{base}'] + ft * H[f'lft_{base}']; la = A[f'l3_{base}'] + ft * A[f'lft_{base}']
    m = (H.pts - A.pts); madj = m - (lh - la)
    ok_g = g_ok.loc[H.index]
    print(f"[{base},{'3+FT' if ft else '3'}] games {ok_g.sum()}: sd raw margin {m[ok_g].std():.2f}, sd adjusted {madj[ok_g].std():.2f}, var ratio {madj[ok_g].var()/m[ok_g].var():.3f}; sd of luck diff {(lh-la)[ok_g].std():.2f}; corr(luck, raw margin) {np.corrcoef((lh-la)[ok_g], m[ok_g])[0,1]:.3f}")
    tg = []
    for side, sign in (('h', 1), ('a', -1)):
        X = H if side == 'h' else A
        tg.append(pd.DataFrame({'id': H.index, 'team': X.team.values, 'season': H.season.values, 't': H.t.values, 'neutral': H.neutral.values,
                                'home': (side == 'h') & ~H.neutral.values, 'raw': sign * m.values, 'adj': sign * madj.values, 'ok': ok_g.values}))
    tg = pd.concat(tg)
    hm = tg[tg.home].groupby('season').raw.mean()  # season mean home margin
    sh = np.where(tg.neutral, 0, np.where(tg.home, 1, -1)) * tg.season.map(hm).values / 1
    tg['raw_n'] = tg.raw - sh / 2 * 1  # half of home margin goes to each side's perspective... see below
    # home margin hm means home side +hm/2 above neutral and away side -hm/2 relative to neutral? No: a team's margin at
    # home is r_t - r_o + hm, away r_t - r_o - hm, so subtract +-hm.
    tg['raw_n'] = tg.raw - sh; tg['adj_n'] = tg.adj - sh
    tg = tg.sort_values(['team', 't'])
    tg['next'] = tg.groupby(['team', 'season']).raw_n.shift(-1)
    tg['next_ok'] = tg.groupby(['team', 'season']).ok.shift(-1)
    for k in (1, 10):
        tg[f'raw_r{k}'] = tg.groupby(['team', 'season']).raw_n.transform(lambda x: x.rolling(k, min_periods=k).mean())
        tg[f'adj_r{k}'] = tg.groupby(['team', 'season']).adj_n.transform(lambda x: x.rolling(k, min_periods=k).mean())
        okw = tg.groupby(['team', 'season']).ok.transform(lambda x: x.astype(float).rolling(k, min_periods=k).min())
        u = tg[(okw == 1) & tg.next.notna()]
        cr, ca = np.corrcoef(u[f'raw_r{k}'], u.next)[0, 1], np.corrcoef(u[f'adj_r{k}'], u.next)[0, 1]
        # bootstrap by team-season for the difference
        grp = u.groupby(['team', 'season']).indices; keys = list(grp); rng = np.random.default_rng(1); ds = []
        xr, xa, yn = u[f'raw_r{k}'].values, u[f'adj_r{k}'].values, u.next.values
        for _ in range(300):
            ii = np.concatenate([grp[keys[j]] for j in rng.integers(0, len(keys), len(keys))])
            ds.append(np.corrcoef(xa[ii], yn[ii])[0, 1] - np.corrcoef(xr[ii], yn[ii])[0, 1])
        print(f"   last-{k} mean margin -> next raw margin: n={len(u)} corr raw {cr:.4f}, adjusted {ca:.4f}, diff {ca-cr:+.4f} [{np.percentile(ds,2.5):+.4f},{np.percentile(ds,97.5):+.4f}]")
