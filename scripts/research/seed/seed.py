# The model's own preseason seed and first-game lineups, from <S>/seed/rosters.json and <S>/seed/dump.json.
# python3 scripts/research/seed/seed.py <S> diag            regressions of team results on the seed's parts (tuning seasons)
# python3 scripts/research/seed/seed.py <S> spec <out.json> <grid>   writes a seed-rules.ts spec for a named grid
import json, sys, math
import numpy as np

S = sys.argv[1]
D = json.load(open(f"{S}/seed/dump.json"))
R = json.load(open(f"{S}/seed/rosters.json"))
ROOT = __file__.rsplit("/scripts/", 1)[0]
A = 0.08
seasons = sorted(D)
TUNE = [s for s in seasons if "2016-17" <= s <= "2022-23"]
EXPL = [s for s in seasons if "2023-24" <= s <= "2025-26"]


def expected_minutes(r, k=3.0, hold=0.5, pre_scale=1.0):
    """A player's expected minutes per team game: last season's per-game minutes blended with k games of his preseason
    minutes; a rookie at his preseason minutes; holdovers (no preseason game anywhere) times `hold`."""
    last, pre = r["mpg_last"], r["pre_mpg"]
    if last is not None and pre is not None: m = (r["gp_last"] * last + k * pre * pre_scale) / (r["gp_last"] + k)
    elif last is not None: m = last
    elif pre is not None: m = pre * pre_scale
    else: m = 10.0
    if r["src"] == "hold": m *= hold
    return m


def scaled(players):
    """[(athlete, minutes)] with minutes >= 10, scaled to 240 team minutes, as shares of 48 (players.ts scaled())."""
    ps = [(a, m) for a, m in players if m >= 10]
    tot = sum(m for _, m in ps)
    return [(a, m * 240 / tot / 48) for a, m in ps] if tot else []


AGES = json.load(open(f"{S}/seed/age.json"))
AC = json.load(open(f"{S}/seed/agecurve.json"))["c"]


def age_shift(season, a):
    """The age curve's expected change in Game Score per 36 over the season (age.py, fitted on tuning seasons), 0 without a birth date."""
    x = AGES.get(season, {}).get(str(a))
    return 0.0 if x is None else AC[1] * (x - 27) + AC[2] * (x - 27) ** 2


def rating(season, r, age=0.0, pre=0.0, preK=300.0):
    """Box rating at the season's start, plus `age` times the age curve's shift, moved toward his preseason Game Score per 36
    (relative to the preseason's mean) by pre * minutes / (minutes + preK)."""
    v = r["box"] + age * age_shift(season, r["a"])
    if pre and r["pre_min"] > 0 and R[season]["pre_mean36"]:
        rel = 36 * r["pre_gs"] / r["pre_min"] - R[season]["pre_mean36"]
        v += pre * r["pre_min"] / (r["pre_min"] + preK) * (rel - v)
    return v


def strength(season, abbr, b=0.0, age=0.0, pre=0.0, **kw):
    rows = R[season]["teams"][abbr]
    lu = scaled([(r["a"], expected_minutes(r, **kw)) for r in rows])
    val = {r["a"]: A * rating(season, r, age, pre) + b * r["apm"] for r in rows}
    return sum(sh * val[a] for a, sh in lu), lu


def continuity(season, abbr, **kw):
    """Share of the opening lineup's expected minutes held by players who ended last season with the team."""
    rows = {r["a"]: r for r in R[season]["teams"][abbr]}
    lu = scaled([(r["a"], expected_minutes(r, **kw)) for r in rows.values()])
    return sum(sh for a, sh in lu if rows[a]["last_team"] == abbr) / 5


def first_lineup(season, abbr, top=10):
    """Game-one lineup: the opening roster less holdovers and players the game's report lists Out or Doubtful, each at his
    expected minutes (last season's minutes per game blended with 3 games of preseason minutes; a player with no history
    at 0.7 of his preseason minutes), Questionable at half, the `top` with the most and at least 10, scaled to 240."""
    ps = []
    for r in R[season]["teams"][abbr]:
        if r["src"] == "hold" or r["status"] in ("Out", "Doubtful"): continue
        m = expected_minutes(r, pre_scale=1.0) if r["mpg_last"] is not None else (0.7 * r["pre_mpg"] if r["pre_mpg"] is not None else 10.0)
        ps.append((r["a"], m * (0.5 if r["status"] == "Questionable" else 1.0)))
    ps = sorted(ps, key=lambda x: -x[1])[:top]
    return [[a, round(sh, 5)] for a, sh in scaled(ps)]


PRE = json.load(open(f"{S}/seed/pre/preseason.json"))


def pre_margin(s):
    """Each team's mean counted margin in its preseason games against NBA teams, times n / (n + 4)."""
    out = {}
    for g in PRE.get(s, []):
        h, a = g["teams"]["home"], g["teams"]["away"]
        if h["abbr"] not in D[s]["abbrs"] or a["abbr"] not in D[s]["abbrs"]: continue
        try: m = float(h["score"]) - float(a["score"])
        except Exception: continue
        c = math.copysign(math.sqrt(abs(m) + 3), m)
        out.setdefault(h["abbr"], []).append(c); out.setdefault(a["abbr"], []).append(-c)
    return {k: float(np.mean(v)) * len(v) / (len(v) + 4) for k, v in out.items()}


