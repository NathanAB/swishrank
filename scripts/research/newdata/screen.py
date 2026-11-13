# Derive past-only aggregates from feat_raw.pkl (crews, team style, team home splits, attendance) and screen every
# feature against version 4's miss (counted margin - e4): OLS slope with week-clustered standard errors, separately on
# tuning (2015-16..2022-23) and exploration (2023-24..2025-26). Variance features are screened against miss^2.
# <venv>/bin/python scripts/research/newdata/screen.py <scratchpad>  -> <scratchpad>/newdata/feat.pkl, screen.txt
import sys, math, numpy as np, pandas as pd, statsmodels.api as sm
from collections import defaultdict

S = sys.argv[1]; N = S + "/newdata"
f = pd.read_pickle(N + "/feat_raw.pkl").sort_values(["t"]).copy()
f = f[f.season < "2026"].join(pd.read_pickle(N + "/starters.pkl"))
bad = (f["fga_h"] == 0) | (f["fga_a"] == 0) | (f["pf_h"] == 0) | (f["pf_a"] == 0)
for c in ["pf", "fga", "tov", "fta", "3pa", "orb", "drb"]:
    f.loc[bad, [f"{c}_h", f"{c}_a"]] = np.nan
tune = (f.season <= "2022-23").values
f["wk"] = f.season + ":" + (f.d // 7).astype(str)
reg = f.playoff == 0

# ---------- crews: past-only shrunk per-referee means ----------
K = 150
stat = defaultdict(lambda: np.zeros(5))  # n, sum res, sum res^2, sum fouls, sum (pf_a - pf_h)
lg = np.zeros(5)
crew_home, crew_var, crew_pf, crew_pfbias, crew_n = [], [], [], [], []
for day, g in f.groupby("dt", sort=True):
    rows = []
    for r in g.itertuples():
        refs = r.refs if isinstance(r.refs, tuple) else ()
        mres = lg[1] / max(1, lg[0]); mvar = lg[2] / max(1, lg[0]); mpf = lg[3] / max(1, lg[0]); mb = lg[4] / max(1, lg[0])
        h = v = p = b = 0.0; n = 0
        for x in refs:
            s = stat[x]
            h += (s[1] - s[0] * mres) / (s[0] + K); v += (s[2] - s[0] * mvar) / (s[0] + K)
            p += (s[3] - s[0] * mpf) / (s[0] + K); b += (s[4] - s[0] * mb) / (s[0] + K); n += s[0]
        crew_home.append(h); crew_var.append(v); crew_pf.append(p); crew_pfbias.append(b); crew_n.append(n / max(1, len(refs)))
        rows.append((refs, r.res, r.pf_h + r.pf_a if not np.isnan(r.pf_h) else np.nan, r.pf_a - r.pf_h if not np.isnan(r.pf_h) else np.nan))
    for refs, res, pf, pb in rows:
        if np.isnan(pf): continue
        add = np.array([1, res, res * res, pf, pb]); lg += add
        for x in refs: stat[x] += add
f["crew_home"] = crew_home; f["crew_var"] = crew_var; f["crew_pf"] = crew_pf; f["crew_pfbias"] = crew_pfbias; f["crew_n"] = crew_n

# ---------- team style, season to date (previous season's until 5 games) ----------
cols = ["fga", "fta", "3pa", "tov", "orb", "drb", "pf"]
acc = defaultdict(lambda: np.zeros(2 * len(cols) + 1))  # team-season: own stats, opponent stats, games
style = {k: [] for k in ["pace_h", "pace_a", "par3_h", "par3_a", "ftr_h", "ftr_a", "orbp_h", "orbp_a", "tovr_h", "tovr_a", "dpar3_h", "dpar3_a", "dftr_h", "dftr_a", "dorbp_h", "dorbp_a", "dtovr_h", "dtovr_a"]}
prevseason = {s: p for p, s in zip(sorted(f.season.unique())[:-1], sorted(f.season.unique())[1:])}
def rates(v):
    o = dict(zip(cols, v[:7])); d = dict(zip(cols, v[7:14]))
    pace = (o["fga"] + 0.44 * o["fta"] + o["tov"] - o["orb"] + d["fga"] + 0.44 * d["fta"] + d["tov"] - d["orb"]) / 2
    return dict(pace=pace / v[14], par3=o["3pa"] / o["fga"], ftr=o["fta"] / o["fga"], orbp=o["orb"] / (o["orb"] + d["drb"]), tovr=o["tov"] / pace,
                dpar3=d["3pa"] / d["fga"], dftr=d["fta"] / d["fga"], dorbp=d["orb"] / (d["orb"] + o["drb"]), dtovr=d["tov"] / pace)
for day, g in f.groupby("dt", sort=True):
    for r in g.itertuples():
        for side, t in (("h", r.home), ("a", r.away)):
            v = acc[(r.season, t)]
            if v[14] < 5: v = acc.get((prevseason.get(r.season), t), v)
            rr = rates(v) if v[14] > 0 else {k: np.nan for k in ["pace", "par3", "ftr", "orbp", "tovr", "dpar3", "dftr", "dorbp", "dtovr"]}
            for k, x in rr.items(): style[f"{k}_{side}"].append(x)
    for r in g.to_dict("records"):
        hv = np.array([r[f"{c}_h"] for c in cols], dtype=float); av = np.array([r[f"{c}_a"] for c in cols], dtype=float)
        if np.isnan(hv).any() or np.isnan(av).any(): continue
        acc[(r["season"], r["home"])] += np.r_[hv, av, 1]; acc[(r["season"], r["away"])] += np.r_[av, hv, 1]
for k, v in style.items(): f[k] = v

# ---------- team home splits from the three previous seasons ----------
seasons = sorted(f.season.unique())
split = {}
for i, s in enumerate(seasons):
    past = f[f.season.isin(seasons[max(0, i - 3):i]) & ~f.neutral.astype(bool)]
    for t in set(f.home):
        hr = past.res[past.home == t]; rr = past.res[past.away == t]  # rr from home's view: + means t did worse on the road
        n = len(hr) + len(rr)
        split[(s, t)] = (hr.sum() / (len(hr) + 60) + rr.sum() / (len(rr) + 60)) if n else 0.0
f["tsplit"] = [(split[(r.season, r.home)] + split[(r.season, r.away)]) / 2 for r in f.itertuples()]
# attendance relative to each team's previous-season mean home crowd
prevatt = f[~f.neutral.astype(bool)].groupby(["season", "home"]).att.mean()
f["attfrac"] = [r.att / prevatt.get((prevseason.get(r.season), r.home), np.nan) if r.season in prevseason else np.nan for r in f.itertuples()]
f["empty"] = ((f.att < 2500) & ~f.neutral.astype(bool)).astype(float)
f.loc[f.att.isna(), "empty"] = np.nan
f["lowcrowd"] = f.attfrac.clip(0, 1.2)

# ---------- calendar ----------
utc = pd.to_datetime(f.t)
tzv = np.array([v[3] for v in f.venue]); dst = utc.dt.month.between(4, 10).values
f["localhr"] = ((utc.dt.hour.values + tzv + dst) % 24)
f["early"] = (f.localhr < 17).astype(float)
f["weekend"] = utc.dt.tz_localize(None).sub(pd.Timedelta(hours=8)).dt.dayofweek.isin([5, 6]).astype(float).values
from features_geo import ARENA, miles  # noqa: E402
f["citydist"] = [math.log1p(miles(ARENA[r.home], ARENA[r.away])) for r in f.itertuples()]
f["alt"] = [float(r.venue[2] > 4000 and ARENA[r.away][2] < 4000) for r in f.itertuples()]

# ---------- side features: home minus away ----------
D = {}
for k in ["mi", "mi7", "tz", "tzabs", "eastb2b", "sincehome", "streak", "bodyhome", "load3", "load7", "back", "backv", "newp", "age", "ht", "wt", "exp",
          "elim", "clin6", "locked", "nostake", "newcoach", "st5out", "st5outv", "stout", "stoutv", "stnew", "stnewv", "pace", "par3", "ftr", "orbp", "tovr"]:
    if f"{k}_h" in f: D[k] = f[f"{k}_h"] - f[f"{k}_a"]
D["bodyabs"] = f.bodyhome_h.abs() - f.bodyhome_a.abs()
D["agexd"] = D["age"] * f.d / 100
D["agexb2b"] = (f.age_h * f.b2bh - f.age_a * f.b2ba)
D["agelate"] = D["age"] * (f.d > 120)
D["late_nostake"] = D["nostake"] * (f.rem_h.fillna(99) < 15)
D["load7xage"] = f.load7_h * (f.age_h - 27) - f.load7_a * (f.age_a - 27)
for x in ["par3", "ftr", "orbp", "tovr"]:  # offence vs defence interactions
    lgx = f[f"{x}_h"].mean(); lgd = f[f"d{x}_h"].mean()
    D[f"mx_{x}"] = (f[f"{x}_h"] - lgx) * (f[f"d{x}_a"] - lgd) - (f[f"{x}_a"] - lgx) * (f[f"d{x}_h"] - lgd)
D["htxorb"] = D["ht"] * (f.orbp_h + f.orbp_a)
D["crewftr"] = f.crew_pf * D["ftr"]
for k in ["crew_home", "crew_pfbias", "tsplit", "empty", "lowcrowd", "early", "weekend", "natTV", "nbatv", "citydist", "alt"]:
    D[k] = f[k].astype(float)
D["empty_he"] = f.empty * (~f.neutral.astype(bool))
po = f.playoff == 1
for k in ["lostlast_h", "elim_game", "g7", "slead"]:
    D["po_" + k] = f[k].where(po, 0).fillna(0)
X = pd.DataFrame(D, index=f.index)
var = pd.DataFrame({"pace_sum": f.pace_h + f.pace_a, "par3_prod": f.par3_h * f.par3_a, "crew_var": f.crew_var, "crew_pf": f.crew_pf,
                    "natTV": f.natTV, "playoff": f.playoff.astype(float), "absdiff_e": f.e4.abs()}, index=f.index)
f.join(X, rsuffix="_d").to_pickle(N + "/feat.pkl")


def ols(y, x, grp):
    ok = ~(np.isnan(y) | np.isnan(x))
    if ok.sum() < 200 or np.nanstd(x[ok]) == 0: return np.nan, np.nan, int(ok.sum())
    m = sm.OLS(y[ok], sm.add_constant(x[ok])).fit(cov_type="cluster", cov_kwds={"groups": pd.factorize(grp[ok])[0]})
    return m.params[1], m.bse[1], int(ok.sum())

res = f.res.values; wk = f.wk.values
lines = [f"{'feature':14s} {'n_tune':>6s} {'sd':>7s} | {'slope_tune':>10s} {'se':>7s} {'t':>6s} | {'slope_expl':>10s} {'se':>7s} {'t':>6s} | sd*slope_tune"]
for k in X:
    x = X[k].values.astype(float); sd = np.nanstd(x[tune])
    bt, st, nt = ols(res[tune], x[tune], wk[tune]); be, se, ne = ols(res[~tune], x[~tune], wk[~tune])
    lines.append(f"{k:14s} {nt:6d} {sd:7.3f} | {bt:+10.4f} {st:7.4f} {bt / st:+6.2f} | {be:+10.4f} {se:7.4f} {be / se:+6.2f} | {sd * bt:+.4f}")
lines.append("variance features, against miss^2")
for k in var:
    x = var[k].values.astype(float); sd = np.nanstd(x[tune])
    bt, st, nt = ols(res[tune] ** 2, x[tune], wk[tune]); be, se, ne = ols(res[~tune] ** 2, x[~tune], wk[~tune])
    lines.append(f"{k:14s} {nt:6d} {sd:7.3f} | {bt:+10.4f} {st:7.4f} {bt / st:+6.2f} | {be:+10.4f} {se:7.4f} {be / se:+6.2f} | {sd * bt:+.4f}")
open(N + "/screen.txt", "w").write("\n".join(lines)); print("\n".join(lines))
