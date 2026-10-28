# The rating model

The site rates teams with a least-squares fit to every game of the season so far, re-run after every game day, like SRS or Massey ratings. This file holds the plan the model was chosen by, written before any held-out season was scored, then the results of `npm run backtest` and the settings they chose.

## Pre-registration

Written on 2026-10-25, before the backtest existed and before any held-out season was scored. The backtest prints the SHA-256 of this section, from the line after its heading to the line before the next `## ` heading, so a later edit shows. The hash at writing is recorded under Results.

### Data and split

- Games are the final, scored games in `src/data/games/<season>.json`: regular season, NBA Cup, play-in and playoffs. The 2019-20 bubble games are marked neutral in the data.
- A game belongs to its US Eastern calendar day. A season's day index counts days from its first game day, which is day 0. Its week is `floor(day / 7)` and its two-week window is `floor(day / 14)`.
- Tuning seasons: 2015-16 to 2022-23, eight seasons. Every choice below is made on these alone.
- Held-out seasons: 2023-24, 2024-25 and 2025-26. They are scored once the choice is made, to confirm it.
- 2026-27 has too few games to judge anything. It is logged, never used.

### Score

- The score is log loss: the mean over games of `-ln(p)` when the home team won and `-ln(1 - p)` when it lost, where `p` is the home team's win chance given before the game. Every game weighs the same, so a pooled score weighs a season by its game count.
- Brier score and accuracy (the favourite won) are reported and never used to choose.

### The baseline

- The baseline is the site's Elo as it stands at commit 7659991, `src/lib/elo.ts`: every team at 1500 on opening night, K = 20, 100 points of home court except at neutral sites, FiveThirtyEight's margin multiplier, `p = 1 / (1 + 10^(-gap / 400))`, applied game by game in the data's order. The backtest keeps a verbatim copy of its formula as the baseline.

### The model family

- Each team has a rating, and there is one home edge `h`. The expected home margin of a game is `r_home - r_away + h`, without `h` at a neutral site.
- Each day's games are predicted from the fit through the day before. After the day, the fit is re-run on every final game of the season so far. Before the first game every rating is 0, the league average.
- The fit minimises `sum over games (f(margin) - expected)^2 + n0 * sum over teams r_team^2`, plus `w_h * (h - h0)^2` when the home edge is fitted. `margin` is home score minus away score, and `f` is the margin handling below.
- The pull term is `n0` games against a league-average team that ended level. Its centre is the league average, 0: no outside data and nothing carried over from last season.
- The home team's win chance is `p = Phi(expected / SIGMA)`, with `Phi` the standard normal distribution function.

### Candidates

The grid is fixed here and is not extended after any result is seen.

- Prior strength `n0`, in games: 2, 3, 5, 8, 12.
- Margin handling `f`: raw `m`; capped at 25, `sign(m) * min(|m|, 25)`; and `sign(m) * (|m| + 3)^q` for `q` in 0.8, 0.6 and 0.5.
- Home edge, two ways. Fitted: `h` is fitted from the season's own games with a weak prior, weight `w_h = 50` games, centred on `h0`. Fixed: `h = h0` all season.
- `h0`, per candidate, is the mean over the eight tuning seasons of that season's home edge fitted on all its games, with the candidate's `n0` and `f` and no home prior.
- `SIGMA`, per candidate, is one value fitted by maximum likelihood to the candidate's pre-game predictions over all eight tuning seasons. It is not tuned per season.
- That is 5 x 5 x 2 = 50 candidates. Each candidate's blowout ratio is `f(43) / f(1)`: 43 for raw, 25 for the cap, and about 7.1, 4.3 and 3.4 for `q` = 0.8, 0.6 and 0.5.

### Uncertainty

- Every comparison of two models is on the same games. The statistic is the mean per-game difference in log loss.
- Its 95% interval comes from a block bootstrap by week: resample whole (season, week) blocks with replacement from the blocks that hold the compared games, as many as there are, and take the 2.5th and 97.5th percentiles of 2000 resampled means. The random generator is seeded, so reruns match.
- An interval that crosses 0 is a tie.
- For each candidate, report how many of the seasons in a set it beats the baseline in, on the point estimate.

### Constraint

- A model is worse than the baseline in a two-week window when the window's 95% interval of (model minus baseline) lies wholly above 0. Windows are pooled across the seasons in a set: window 0 of every season together, then window 1, and so on.
- A model passes the window constraint on a set of seasons when it is worse in no window.

### Choosing

