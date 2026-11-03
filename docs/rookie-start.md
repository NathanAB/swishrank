# A rookie's starting level from draft pick and age

An investigation on past seasons, written on 2026-11-02. It changes no model. Version 4 (`docs/model-v4.md`) starts a top-three draft pick's box rating at the previous season's minutes-weighted mean Game Score per 36 plus 0.28, and every other rookie at replacement, 8.49 per 36. The question was whether one smooth rule from draft pick and age, for every rookie, predicts games better, and if it ties, how it changes current rookies' ratings. `node scripts/rookie-start.ts` reruns every table below; `node scripts/rookie-start.ts --fit` prints the fits alone in about a second.

## Answer

No. Every rule tried ties version 4 on the tuning seasons and does worse on 2023-24 to 2025-26 and on the games where rookies play most. Age adds nothing to pick. The levels rookies played at do not follow a smooth curve in pick: the top three played 3.1 to 3.6 per 36 above every other group, and picks 4 to 10, 11 to 30, 31 to 60 and undrafted rookies all played within 0.35 of each other. Even starting each rookie at the level he went on to play his first 500 minutes at, which no rule could know, does no better. A rookie's starting level is not where this model's accuracy is, so college stats, which could at best move a rookie's start toward that level, would very likely not help either.

## Data

- Rookies are version 3's (`newcomers` in `src/lib/rookies.ts`), 2016-17 to 2026-27. Each one's draft is from `src/data/draft.json`; every rookie is in it.
- Birth dates are ESPN's athlete pages' `displayDOB`, the endpoint `scripts/fetch-season.mjs` already reads for names and drafts. It is day first: Victor Wembanyama's is `4/1/2004`. Every one of the 1128 rookies has one. They are cached in `.cache/birth-dates.json`, which git ignores, because the repository keeps nothing about a player but his name.
- Age is years on February 1 of the rookie season's second calendar year, Basketball-Reference's season age, unrounded.
- A rookie's level is the Game Score per 36 of his first 500 career minutes, the last game's share prorated, less the previous season's minutes-weighted mean (`seasonMean` in `src/lib/v4.ts`). Groups are pooled and minutes-weighted.

| Season | Rookies | Drafted | Undrafted | No birth date |
| --- | --- | --- | --- | --- |
| 2016-17 | 104 | 65 | 39 | 0 |
| 2017-18 | 129 | 65 | 64 | 0 |
| 2018-19 | 105 | 58 | 47 | 0 |
| 2019-20 | 121 | 62 | 59 | 0 |
| 2020-21 | 94 | 59 | 35 | 0 |
| 2021-22 | 129 | 57 | 72 | 0 |
| 2022-23 | 85 | 49 | 36 | 0 |
| 2023-24 | 101 | 60 | 41 | 0 |
| 2024-25 | 104 | 56 | 48 | 0 |
| 2025-26 | 104 | 57 | 47 | 0 |
| 2026-27 | 52 | 45 | 7 | 0 |

## The levels rookies played at, 2016-17 to 2022-23

| Rookies | Players | Minutes | Level per 36 | Mean age |
| --- | --- | --- | --- | --- |
| Top three, version 4's rule | 21 | 10500 | +0.45 | 20.18 |
| Picks 1-3 | 22 | 11000 | +0.23 | 20.91 |
| Picks 4-10 | 53 | 26153 | -3.12 | 21.35 |
| Picks 11-30 | 152 | 71952 | -2.86 | 21.59 |
| Picks 31-60 | 188 | 70728 | -3.20 | 22.19 |
| Undrafted | 352 | 95566 | -3.09 | 24.04 |
| Every rookie | 767 | 275399 | -2.93 | 22.54 |

`docs/model-v4.md` gives +0.28 for the top three and 3.07 to 3.90 below the mean for later picks. This definition gives +0.45 and -2.86 to -3.20; the investigation behind version 4 did not keep its code, so the gap is in how the first 500 minutes are counted, not settled here. Replacement, 8.49, sat 3.17 to 4.80 per 36 below the previous season's mean for these rookies, 5.31 to 5.50 below for 2023-24 to 2025-26's and 5.50 below for 2026-27's, as the league's mean rose. Later picks and undrafted rookies played about 0.2 to 1.8 per 36 above it over 2016-17 to 2022-23, so a rule that starts them at their mean lifts them more on the later seasons than on the seasons it was fitted on.