def centred(x):
    m = sum(x.values()) / len(x); return {k: v - m for k, v in x.items()}


def team_results(season):
    """Each team's mean counted margin (sign(m) sqrt(|m|+3)) less the 0.622 home edge, over its first 20 and all regular games."""
    g = sorted((x for x in json.load(open(f"{ROOT}/src/data/games/{season}.json"))["games"] if x["final"]), key=lambda x: x["t"])
    out = {}
    for x in g:
        m = x["hs"] - x["as"]; c = math.copysign(math.sqrt(abs(m) + 3), m)
        for abbr, sg in ((x["home"], 1), (x["away"], -1)):
            if abbr not in D[season]["abbrs"]: continue
            out.setdefault(abbr, []).append(sg * c - (0 if x["neutral"] else 0.622 * sg))
    return {k: (np.mean(v[:20]), np.mean(v[:82])) for k, v in out.items()}


def table(seasons_, b=0.0, **kw):
    rows = []
    for s in seasons_:
        i = seasons.index(s); prev = seasons[i - 1]
        Z = centred({a: strength(s, a, b=b, **kw)[0] for a in D[s]["abbrs"]})
        L = D[prev]["teamPartsApm" if b else "teamParts"]
        res = team_results(s)
        for a in D[s]["abbrs"]:
            rows.append((s, a, Z[a], L.get(a, 0.0), D[s]["winCentres"][a], *res[a]))
    return rows


def diag():
    for b in (0.0, 0.12):
        for kw in ({}, {"k": 0}, {"k": 10}, {"hold": 0}, {"hold": 1}):
            rows = table(TUNE, b=b, **kw)
            Z, L, W, y20, y82 = (np.array([r[j] for r in rows]) for j in range(2, 7))
            def fit(X, y):
                X = np.column_stack([np.ones(len(y))] + X); c, *_ = np.linalg.lstsq(X, y, rcond=None); res = y - X @ c
                return c[1:], 1 - res.var() / y.var()
            out = [f"b={b} {kw}"]
            for nm, y in (("y20", y20), ("y82", y82)):
                (cw,), r2w = fit([W], y); (cz,), r2z = fit([Z], y); (cz2, cl2), r2zl = fit([Z, L], y); (cl,), r2l = fit([L], y)
                out.append(f"{nm}: W R2 {r2w:.3f} (x{cw:.2f}) | L R2 {r2l:.3f} | Z R2 {r2z:.3f} (x{cz:.2f}) | Z+L R2 {r2zl:.3f} (Z x{cz2:.2f}, L x{cl2:.2f})")
            print("  ".join(out))
    rows = table(TUNE)
    Z, W = np.array([r[2] for r in rows]), np.array([r[4] for r in rows])
    print("sd Z", Z.std().round(3), "sd W", W.std().round(3), "corr(Z,W)", np.corrcoef(Z, W)[0, 1].round(3))


def spec(path, grid):
    V = {}
    every = seasons[1:]
    def seed(alpha, beta, b=0.0, gamma=0.0, win=0.0, **kw):
        """Centre = win * win-total centre (baseline only) + alpha * roster strength + beta * last season's team part
        + gamma * preseason margin (shrunk with 4 games), shifted to sum to 0."""
        out = {}
        for s in every:
            prev = seasons[seasons.index(s) - 1]
            Z = centred({a: strength(s, a, b=b, **kw)[0] for a in D[s]["abbrs"]}) if alpha else {}
            L = D[prev]["teamPartsApm" if b else "teamParts"]
            pm = pre_margin(s) if gamma else {}
            out[s] = centred({a: win * D[s]["winCentres"][a] + alpha * Z.get(a, 0.0) + beta * L.get(a, 0.0) + gamma * pm.get(a, 0.0) for a in D[s]["abbrs"]})
        return out
    firsts = {s: {a: first_lineup(s, a) for a in D[s]["abbrs"]} for s in every}
    if False:
        V["v4"] = {}
        V["last07"] = {"centres": seed(0, 0.7)}
        for al in (0.6, 0.8, 1.0, 1.2, 1.5):
            V[f"own_a{al}"] = {"centres": seed(al, 0)}
            for be in (0.3, 0.5, 0.7):
                V[f"own_a{al}_l{be}"] = {"centres": seed(al, be)}
    elif grid == "first":
        V["v4"] = {}; V["first_lineup"] = {"first": firsts}
    def mult(gamma, **kw):
        out = {}
        for s in every:
            c = {a: continuity(s, a, hold=0) for a in D[s]["abbrs"]}; m = sum(c.values()) / len(c)
            out[s] = {a: (max(c[a], 0.05) / m) ** gamma for a in c}
        return out
    if grid.startswith("json:"):
        V = json.loads(grid[5:])
        for k, v in V.items():
            if "seed" in v: v["centres"] = seed(**v.pop("seed"))
            if v.pop("firsts", False): v["first"] = firsts
            if "cont" in v: v["mult"] = mult(v.pop("cont"))
    json.dump({"variants": V}, open(path, "w"))
    print(len(V), "variants:", ", ".join(V), file=sys.stderr)


if __name__ != "__main__": pass
elif sys.argv[2] == "diag": diag()
else: spec(sys.argv[3], sys.argv[4])