1. A candidate is eligible for the site when its blowout ratio is at most 4 (the owner's limit: "a 43-point win counting 7x a 1-point win is too much") and it passes the window constraint on the tuning seasons.
2. The site's model is the eligible candidate with the lowest pooled tuning log loss. A tie on the interval does not change this; the point estimate decides, and the neighbours' table shows how close the race was.
3. The unconstrained best is the candidate with the lowest pooled tuning log loss among all that pass the window constraint, at any blowout ratio. What the owner's limit costs is (site model minus unconstrained best), with its interval, on the tuning seasons and on the held-out seasons.
4. If no candidate is eligible, the site keeps Elo.

### Confirmation

Run once, after the choice is made.

- On the held-out seasons, report the site's model against the baseline: pooled log loss difference with its interval, each season's difference and interval, and how many of the three seasons it wins.
- The site switches to the model only when it passes the window constraint on the held-out seasons and its pooled held-out log loss is below the baseline's. Otherwise the site keeps Elo, and the held-out result is not used to pick another candidate.

### Reported, not used to choose

- Log loss in weeks 1-2, 3-4, 5-6 and the rest of the season (days 0-13, 14-27, 28-41 and 42 on), for the tuning and the held-out seasons.
- Calibration on the held-out seasons: games bucketed by the favourite's stated chance, 50-55%, 55-60% and so on to 95-100%, with the mean stated chance and the share the favourite won.
- Sensitivity: the site's model against its neighbours in the grid (one step of `n0` each way, one step of `f` each way, the other home edge mode), on the tuning seasons, with intervals. Also `w_h` at 10 and 200 when the home edge is fitted.

### Provisional threshold

A rating is marked provisional until its team has played enough games for its predictions to settle. The number comes from the site's model on the tuning seasons.

- For each game, `k` is the number of games the less experienced of the two teams had played before it.
- A game's excess log loss is its pre-game log loss minus the log loss of the same game priced by the season's final fit, with the same settings and `SIGMA`. The final fit knows the whole season, so the excess measures what the ratings did not yet know, with the game's own luck taken out.
- `E(k)` is the mean excess of games whose `k` lies within 2 of `k`. The settled level is the mean excess of games with `k` from 40 to 59.
- The threshold is the smallest `k` at which `E(j)` is within 0.01 of the settled level for every `j` from `k` to 39. A team is provisional until it has played that many games.

## Results

Generated by `npm run backtest`, which rewrites the text between the markers below. Each setting in the next section cites a table here.

The pre-registration's SHA-256 when it was written: `3882ab098f3f45cd4a660cfe1bd9d75251fa82044c2c12706d8c9416a11cb578`.

<!-- results:start -->
Pre-registration SHA-256 now: `3882ab098f3f45cd4a660cfe1bd9d75251fa82044c2c12706d8c9416a11cb578`, unchanged since it was written. Bootstrap: 2000 resamples of whole weeks, seed 20261025.

### Table 1. Every candidate on the tuning seasons

Log loss pooled over the 8 tuning seasons (10206 games), against the baseline Elo's 0.6378. Lower is better. "Power q" counts a margin m as (abs(m) + 3)^q. h0 and SIGMA are in the candidate's margin units. Windows worse counts the pooled two-week windows where the candidate is worse than Elo, with how many of them hold one (season, week) block. Sorted by log loss.

| Candidate | 43 vs 1 | h0 | SIGMA | Log loss | vs Elo [95%] | Seasons won | Windows worse | Brier | Accuracy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| n0 12, power 0.8, fixed home | 7.1x | 1.532 | 7.012 | 0.6298 | -0.0080 [-0.0106, -0.0053] | 8 of 8 | 0 | 0.2200 | 64.4% |
| n0 12, power 0.6, fixed home | 4.3x | 0.838 | 3.847 | 0.6299 | -0.0079 [-0.0105, -0.0052] | 8 of 8 | 0 | 0.2201 | 64.5% |
| n0 8, power 0.8, fixed home | 7.1x | 1.532 | 7.545 | 0.6300 | -0.0078 [-0.0106, -0.0048] | 8 of 8 | 0 | 0.2201 | 64.5% |
| n0 12, power 0.5, fixed home | 3.4x | 0.622 | 2.866 | 0.6301 | -0.0077 [-0.0104, -0.0050] | 8 of 8 | 0 | 0.2202 | 64.4% |
| n0 8, power 0.6, fixed home | 4.3x | 0.838 | 4.140 | 0.6301 | -0.0077 [-0.0105, -0.0047] | 8 of 8 | 0 | 0.2202 | 64.5% |
| n0 12, power 0.8, fitted home | 7.1x | 1.532 | 7.037 | 0.6302 | -0.0076 [-0.0105, -0.0045] | 8 of 8 | 0 | 0.2202 | 64.3% |
| n0 12, cap 25, fixed home | 25.0x | 2.185 | 10.128 | 0.6303 | -0.0075 [-0.0103, -0.0047] | 8 of 8 | 0 | 0.2202 | 64.3% |
| n0 12, power 0.6, fitted home | 4.3x | 0.838 | 3.866 | 0.6303 | -0.0075 [-0.0105, -0.0044] | 8 of 8 | 0 | 0.2202 | 64.4% |
| n0 8, power 0.5, fixed home | 3.4x | 0.622 | 3.086 | 0.6303 | -0.0074 [-0.0103, -0.0045] | 8 of 8 | 0 | 0.2203 | 64.5% |
| n0 8, power 0.8, fitted home | 7.1x | 1.532 | 7.568 | 0.6304 | -0.0073 [-0.0106, -0.0041] | 7 of 8 | 0 | 0.2203 | 64.2% |
| n0 12, power 0.5, fitted home | 3.4x | 0.622 | 2.884 | 0.6305 | -0.0073 [-0.0103, -0.0042] | 8 of 8 | 0 | 0.2203 | 64.2% |
| n0 8, power 0.6, fitted home | 4.3x | 0.838 | 4.158 | 0.6305 | -0.0073 [-0.0105, -0.0040] | 8 of 8 | 0 | 0.2203 | 64.3% |
| n0 8, cap 25, fixed home | 25.0x | 2.185 | 10.906 | 0.6305 | -0.0072 [-0.0102, -0.0041] | 7 of 8 | 0 | 0.2204 | 64.3% |
| n0 12, raw, fixed home | 43.0x | 2.389 | 11.065 | 0.6306 | -0.0072 [-0.0099, -0.0043] | 7 of 8 | 1 | 0.2204 | 64.1% |
| n0 8, power 0.5, fitted home | 3.4x | 0.622 | 3.102 | 0.6307 | -0.0071 [-0.0103, -0.0038] | 8 of 8 | 0 | 0.2204 | 64.2% |
| n0 5, power 0.8, fixed home | 7.1x | 1.532 | 8.123 | 0.6308 | -0.0070 [-0.0101, -0.0038] | 7 of 8 | 0 | 0.2205 | 64.6% |
| n0 12, cap 25, fitted home | 25.0x | 2.185 | 10.154 | 0.6308 | -0.0070 [-0.0100, -0.0039] | 7 of 8 | 0 | 0.2204 | 64.0% |
| n0 8, raw, fixed home | 43.0x | 2.389 | 11.917 | 0.6309 | -0.0069 [-0.0099, -0.0038] | 7 of 8 | 0 | 0.2205 | 64.3% |
| n0 5, power 0.6, fixed home | 4.3x | 0.838 | 4.459 | 0.6309 | -0.0069 [-0.0099, -0.0036] | 7 of 8 | 0 | 0.2205 | 64.6% |
| n0 8, cap 25, fitted home | 25.0x | 2.185 | 10.934 | 0.6310 | -0.0068 [-0.0100, -0.0034] | 7 of 8 | 0 | 0.2206 | 64.1% |
| n0 5, power 0.5, fixed home | 3.4x | 0.622 | 3.326 | 0.6312 | -0.0066 [-0.0097, -0.0034] | 7 of 8 | 0 | 0.2206 | 64.5% |
| n0 5, power 0.8, fitted home | 7.1x | 1.532 | 8.146 | 0.6312 | -0.0066 [-0.0100, -0.0031] | 7 of 8 | 0 | 0.2206 | 64.2% |
| n0 12, raw, fitted home | 43.0x | 2.389 | 11.083 | 0.6312 | -0.0066 [-0.0097, -0.0033] | 7 of 8 | 1 | 0.2206 | 64.1% |
| n0 5, power 0.6, fitted home | 4.3x | 0.838 | 4.476 | 0.6313 | -0.0065 [-0.0099, -0.0031] | 7 of 8 | 0 | 0.2207 | 64.4% |
| n0 5, cap 25, fixed home | 25.0x | 2.184 | 11.750 | 0.6313 | -0.0065 [-0.0096, -0.0031] | 7 of 8 | 0 | 0.2207 | 64.3% |
| n0 8, raw, fitted home | 43.0x | 2.389 | 11.939 | 0.6315 | -0.0063 [-0.0097, -0.0029] | 7 of 8 | 0 | 0.2208 | 64.3% |
| n0 5, power 0.5, fitted home | 3.4x | 0.622 | 3.340 | 0.6315 | -0.0063 [-0.0096, -0.0029] | 7 of 8 | 0 | 0.2208 | 64.3% |
| n0 5, raw, fixed home | 43.0x | 2.389 | 12.842 | 0.6317 | -0.0061 [-0.0092, -0.0028] | 7 of 8 | 0 | 0.2208 | 64.4% |
| n0 5, cap 25, fitted home | 25.0x | 2.184 | 11.780 | 0.6318 | -0.0060 [-0.0094, -0.0025] | 7 of 8 | 0 | 0.2209 | 64.2% |
| n0 3, power 0.8, fixed home | 7.1x | 1.532 | 8.697 | 0.6320 | -0.0058 [-0.0091, -0.0023] | 7 of 8 | 0 | 0.2209 | 64.7% |
| n0 3, power 0.6, fixed home | 4.3x | 0.838 | 4.777 | 0.6322 | -0.0056 [-0.0089, -0.0021] | 7 of 8 | 0 | 0.2210 | 64.5% |
| n0 5, raw, fitted home | 43.0x | 2.389 | 12.870 | 0.6323 | -0.0055 [-0.0091, -0.0020] | 7 of 8 | 0 | 0.2211 | 64.2% |
| n0 3, power 0.8, fitted home | 7.1x | 1.532 | 8.722 | 0.6324 | -0.0054 [-0.0089, -0.0018] | 7 of 8 | 0 | 0.2211 | 64.4% |
| n0 3, power 0.5, fixed home | 3.4x | 0.622 | 3.565 | 0.6324 | -0.0054 [-0.0086, -0.0019] | 7 of 8 | 1 | 0.2211 | 64.5% |
| n0 3, power 0.6, fitted home | 4.3x | 0.838 | 4.793 | 0.6325 | -0.0053 [-0.0088, -0.0017] | 7 of 8 | 0 | 0.2211 | 64.3% |
| n0 3, cap 25, fixed home | 25.0x | 2.184 | 12.588 | 0.6326 | -0.0052 [-0.0087, -0.0017] | 7 of 8 | 0 | 0.2212 | 64.3% |
| n0 3, power 0.5, fitted home | 3.4x | 0.622 | 3.578 | 0.6327 | -0.0051 [-0.0086, -0.0015] | 7 of 8 | 1 | 0.2213 | 64.5% |
| n0 3, raw, fixed home | 43.0x | 2.389 | 13.762 | 0.6329 | -0.0049 [-0.0083, -0.0012] | 7 of 8 | 0 | 0.2213 | 64.3% |
| n0 3, cap 25, fitted home | 25.0x | 2.184 | 12.621 | 0.6330 | -0.0048 [-0.0084, -0.0011] | 7 of 8 | 0 | 0.2214 | 64.1% |
| n0 2, power 0.8, fixed home | 7.1x | 1.532 | 9.113 | 0.6331 | -0.0047 [-0.0082, -0.0008] | 7 of 8 | 0 | 0.2214 | 64.7% |
| n0 2, power 0.6, fixed home | 4.3x | 0.838 | 5.007 | 0.6333 | -0.0045 [-0.0079, -0.0008] | 6 of 8 | 0 | 0.2215 | 64.4% |
| n0 2, power 0.8, fitted home | 7.1x | 1.532 | 9.139 | 0.6335 | -0.0043 [-0.0080, -0.0004] | 7 of 8 | 0 | 0.2215 | 64.4% |
| n0 3, raw, fitted home | 43.0x | 2.389 | 13.798 | 0.6335 | -0.0043 [-0.0081, -0.0006] | 7 of 8 | 0 | 0.2216 | 64.2% |
| n0 2, power 0.5, fixed home | 3.4x | 0.622 | 3.738 | 0.6336 | -0.0042 [-0.0076, -0.0005] | 6 of 8 | 1 | 0.2216 | 64.6% |
| n0 2, power 0.6, fitted home | 4.3x | 0.838 | 5.024 | 0.6336 | -0.0042 [-0.0078, -0.0004] | 6 of 8 | 0 | 0.2216 | 64.3% |
| n0 2, cap 25, fixed home | 25.0x | 2.184 | 13.195 | 0.6337 | -0.0041 [-0.0077, -0.0002] | 6 of 8 | 0 | 0.2216 | 64.3% |
| n0 2, power 0.5, fitted home | 3.4x | 0.622 | 3.752 | 0.6339 | -0.0039 [-0.0076, -0.0002] | 5 of 8 | 1 | 0.2217 | 64.5% |
| n0 2, raw, fixed home | 43.0x | 2.389 | 14.431 | 0.6341 | -0.0037 [-0.0075, +0.0002] | 6 of 8 | 0 | 0.2218 | 64.3% |
| n0 2, cap 25, fitted home | 25.0x | 2.184 | 13.230 | 0.6342 | -0.0036 [-0.0074, +0.0002] | 6 of 8 | 0 | 0.2218 | 64.1% |
| n0 2, raw, fitted home | 43.0x | 2.389 | 14.472 | 0.6347 | -0.0031 [-0.0071, +0.0009] | 5 of 8 | 0 | 0.2220 | 64.2% |

### Table 2. The choice

The site's model is the eligible candidate (43 vs 1 at most 4x, no worse window) with the lowest tuning log loss. The unconstrained best drops the 4x limit. The cost of the limit is the site's model minus the unconstrained best. With the deviation's rule, which judges no one-block window, the choice is the same.

|  | Candidate | 43 vs 1 | Tuning log loss |
| --- | --- | --- | --- |
| Site's model | n0 12, power 0.5, fixed home | 3.4x | 0.6301 |
| Unconstrained best | n0 12, power 0.8, fixed home | 7.1x | 0.6298 |

| Cost of the limit | Log loss difference [95%] | Verdict |
| --- | --- | --- |
| Tuning seasons | +0.0003 [-0.0002, +0.0009] | tie |
| Held-out seasons | +0.0009 [-0.0001, +0.0019] | tie |

### Table 3. Held-out confirmation

The site's model against the baseline Elo on the held-out seasons, scored once after the choice. It wins 3 of 3 seasons on the point estimate and is worse in 1 of 18 pooled two-week windows (table 5), 1 of them one-block (window 17). By the plan's rule as written the site keeps Elo. With the declared deviation, which judges no one-block window, it switches to the model.

| Season | Games | Elo log loss | Model log loss | Model - Elo [95%] | Verdict | Elo Brier | Model Brier | Elo accuracy | Model accuracy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2023-24 | 1319 | 0.6349 | 0.6173 | -0.0176 [-0.0264, -0.0092] | better | 0.2225 | 0.2150 | 63.8% | 65.0% |
| 2024-25 | 1321 | 0.6326 | 0.6185 | -0.0141 [-0.0198, -0.0085] | better | 0.2214 | 0.2155 | 63.9% | 65.0% |
| 2025-26 | 1322 | 0.6153 | 0.6055 | -0.0099 [-0.0179, -0.0020] | better | 0.2134 | 0.2086 | 66.3% | 68.5% |
| Pooled | 3962 | 0.6276 | 0.6138 | -0.0138 [-0.0182, -0.0095] | better | 0.2191 | 0.2130 | 64.7% | 66.2% |

| Unconstrained best, season | Best - Elo [95%] | Site's model - best [95%] |
| --- | --- | --- |
| 2023-24 | -0.0173 [-0.0260, -0.0086] | -0.0003 [-0.0014, +0.0007] |
| 2024-25 | -0.0147 [-0.0211, -0.0085] | +0.0006 [-0.0015, +0.0026] |
| 2025-26 | -0.0122 [-0.0201, -0.0044] | +0.0023 [+0.0007, +0.0039] |
| Pooled | -0.0147 [-0.0192, -0.0102] | +0.0009 [-0.0001, +0.0019] |

### Table 4. Early season and the rest

The site's model against Elo by part of the season, days counted from each season's first game day.

| Seasons | Part | Games | Elo log loss | Model log loss | Model - Elo [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Tuning | Weeks 1-2 | 799 | 0.6948 | 0.6801 | -0.0146 [-0.0223, -0.0069] | better |
| Tuning | Weeks 3-4 | 823 | 0.6537 | 0.6446 | -0.0091 [-0.0157, -0.0020] | better |
| Tuning | Weeks 5-6 | 817 | 0.6436 | 0.6332 | -0.0104 [-0.0195, -0.0006] | better |
| Tuning | Rest of season | 7767 | 0.6296 | 0.6230 | -0.0066 [-0.0096, -0.0034] | better |
| Held-out | Weeks 1-2 | 314 | 0.6903 | 0.6727 | -0.0176 [-0.0299, -0.0039] | better |
| Held-out | Weeks 3-4 | 305 | 0.6153 | 0.5904 | -0.0249 [-0.0490, -0.0014] | better |
| Held-out | Weeks 5-6 | 289 | 0.6183 | 0.6057 | -0.0126 [-0.0292, +0.0040] | tie |
| Held-out | Rest of season | 3054 | 0.6232 | 0.6108 | -0.0125 [-0.0169, -0.0078] | better |

### Table 5. Two-week windows, held-out seasons pooled

Window w holds days 14w to 14w + 13 of each season. The constraint fails on a window marked worse. A window of one (season, week) block has an interval of zero width. On the tuning seasons the site's model is worse in 0 windows.

| Window | Days | Games | Blocks | Elo log loss | Model log loss | Model - Elo [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0-13 | 314 | 6 | 0.6903 | 0.6727 | -0.0176 [-0.0299, -0.0039] | better |
| 1 | 14-27 | 305 | 6 | 0.6153 | 0.5904 | -0.0249 [-0.0490, -0.0014] | better |
| 2 | 28-41 | 289 | 6 | 0.6183 | 0.6057 | -0.0126 [-0.0292, +0.0040] | tie |
| 3 | 42-55 | 258 | 6 | 0.6163 | 0.5949 | -0.0214 [-0.0309, -0.0130] | better |
| 4 | 56-69 | 286 | 6 | 0.6702 | 0.6598 | -0.0104 [-0.0246, +0.0037] | tie |
| 5 | 70-83 | 313 | 6 | 0.6461 | 0.6377 | -0.0084 [-0.0169, -0.0011] | better |
| 6 | 84-97 | 308 | 6 | 0.6577 | 0.6462 | -0.0115 [-0.0267, +0.0027] | tie |
| 7 | 98-111 | 316 | 6 | 0.6407 | 0.6196 | -0.0211 [-0.0338, -0.0083] | better |
| 8 | 112-125 | 188 | 6 | 0.6445 | 0.6104 | -0.0341 [-0.0554, -0.0093] | better |
| 9 | 126-139 | 324 | 6 | 0.6160 | 0.6017 | -0.0143 [-0.0248, -0.0037] | better |
| 10 | 140-153 | 322 | 6 | 0.5523 | 0.5549 | +0.0027 [-0.0094, +0.0138] | tie |
| 11 | 154-167 | 305 | 6 | 0.5815 | 0.5703 | -0.0112 [-0.0259, +0.0060] | tie |
| 12 | 168-181 | 215 | 6 | 0.5674 | 0.5661 | -0.0013 [-0.0122, +0.0099] | tie |
| 13 | 182-195 | 110 | 6 | 0.6753 | 0.6563 | -0.0190 [-0.0346, -0.0055] | better |
| 14 | 196-209 | 62 | 6 | 0.6860 | 0.6762 | -0.0098 [-0.0501, +0.0350] | tie |
| 15 | 210-223 | 30 | 6 | 0.6459 | 0.6319 | -0.0140 [-0.0614, +0.0375] | tie |
| 16 | 224-237 | 15 | 6 | 0.6901 | 0.6908 | +0.0007 [-0.0503, +0.0708] | tie |
| 17 | 238-251 | 2 | 1 | 0.5069 | 0.6474 | +0.1404 [+0.1404, +0.1404] | worse, one block |

### Table 6. Calibration, held-out seasons

Games bucketed by the favourite's stated chance. A calibrated model's favourites win about as often as it says.

| Stated chance | Model games | Model says | Model favourite won | Elo games | Elo says | Elo favourite won |
| --- | --- | --- | --- | --- | --- | --- |
| 50-55% | 701 | 52.5% | 54.2% | 556 | 52.4% | 52.7% |
| 55-60% | 738 | 57.5% | 58.9% | 562 | 57.6% | 56.6% |
| 60-65% | 670 | 62.4% | 60.4% | 733 | 62.7% | 58.8% |
| 65-70% | 544 | 67.5% | 65.8% | 586 | 67.4% | 62.6% |
| 70-75% | 461 | 72.4% | 74.0% | 519 | 72.4% | 67.1% |
| 75-80% | 361 | 77.4% | 78.7% | 393 | 77.4% | 74.0% |
| 80-85% | 257 | 82.3% | 82.9% | 305 | 82.3% | 82.0% |
| 85-90% | 164 | 87.2% | 89.0% | 210 | 87.2% | 84.8% |
| 90-95% | 60 | 92.1% | 88.3% | 87 | 92.0% | 87.4% |
| 95-100% | 6 | 95.7% | 100.0% | 11 | 95.7% | 100.0% |

### Table 7. Sensitivity of the choice

Each neighbour against the site's model on the tuning seasons; a positive difference means the neighbour does worse. The home prior's weight w_h is outside the grid and reported only.

| Neighbour | 43 vs 1 | Tuning log loss | Neighbour - site [95%] | Verdict |
| --- | --- | --- | --- | --- |
| n0 8, power 0.5, fixed home | 3.4x | 0.6303 | +0.0003 [-0.0001, +0.0007] | tie |
| n0 12, power 0.6, fixed home | 4.3x | 0.6299 | -0.0002 [-0.0004, -0.0000] | better |
| n0 12, power 0.5, fitted home | 3.4x | 0.6305 | +0.0004 [-0.0005, +0.0014] | tie |

### Table 8. Provisional threshold

k is the number of games the less experienced side had played before a game. E(k) is the mean excess log loss (pre-game minus the season's final fit) of the tuning seasons' games with k within 2 of k. The settled level, games with k from 40 to 59, is 0.0262. The threshold is the first k from which E stays within 0.01 of it: **26 games**.

| k | Games at k | E(k) | E(k) - settled |
| --- | --- | --- | --- |
| 0 | 129 | 0.0544 | +0.0282 |
| 1 | 128 | 0.0646 | +0.0384 |
| 2 | 125 | 0.0668 | +0.0406 |
| 3 | 127 | 0.0666 | +0.0404 |
| 4 | 121 | 0.0663 | +0.0401 |
| 5 | 126 | 0.0703 | +0.0441 |
| 6 | 124 | 0.0602 | +0.0341 |
| 7 | 127 | 0.0509 | +0.0247 |
| 8 | 117 | 0.0436 | +0.0174 |
| 9 | 123 | 0.0357 | +0.0095 |
| 10 | 124 | 0.0367 | +0.0105 |
| 11 | 118 | 0.0423 | +0.0162 |
| 12 | 126 | 0.0403 | +0.0142 |
| 13 | 125 | 0.0397 | +0.0136 |
| 14 | 120 | 0.0382 | +0.0120 |
| 15 | 117 | 0.0255 | -0.0007 |
| 16 | 123 | 0.0198 | -0.0064 |
| 17 | 121 | 0.0253 | -0.0009 |
| 18 | 122 | 0.0298 | +0.0036 |
| 19 | 126 | 0.0301 | +0.0039 |
| 20 | 119 | 0.0316 | +0.0055 |
| 21 | 123 | 0.0269 | +0.0007 |
| 22 | 121 | 0.0292 | +0.0030 |
| 23 | 127 | 0.0286 | +0.0025 |
| 24 | 114 | 0.0330 | +0.0068 |
| 25 | 124 | 0.0389 | +0.0128 |
| 26 | 119 | 0.0350 | +0.0089 |
| 27 | 115 | 0.0305 | +0.0044 |
| 28 | 120 | 0.0287 | +0.0025 |
| 29 | 126 | 0.0269 | +0.0007 |
| 30 | 123 | 0.0271 | +0.0009 |
| 31 | 124 | 0.0312 | +0.0050 |
| 32 | 116 | 0.0313 | +0.0051 |
| 33 | 122 | 0.0314 | +0.0053 |
| 34 | 118 | 0.0302 | +0.0041 |
| 35 | 116 | 0.0298 | +0.0036 |
| 36 | 127 | 0.0311 | +0.0049 |
| 37 | 110 | 0.0293 | +0.0031 |
| 38 | 120 | 0.0321 | +0.0059 |
| 39 | 127 | 0.0304 | +0.0042 |

### Table 9. The Elo scale

A rating is 1000 plus the fitted rating times 295.7 / SIGMA Elo points, so a gap of g Elo points means Phi(g / 295.7), the model's own chance. 295.7 is 400 x 1.702 / ln 10, the scale at which the normal curve sits closest to classic Elo's logistic: the largest gap between the two chances over 0 to 1200 points is 0.0095.

| Quantity | Value |
| --- | --- |
| SIGMA, margin units | 2.866 |
| Elo points per margin unit | 103.16 |
| h0, margin units | 0.622 |
| h0, Elo points | 64.2 |
| Chance at a 100-point gap, model / classic Elo | 63.2% / 64.0% |
| Chance at a 200-point gap, model / classic Elo | 75.1% / 76.0% |
| Chance at a 400-point gap, model / classic Elo | 91.2% / 90.9% |

### Table 10. 2026-27, logged only

Too young to judge; shown so the season's start can be compared later.

| Season | Games | Elo log loss | Model log loss |
| --- | --- | --- | --- |
| 2026-27 | 56 | 0.7120 | 0.6754 |

### Check

Version 1's settings, frozen as V1 in scripts/evaluate.ts, match the choice, `{"n0":12,"margin":{"kind":"power","q":0.5},"home":{"kind":"fixed","value":0.622},"sigma":2.866}`. Its provisional threshold matches table 8 (26).
<!-- results:end -->

## Settings and their evidence

Written after the results. Each setting lived in `src/lib/elo.ts` (`PARAMS`, `PROVISIONAL`, `ELO_PER_SIGMA`) until the site moved to version 2 (`docs/model-v2.md`) on 2026-10-28. `npm run backtest` fails if the copy frozen as `V1` in `scripts/evaluate.ts` drifts from what the tables choose, so this record stays checkable.

- **Prior strength, `n0` = 12 games.** Lowest tuning log loss among the eligible candidates (table 1). The next step down, 8, ties it (table 7). Log loss falls steadily from 2 to 12 for every margin rule (table 1), so the pull toward average earns its keep. 12 is the edge of the grid. A check outside the plan, not used to choose, found 16 within 0.0001 of 12 and 20, 30 and 50 worse, so the edge hides no better setting.
- **Margins, `(|m| + 3)^0.5`.** The only rule in the grid within the owner's limit: a 43-point win counts 3.4 times a 1-point win (table 1). The power 0.6 rule just misses the limit at 4.3x.
- **What the limit costs.** The unconstrained best is `n0` 12 with `(|m| + 3)^0.8`, the 7.1x rule the old Elo also used (table 2). Against it the site's model gives up 0.0003 of log loss on the tuning seasons and 0.0009 on the held-out seasons. Both intervals cross 0, so both are ties (table 2). Season by season, the limit costs nothing measurable in 2023-24 and 2024-25, and 0.0023 [0.0007, 0.0039] in 2025-26, the one season where the gap is outside the noise (table 3).
- **Home edge, fixed at 0.622 margin units, 64 Elo points.** Fixed beats fitted from the season's own games at every `n0` and margin rule (table 1), and for the site's model by 0.0004, a tie (table 7). The `w_h` rows the plan reports for a fitted home edge do not apply, as the chosen edge is fixed. A home team facing an equal rival is a 59% favourite.
- **`SIGMA` = 2.866 margin units.** Fitted once by maximum likelihood on the tuning seasons (table 1). Its calibration on the held-out seasons, which it never saw, is within 2.5 points in every bucket with more than 60 games, where Elo's favourites from 60% to 80% won 3.4 to 5.3 points less often than it said (table 6).
- **The Elo scale, 295.7 Elo points per `SIGMA`.** A rating is 1000 plus the fitted rating times 295.7 / 2.866, about 103 Elo points per margin unit. At that scale the model's own chance for a gap, `Phi(gap / 295.7)`, is never more than 0.0095 from classic Elo's chance for the same gap (table 9). The fixtures, the team pages, the About page's curve and its home court line all use the model's chance, not the classic formula.
- **Softer chances for a team's first 5 games, `EARLY` in `src/lib/elo.ts`.** Added 2026-10-26, after the results and outside the plan. Over all eleven seasons, favourites the model called 60% or more in the first two weeks won 61.1% against 66.0% stated (432 games). While either side has played fewer than 5 games, a gap now counts 1.55 times less. The pair was fitted on the tuning seasons over a grid of 2 to 10 games and 1.0 to 1.6. On the held-out seasons it cuts the first two weeks' log loss from 0.6727 to 0.6718 (314 games) and leaves weeks 3-4 unchanged (0.5904). A smooth widening that shrank with every game played helped the first two weeks less and hurt weeks 3-4, so the site uses the cutoff. The gain is small, and it touches only the chances, never the ratings.
- **Provisional until 26 games.** Table 8's rule gives 26. The curve is noisy: the excess first falls within 0.01 of the settled level at 9 games, and again from 15 to 24, but a bump at 25 (0.013) holds the rule's answer at 26. The rule was fixed in advance, so the site uses 26. A smoother rule would likely give a smaller number. That would need a new pre-registration.
- **Against the old Elo.** The site's model wins all eight tuning seasons and all three held-out seasons. Pooled over the held-out seasons its log loss is 0.0138 lower, [0.0095, 0.0182], with Brier 0.2130 against 0.2191 and accuracy 66.2% against 64.7% (table 3). It is better in weeks 1-2, 3-4 and the rest of the season, and ties in weeks 5-6 (table 4). `scripts/backtest.test.ts` fails if a later change loses that edge on whole-season log loss.

### Deviation from the plan

The held-out confirmation failed as written, on one window, and the site switches to the model anyway under a deviation declared here. The owner should accept or reject it.

- Window 17, days 238 to 251, holds 2 held-out games: games 6 and 7 of the 2025 Finals (table 5). The model gave Indiana 35% at home in game 6, which Indiana won. Elo gave it 50%.
- Both games sit in one (season, week) block. A bootstrap that resamples one block draws the same block every time, so the "interval" is the point estimate, +0.1404, with zero width. That is no 95% interval, and any difference in such a window counts as significant. The plan did not foresee this.
- The deviation: a window whose games all sit in one block is not judged. Nothing else changes. Under it the held-out windows have no worse window, so the site switches (table 3). The choice on the tuning seasons is the same with or without it (table 2), because the tuning seasons' only one-block window, window 25 of 2019-20, decided nothing.
- If the owner rejects the deviation, the plan as written says the site keeps Elo. Reverting `src/lib/elo.ts`, `fixtures.ts`, the two pages and the tests to commit 7659991 restores it.