## The curves

Minutes-weighted least squares over drafted rookies: level = a + b ln(pick) + c (age - 20). Undrafted rookies have their own mean. The levels at each pick are at the fit's mean age, 21.75.

| Curve | a | b | c | Undrafted mean | Pick 1 | Pick 3 | Pick 10 | Pick 30 | Pick 45 | Pick 60 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pick and age, 2016-17 to 2022-23 | -0.97 | -0.65 | 0.04 | -3.09 | -0.89 | -1.61 | -2.40 | -3.12 | -3.38 | -3.57 |
| Pick alone, 2016-17 to 2022-23 | -0.96 | -0.63 |  | -3.09 | -0.96 | -1.65 | -2.41 | -3.11 | -3.36 | -3.55 |
| Pick and age, 2016-17 to 2019-20 | 0.08 | -0.94 | 0.01 | -3.04 | +0.11 | -0.92 | -2.05 | -3.09 | -3.47 | -3.74 |

Age is worth 0.04 per 36 a year, nothing. The log curve cannot bend sharply enough: it puts the first pick at -0.89 where the top three played at +0.23 to +0.45, and lifts picks 4 to 10 above where they played. How well each rule predicts the levels, minutes-weighted, over every rookie; RMSE includes each rookie's sampling noise over at most 500 minutes, so no rule gets near 0:

| Rule | RMSE, 2016-17 to 2022-23 | R², 2016-17 to 2022-23 | RMSE, 2023-24 to 2025-26 | R², 2023-24 to 2025-26 |
| --- | --- | --- | --- | --- |
| Everyone at replacement (version 3) | 3.29 | -0.17 | 3.69 | -0.43 |
| Version 4: top three at +0.28, the rest at replacement | 3.17 | -0.09 | 3.62 | -0.37 |
| Pick alone, undrafted at replacement | 3.09 | -0.03 | 3.27 | -0.12 |
| Pick and age, undrafted at replacement | 3.09 | -0.03 | 3.26 | -0.11 |
| Pick and age, undrafted at their mean | 3.00 | 0.03 | 3.05 | 0.03 |
| Top three at +0.28, every other rookie at -3.06 | 2.97 | 0.05 | 3.10 | -0.00 |

The curves fit the levels better than version 4's rule, almost all of it by starting later picks above replacement, not by ranking them. No rule explains more than 5% of the spread in levels.

## Against version 4

Each rule replaces version 4's starting level through `boxRatings`'s `level`, with everything else as the site runs version 4: the NBA report's lineups, the fill-in term, the 5-appearance minutes. Each rule, version 4 included, has its own SIGMA and early widening fitted on the tuning seasons, as `scripts/backtest-v4.ts` does. Log loss minus version 4's, with the weekly block bootstrap's 95% interval. Rookie-heavy games are those where either side gave rookies a fifth of its minutes or more in the game's box score; first 10 games are those where either side had played fewer than 10. The curves were fitted on rookies of 2016-17 to 2022-23, inside the tuning seasons, so the tuning rows favour them.

| Rule | Games | Version 4 log loss | Minus version 4 [95%] | Verdict |
| --- | --- | --- | --- | --- |
| Pick and age, undrafted at replacement, tuning, 2015-16 to 2022-23 | 10206 | 0.6128 | +0.0000 [-0.0001, +0.0002] | tie |
| Pick and age, undrafted at replacement, exploration, 2023-24 to 2025-26 | 3962 | 0.5931 | +0.0003 [+0.0000, +0.0006] | worse |
| Pick and age, undrafted at replacement, rookie-heavy, tuning | 2768 | 0.5772 | +0.0003 [-0.0000, +0.0006] | tie |
| Pick and age, undrafted at replacement, rookie-heavy, exploration | 1088 | 0.5111 | +0.0011 [+0.0003, +0.0020] | worse |
| Pick and age, undrafted at replacement, first 10 games, tuning | 1247 | 0.6363 | -0.0003 [-0.0009, +0.0004] | tie |
| Pick and age, undrafted at replacement, first 10 games, exploration | 466 | 0.6102 | +0.0012 [-0.0002, +0.0026] | tie |
| Pick alone, undrafted at replacement, tuning | 10206 | 0.6128 | +0.0000 [-0.0001, +0.0002] | tie |
| Pick alone, undrafted at replacement, exploration | 3962 | 0.5931 | +0.0003 [+0.0000, +0.0007] | worse |
| Pick alone, undrafted at replacement, rookie-heavy, tuning | 2768 | 0.5772 | +0.0003 [-0.0000, +0.0007] | tie |
| Pick alone, undrafted at replacement, rookie-heavy, exploration | 1088 | 0.5111 | +0.0012 [+0.0004, +0.0020] | worse |
| Pick alone, undrafted at replacement, first 10 games, tuning | 1247 | 0.6363 | -0.0003 [-0.0009, +0.0004] | tie |
| Pick alone, undrafted at replacement, first 10 games, exploration | 466 | 0.6102 | +0.0012 [-0.0001, +0.0025] | tie |
| Pick and age, undrafted at their mean, tuning | 10206 | 0.6128 | +0.0001 [-0.0001, +0.0002] | tie |
| Pick and age, undrafted at their mean, exploration | 3962 | 0.5931 | +0.0008 [+0.0004, +0.0012] | worse |
| Pick and age, undrafted at their mean, rookie-heavy, tuning | 2768 | 0.5772 | +0.0004 [-0.0000, +0.0008] | tie |
| Pick and age, undrafted at their mean, rookie-heavy, exploration | 1088 | 0.5111 | +0.0027 [+0.0017, +0.0037] | worse |
| Pick and age, undrafted at their mean, first 10 games, tuning | 1247 | 0.6363 | -0.0001 [-0.0008, +0.0005] | tie |
| Pick and age, undrafted at their mean, first 10 games, exploration | 466 | 0.6102 | +0.0014 [+0.0002, +0.0025] | worse |
| Top three at +0.28, every other rookie at -3.06, tuning | 10206 | 0.6128 | +0.0001 [-0.0001, +0.0002] | tie |
| Top three at +0.28, every other rookie at -3.06, exploration | 3962 | 0.5931 | +0.0007 [+0.0003, +0.0011] | worse |
| Top three at +0.28, every other rookie at -3.06, rookie-heavy, tuning | 2768 | 0.5772 | +0.0004 [+0.0001, +0.0008] | worse |
| Top three at +0.28, every other rookie at -3.06, rookie-heavy, exploration | 1088 | 0.5111 | +0.0026 [+0.0017, +0.0036] | worse |
| Top three at +0.28, every other rookie at -3.06, first 10 games, tuning | 1247 | 0.6363 | -0.0001 [-0.0005, +0.0003] | tie |
| Top three at +0.28, every other rookie at -3.06, first 10 games, exploration | 466 | 0.6102 | +0.0012 [+0.0005, +0.0020] | worse |
| Ceiling: each rookie at his own first 500 minutes' level, tuning | 10206 | 0.6128 | +0.0001 [-0.0002, +0.0005] | tie |
| Ceiling: each rookie at his own first 500 minutes' level, exploration | 3962 | 0.5931 | +0.0015 [+0.0007, +0.0023] | worse |
| Ceiling: each rookie at his own first 500 minutes' level, rookie-heavy, tuning | 2768 | 0.5772 | +0.0009 [-0.0000, +0.0018] | tie |
| Ceiling: each rookie at his own first 500 minutes' level, rookie-heavy, exploration | 1088 | 0.5111 | +0.0026 [+0.0008, +0.0046] | worse |
| Ceiling: each rookie at his own first 500 minutes' level, first 10 games, tuning | 1247 | 0.6363 | -0.0007 [-0.0019, +0.0004] | tie |
| Ceiling: each rookie at his own first 500 minutes' level, first 10 games, exploration | 466 | 0.6102 | +0.0039 [+0.0015, +0.0072] | worse |

Out of sample: the pick and age curve fitted on rookies of 2016-17 to 2019-20, against version 4, both with SIGMA and early widening fitted on 2015-16 to 2019-20, scored on 2020-21 to 2025-26. A 2019-20 rookie's first 500 minutes can run into 2020-21, a small overlap.

| Games | Count | Version 4 log loss | Minus version 4 [95%] | Verdict |
| --- | --- | --- | --- | --- |
| 2020-21 to 2025-26 | 7776 | 0.6102 | +0.0002 [-0.0001, +0.0004] | tie |
| Rookie-heavy, 2020-21 to 2025-26 | 2140 | 0.5380 | +0.0010 [+0.0005, +0.0016] | worse |
| First 10 games, 2020-21 to 2025-26 | 936 | 0.6431 | +0.0002 [-0.0010, +0.0013] | tie |

The more a rule lifts rookies above replacement, the worse it does on the rookie-heavy games of 2023-24 to 2025-26: +0.0011 to +0.0012 for the curves, which lift drafted rookies, and +0.0026 to +0.0027 for the rules that also lift undrafted rookies. The ceiling uses each rookie's raw level, which is noisy for a rookie with few minutes, so it is not a clean upper bound; the curves have no such noise and lose the same way. Why lifting rookies hurts is not tested here. A guess: the seed, from sportsbooks' win totals, already prices a team's rookies, and the team part absorbs the rest, so a higher rookie start counts their quality twice, most on the teams that play rookies most.

## 2026-27's rookies

The 15 with the most minutes through 2026-11-01. Start is the box rating's starting level against 2025-26's mean of 13.99 per 36. Value is what the site shows, Elo points per 48 minutes, from the latest fit with the site's SIGMA. The two-step rule is the top three at +0.28 and every other rookie at -3.06.

| Player | Team | Pick | Age | Minutes | Start, version 4 | Start, pick and age | Start, two-step | Value, version 4 | Value, pick and age | Value, two-step |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Yaxel Lendeborg | GS | 11 | 24.34 | 226 | -5.50 | -2.35 | -3.06 | 9 | 23 | 18 |
| Darius Acuff Jr. | SAC | 7 | 20.21 | 219 | -5.50 | -2.23 | -3.06 | -46 | -32 | -37 |
| Caleb Wilson | CHI | 4 | 20.54 | 204 | -5.50 | -1.85 | -3.06 | -36 | -20 | -26 |
| Cameron Boozer | MEM | 3 | 19.54 | 186 | +0.28 | -1.71 | +0.28 | 49 | 37 | 47 |
| Darryn Peterson | UTAH | 2 | 20.04 | 179 | +0.28 | -1.42 | +0.28 | -19 | -30 | -21 |
| Keaton Wagler | LAC | 5 | 19.99 | 151 | -5.50 | -2.02 | -3.06 | -30 | -12 | -18 |
| Kingston Flemings | ATL | 8 | 20.08 | 142 | -5.50 | -2.33 | -3.06 | -31 | -15 | -19 |
| Trevon Brazile | DEN | 35 | 24.07 | 114 | -5.50 | -3.12 | -3.06 | -29 | -16 | -17 |
| Aday Mara | OKC | 12 | 21.82 | 108 | -5.50 | -2.51 | -3.06 | -39 | -23 | -27 |
| Emanuel Sharp | SAC | 45 | 22.91 | 107 | -5.50 | -3.33 | -3.06 | -61 | -50 | -48 |
| Brayden Burries | MIL | 10 | 21.37 | 95 | -5.50 | -2.41 | -3.06 | -30 | -12 | -17 |
| Bennett Stirtz | OKC | 16 | 23.33 | 93 | -5.50 | -2.64 | -3.06 | -49 | -33 | -37 |
| Morez Johnson Jr. | DAL | 9 | 21.02 | 93 | -5.50 | -2.36 | -3.06 | -22 | -3 | -8 |
| Mikel Brown Jr. | BKN | 6 | 20.83 | 91 | -5.50 | -2.10 | -3.06 | -39 | -19 | -26 |
| Allen Graves | TOR | 19 | 20.52 | 82 | -5.50 | -2.87 | -3.06 | -24 | -9 | -10 |

The pick and age curve lifts picks 4 and later by 11 to 20 Elo points per 48 and lowers the top three by 11 to 12, so it narrows the gap between pick 3 and pick 4 that the owner finds arbitrary, at a cost in accuracy the backtest measures.
