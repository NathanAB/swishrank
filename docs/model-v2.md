# The rating model, version 2

Version 2 adds three things to the model in `docs/model.md`:

- A preseason seed for every team, from sportsbooks' preseason win totals.
- A back-to-back adjustment.
- A value for every player, so a game's prediction reflects who is expected to play.

This file holds the plan version 2 is chosen and confirmed by, written before the confirmation season is scored, then the results. Where this plan says "as in version 1", the definition in `docs/model.md`'s pre-registration applies unchanged.

On 2026-11-13 the owner retired this plan's confirmation as a gate (`docs/adr/0002-versions-are-judged-on-past-seasons.md`). A version is now accepted on past seasons its settings never saw, because one future season's games cannot tell a 0.002 gain in log loss from luck. The Confirmation section below and the two deviations under Settings and their evidence stay as written, but their rule no longer decides anything, and no 2026-27 result returns the site to version 1. `npm run backtest:v2` keeps logging 2026-27's games in tables 4 and 11 as a running record.

## Pre-registration

Written on 2026-10-28, after an exploration on the tuning and exploration seasons. No version 2 candidate has been scored on a 2026-27 game. The backtest prints the SHA-256 of this section, from the line after its heading to the line before the next `## ` heading, as in version 1. The hash at writing is recorded under Results.

### What came before this plan

An exploration on 2026-10-28 scored 25 changes against the shipped model and against Vegas moneylines. Its decision log is `docs/model-v2-exploration.tsv`. It tuned on 2015-16 to 2022-23 and looked twice at 2023-24 to 2025-26, so those three seasons cannot confirm anything in this plan. The settings fixed below come from that exploration. The kept steps, with out-of-fold log loss on the tuning games that have a Vegas line (Vegas: 0.6028):

| Step | Log loss | Change |
| --- | --- | --- |
| Shipped model | 0.6303 | |
| Preseason seed from win totals | 0.6229 | -0.0074 [-0.0097, -0.0052] |
| Back-to-back adjustment | 0.6211 | -0.0016 [-0.0026, -0.0006] |
| Player values, lineup known at tip | 0.6188 | -0.0023 [-0.0036, -0.0010] |
| Stronger team seed, player values carried between seasons | 0.6179 | -0.0009 [-0.0014, -0.0005] |
| Box-score rating as each player's prior | 0.6142 | -0.0036 [-0.0047, -0.0026] |
| Heavier box-score weight, no carried values | 0.6104 | -0.0036 [-0.0051, -0.0022] |

Every player step above used the lineup known at tip: the players who actually played, at their usual minutes. The site builds once a day before games, so it cannot know that lineup. This plan uses the previous game's rotation instead, and the exploration never scored that version out of fold on the tuning seasons with box-score ratings. So this plan tunes the player settings again, on the tuning seasons only. On 2023-24 to 2025-26, the exploration's lineup-at-tip version scored 0.5932, its previous-game version 0.6023, the shipped model 0.6137, and Vegas 0.5819.

### Data and split

- Games are the final, scored games in `src/data/games/<season>.json`, as in version 1.
- Preseason win totals: each team's over/under regular-season win total and the number of games it was set for, one file per season. The backtest's history comes from Basketball-Reference's preseason odds pages. Each new season's totals are entered by hand before opening night.
- Box scores: for each final game, every player's minutes and box line (points, field goals and attempts, free throws and attempts, offensive and defensive rebounds, assists, steals, blocks, turnovers, fouls), from ESPN's game summary endpoint. A game with rosters but no player lines (about 12% of 2015-16 to 2017-18) counts in the team fit only.
- Vegas lines, for reporting only: ESPN's stored pre-game moneylines from sportsbooks. Books marked live or opening and model sites are dropped. Each book's cut is removed by scaling its two chances to sum to 1. A book whose moneyline is more than 0.2 of chance from its own spread is dropped. The chance is the median across books.
- Tuning seasons: 2015-16 to 2022-23. Every choice is made on these alone.
- Exploration seasons: 2023-24 to 2025-26. Reported, never used to choose or confirm.
- Confirmation season: 2026-27, scored once after its last game.

### Score

As in version 1: log loss, with Brier score and accuracy reported and never used to choose. Days, weeks and two-week windows count from each season's first game day, as in version 1.

### The baseline

The site's model at commit 3a88d0b: `src/lib/elo.ts` `PARAMS`, `EARLY` and `ELO_PER_SIGMA`, pricing every game as the site does.

### The model

Ratings are in version 1's margin units: a final margin `m` counts as `sign(m) * (|m| + 3)^0.5`. The home edge is fixed at 0.622, and 0 at a neutral site. These settings are fixed:

- **Expected home margin.** `r_home - r_away + home edge + b2b + sum over the home lineup of s_p * v_p - sum over the away lineup of s_p * v_p`.
- **Team seed.** Team `t`'s prior centre is `5.0 * (W_t / G - 0.5)`, shifted so the 30 centres sum to 0. `W_t` is its preseason win total and `G` the games the totals were set for. A season with no totals uses `0.7 *` each team's last fitted rating of the season before, shifted the same way. The exploration tested that fallback only in a model without players.
- **Team prior strength.** `96 * exp(-day / 120)` games, so the seed fades over the season.
- **Back-to-back.** `b2b = 0.4 * (away on a second night - home on a second night)`, where a team is on a second night when it played on the previous US Eastern day. It is taken out of every margin before the fit, so team ratings do not absorb it.
- **Player shares.** In the fit, a player who played counts with share `minutes / 48`. A team's shares sum to about 5.
- **Box rating.** A player's box rating before a game day is `36 * (G + 8.49 * 400 / 36) / (M + 400)`, minus the minutes-weighted mean box rating of every player. `G` and `M` are his Game Score and minutes summed over every earlier appearance, any team and any season. An appearance's weight halves with every half-life, in days, since it was played. The mean is weighted by those decayed minutes. Game Score is `PTS + 0.4 FGM - 0.7 FGA - 0.4 (FTA - FTM) + 0.7 OREB + 0.3 DREB + STL + 0.7 AST + 0.7 BLK - 0.4 PF - TO`. 8.49 is the 20th percentile of per-36 Game Score among players with at least 500 minutes in 2015-16. A player with no appearances sits at 8.49.
- **Player prior.** A player's prior centre on a day is `a *` his box rating, with strength `np` games. Player values are fitted fresh each season. A player's history reaches a new season only through his box rating.
- **Lineup for a prediction.** The players who played in the team's previous game this season and whose expected minutes are at least 10. A player's expected minutes are the mean of his last 10 appearances, or 15 with none. They are scaled so the team's total is 240, and `s_p` is expected minutes / 48. A team's first game of a season has no player part.
- **The fit.** After each game day, one ridge least-squares fit over every final game of the season so far, with team and player columns together, each pulled toward its prior centre with its prior strength. A day's games are predicted from the fit through the day before.
- **The chance.** `p = Phi(e / (SIGMA * w))`, where `w` is the early widening factor when either side has played fewer than 5 games, and 1 otherwise.

### Candidates

The grid is fixed here and is not extended after any result is seen.

- `a`: 0.08, 0.11, 0.15.
- `np`: 160, 320, 640.
- Box rating half-life: 180 and 365 days.

That is 18 candidates. For each, `SIGMA` is fitted by maximum likelihood on all tuning games. Then the early widening factor is fitted by maximum likelihood on the tuning games where either side had played fewer than 5.

### Uncertainty and constraint

As in version 1: the weekly block bootstrap, the two-week window constraint, and the declared deviation that a window whose games sit in one block is not judged.

### Choosing

1. A candidate is eligible when it passes the window constraint against the baseline on the tuning seasons.
2. Version 2 is the eligible candidate with the lowest pooled tuning log loss.
3. If no candidate is eligible, the site keeps version 1.

### Confirmation

Run once, after the last game of 2026-27.

- Score version 2 against the baseline on every final 2026-27 game: the pooled log loss difference with its interval, and the window constraint.
- Version 2 stays on, or goes on, the site when its pooled 2026-27 log loss is below the baseline's and it is worse in no judged window. Otherwise the site returns to version 1.
- The owner may switch the site to version 2 before 2026-27 ends. The confirmation runs either way.

### Reported, not used to choose

- What each piece adds on the tuning seasons: the seed alone, the seed and the back-to-back adjustment, then the players.
- Version 2, the baseline and Vegas on the same games: tuning, exploration and confirmation seasons.
- Log loss by part of season (weeks 1-2, 3-4, 5-6, the last three weeks of the regular season, the playoffs) and calibration buckets, as in version 1.
- The lineup-known-at-tip version of the chosen candidate, as the ceiling a pre-game lineup feed could reach.

### Provisional threshold

Version 1's rule, run again on version 2's chosen candidate.

## Results

Generated by `npm run backtest:v2`, which rewrites the text between the markers below.

The pre-registration's SHA-256 when it was written: `d0b48eb08211353a22300ab71eadb7ff59fc4303a2a8a5c0b631bfae4b7c0cad`.

<!-- results:start -->
Pre-registration SHA-256 now: `d0b48eb08211353a22300ab71eadb7ff59fc4303a2a8a5c0b631bfae4b7c0cad`, unchanged since it was written. Bootstrap: 2000 resamples of whole weeks, seed 20261025.

### Table 1. Every candidate on the tuning seasons

Log loss pooled over the 8 tuning seasons (10206 games), against version 1 as shipped, 0.6298. Lower is better. SIGMA, in margin units, and the early widening are each candidate's own, fitted by maximum likelihood on the tuning seasons. Windows worse counts the pooled two-week windows where the candidate is worse than version 1, judging no window whose games sit in two or fewer (season, week) blocks, the deviation declared under Settings and their evidence. Sorted by log loss.

| Candidate | SIGMA | Early widening | Log loss | vs version 1 [95%] | Seasons won | Windows worse | Brier | Accuracy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| a 0.08, np 320, half-life 365 | 2.997 | 1.15 | 0.6156 | -0.0142 [-0.0172, -0.0110] | 8 of 8 | 0 | 0.2135 | 66.5% |
| a 0.08, np 640, half-life 365 | 2.980 | 1.16 | 0.6157 | -0.0142 [-0.0172, -0.0109] | 8 of 8 | 0 | 0.2135 | 66.6% |
| a 0.08, np 160, half-life 365 | 3.033 | 1.15 | 0.6157 | -0.0141 [-0.0170, -0.0110] | 8 of 8 | 0 | 0.2135 | 66.4% |
| a 0.08, np 320, half-life 180 | 2.953 | 1.13 | 0.6157 | -0.0141 [-0.0170, -0.0109] | 8 of 8 | 0 | 0.2135 | 66.5% |
| a 0.08, np 640, half-life 180 | 2.933 | 1.13 | 0.6158 | -0.0141 [-0.0171, -0.0109] | 8 of 8 | 0 | 0.2135 | 66.5% |
| a 0.11, np 320, half-life 180 | 3.120 | 1.16 | 0.6158 | -0.0140 [-0.0173, -0.0105] | 8 of 8 | 0 | 0.2135 | 66.3% |
| a 0.11, np 640, half-life 180 | 3.106 | 1.17 | 0.6159 | -0.0140 [-0.0173, -0.0105] | 8 of 8 | 0 | 0.2135 | 66.4% |
| a 0.08, np 160, half-life 180 | 2.994 | 1.12 | 0.6159 | -0.0140 [-0.0169, -0.0109] | 8 of 8 | 0 | 0.2136 | 66.3% |
| a 0.11, np 320, half-life 365 | 3.190 | 1.20 | 0.6159 | -0.0139 [-0.0173, -0.0104] | 8 of 8 | 0 | 0.2136 | 66.5% |
| a 0.11, np 160, half-life 365 | 3.213 | 1.20 | 0.6159 | -0.0139 [-0.0172, -0.0105] | 8 of 8 | 0 | 0.2136 | 66.2% |
| a 0.11, np 160, half-life 180 | 3.150 | 1.16 | 0.6159 | -0.0139 [-0.0171, -0.0105] | 8 of 8 | 0 | 0.2136 | 66.3% |
| a 0.11, np 640, half-life 365 | 3.180 | 1.21 | 0.6160 | -0.0139 [-0.0172, -0.0103] | 8 of 8 | 0 | 0.2136 | 66.5% |
| a 0.15, np 320, half-life 180 | 3.386 | 1.21 | 0.6169 | -0.0130 [-0.0166, -0.0092] | 8 of 8 | 0 | 0.2140 | 66.3% |
| a 0.15, np 160, half-life 180 | 3.400 | 1.21 | 0.6169 | -0.0130 [-0.0165, -0.0092] | 8 of 8 | 0 | 0.2140 | 66.1% |
| a 0.15, np 640, half-life 180 | 3.382 | 1.21 | 0.6169 | -0.0129 [-0.0165, -0.0091] | 8 of 8 | 0 | 0.2140 | 66.3% |
| a 0.15, np 160, half-life 365 | 3.497 | 1.26 | 0.6171 | -0.0127 [-0.0164, -0.0089] | 8 of 8 | 0 | 0.2141 | 66.1% |
| a 0.15, np 320, half-life 365 | 3.494 | 1.26 | 0.6172 | -0.0127 [-0.0164, -0.0089] | 8 of 8 | 0 | 0.2141 | 66.2% |
| a 0.15, np 640, half-life 365 | 3.496 | 1.26 | 0.6173 | -0.0125 [-0.0163, -0.0087] | 8 of 8 | 0 | 0.2142 | 66.2% |

### Table 2. The choice

Version 2 is the candidate with the lowest tuning log loss among the 18 of 18 that are worse than version 1 in no judged window. A window is judged when its games sit in more than two (season, week) blocks, the deviation declared under Settings and their evidence.

| Candidate | SIGMA | Early widening | Tuning log loss | vs version 1 [95%] | Verdict | Windows worse |
| --- | --- | --- | --- | --- | --- | --- |
| a 0.08, np 320, half-life 365 | 2.997 | 1.15 | 0.6156 | -0.0142 [-0.0172, -0.0110] | better | 0 |

### Table 3. What each piece adds, tuning seasons

Each step adds one piece to the step above and has its own SIGMA and early widening, fitted on the tuning seasons. The change is the step minus the step above.

| Step | SIGMA | Early widening | Log loss | Change [95%] |
| --- | --- | --- | --- | --- |
| Version 1 as shipped | 2.866 | 1.55 | 0.6298 |  |
| Seed | 2.604 | 1.01 | 0.6226 | -0.0073 [-0.0099, -0.0047] |
| Seed and back-to-back | 2.630 | 1.01 | 0.6211 | -0.0014 [-0.0025, -0.0004] |
| Players: version 2, a 0.08, np 320, half-life 365 | 2.997 | 1.15 | 0.6156 | -0.0055 [-0.0077, -0.0035] |

### Table 4. Version 2, version 1 and Vegas on the same games

Every game with a Vegas line: the median of the sportsbooks' moneylines with their cut removed. Vegas is reported, never used to choose. The exploration seasons informed the plan and confirm nothing; 2026-27 is logged until its last game.

| Seasons | Games | Vegas log loss | Version 1 log loss | Version 2 log loss | Version 2 - version 1 [95%] | Version 2 - Vegas [95%] |
| --- | --- | --- | --- | --- | --- | --- |
| Tuning, 2015-16 to 2022-23 | 10162 | 0.6028 | 0.6299 | 0.6157 | -0.0142 [-0.0172, -0.0110] | +0.0128 [+0.0092, +0.0165] |
| Exploration, 2023-24 to 2025-26 | 3962 | 0.5819 | 0.6137 | 0.6015 | -0.0122 [-0.0182, -0.0061] | +0.0195 [+0.0139, +0.0249] |
| 2026-27 so far | 56 | 0.5623 | 0.6767 | 0.6129 | -0.0638 [-0.1794, -0.0549] | +0.0505 [+0.0469, +0.0973] |

### Table 5. By part of the season

Days count from each season's first game day. The last three weeks end on the season's last regular-season game day.

| Seasons | Part | Games | Version 1 log loss | Version 2 log loss | Version 2 - version 1 [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Tuning | Weeks 1-2 | 799 | 0.6773 | 0.6402 | -0.0371 [-0.0565, -0.0202] | better |
| Tuning | Weeks 3-4 | 823 | 0.6446 | 0.6144 | -0.0303 [-0.0390, -0.0209] | better |
| Tuning | Weeks 5-6 | 817 | 0.6332 | 0.6115 | -0.0217 [-0.0314, -0.0121] | better |
| Tuning | Last 3 weeks of the regular season | 1229 | 0.6239 | 0.6113 | -0.0126 [-0.0220, -0.0040] | better |
| Tuning | Play-in and playoffs | 687 | 0.6298 | 0.6260 | -0.0038 [-0.0106, +0.0037] | tie |
| Exploration | Weeks 1-2 | 314 | 0.6718 | 0.6317 | -0.0401 [-0.0605, -0.0131] | better |
| Exploration | Weeks 3-4 | 305 | 0.5904 | 0.5771 | -0.0133 [-0.0512, +0.0194] | tie |
| Exploration | Weeks 5-6 | 289 | 0.6057 | 0.6157 | +0.0100 [-0.0128, +0.0298] | tie |
| Exploration | Last 3 weeks of the regular season | 499 | 0.5742 | 0.5498 | -0.0244 [-0.0307, -0.0183] | better |
| Exploration | Play-in and playoffs | 269 | 0.6449 | 0.6436 | -0.0013 [-0.0106, +0.0078] | tie |

### Table 6. Two-week windows, tuning seasons pooled

Window w holds days 14w to 14w + 13 of each season. The constraint fails on a window marked worse; a window of two or fewer (season, week) blocks is not judged.

| Window | Days | Games | Blocks | Version 1 log loss | Version 2 log loss | Version 2 - version 1 [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0-13 | 799 | 16 | 0.6773 | 0.6402 | -0.0371 [-0.0565, -0.0202] | better |
| 1 | 14-27 | 823 | 16 | 0.6446 | 0.6144 | -0.0303 [-0.0390, -0.0209] | better |
| 2 | 28-41 | 817 | 16 | 0.6332 | 0.6115 | -0.0217 [-0.0314, -0.0121] | better |
| 3 | 42-55 | 818 | 16 | 0.6220 | 0.6078 | -0.0141 [-0.0229, -0.0055] | better |
| 4 | 56-69 | 781 | 16 | 0.6539 | 0.6389 | -0.0151 [-0.0254, -0.0037] | better |
| 5 | 70-83 | 789 | 16 | 0.6142 | 0.6058 | -0.0084 [-0.0150, -0.0010] | better |
| 6 | 84-97 | 825 | 16 | 0.6331 | 0.6267 | -0.0064 [-0.0138, +0.0007] | tie |
| 7 | 98-111 | 794 | 16 | 0.6118 | 0.5982 | -0.0137 [-0.0201, -0.0067] | better |
| 8 | 112-125 | 600 | 16 | 0.5965 | 0.5956 | -0.0008 [-0.0093, +0.0080] | tie |
| 9 | 126-139 | 792 | 16 | 0.6374 | 0.6262 | -0.0111 [-0.0183, -0.0020] | better |
| 10 | 140-153 | 704 | 15 | 0.5873 | 0.5827 | -0.0046 [-0.0154, +0.0061] | tie |
| 11 | 154-167 | 651 | 14 | 0.6183 | 0.6094 | -0.0088 [-0.0189, +0.0008] | tie |
| 12 | 168-181 | 431 | 14 | 0.6237 | 0.6119 | -0.0117 [-0.0329, +0.0081] | tie |
| 13 | 182-195 | 212 | 14 | 0.6243 | 0.6162 | -0.0080 [-0.0231, +0.0069] | tie |
| 14 | 196-209 | 111 | 14 | 0.6395 | 0.6389 | -0.0006 [-0.0167, +0.0144] | tie |
| 15 | 210-223 | 58 | 13 | 0.6365 | 0.6336 | -0.0029 [-0.0303, +0.0221] | tie |
| 16 | 224-237 | 27 | 11 | 0.7042 | 0.6785 | -0.0257 [-0.0510, -0.0031] | better |
| 17 | 238-251 | 2 | 2 | 0.8799 | 0.8758 | -0.0040 [-0.0314, +0.0234] | tie, two blocks, not judged |
| 20 | 280-293 | 66 | 2 | 0.7014 | 0.6956 | -0.0057 [-0.0153, +0.0100] | tie, two blocks, not judged |
| 21 | 294-307 | 55 | 2 | 0.6790 | 0.6649 | -0.0141 [-0.0255, -0.0023] | better, two blocks, not judged |
| 22 | 308-321 | 24 | 2 | 0.6851 | 0.6792 | -0.0059 [-0.0107, -0.0025] | better, two blocks, not judged |
| 23 | 322-335 | 15 | 2 | 0.6885 | 0.7237 | +0.0352 [+0.0329, +0.0386] | worse, two blocks, not judged |
| 24 | 336-349 | 9 | 2 | 0.6826 | 0.7189 | +0.0363 [+0.0256, +0.0577] | worse, two blocks, not judged |
| 25 | 350-363 | 3 | 1 | 0.6506 | 0.6223 | -0.0284 [-0.0284, -0.0284] | better, one block, not judged |

### Table 7. Calibration, version 2

Games bucketed by the favourite's stated chance. A calibrated model's favourites win about as often as it says.

| Stated chance | Tuning games | Says | Favourite won | Exploration games | Says | Favourite won |
| --- | --- | --- | --- | --- | --- | --- |
| 50-55% | 1951 | 52.5% | 54.5% | 632 | 52.4% | 53.0% |
| 55-60% | 1726 | 57.6% | 58.0% | 674 | 57.5% | 57.3% |
| 60-65% | 1751 | 62.5% | 64.2% | 613 | 62.4% | 61.0% |
| 65-70% | 1412 | 67.5% | 69.3% | 538 | 67.5% | 65.1% |
| 70-75% | 1215 | 72.4% | 72.3% | 491 | 72.5% | 74.3% |
| 75-80% | 970 | 77.3% | 77.6% | 384 | 77.4% | 80.2% |
| 80-85% | 636 | 82.3% | 80.7% | 308 | 82.3% | 81.2% |
| 85-90% | 389 | 87.0% | 86.6% | 209 | 87.1% | 88.5% |
| 90-95% | 148 | 91.7% | 89.9% | 101 | 92.1% | 89.1% |
| 95-100% | 8 | 96.5% | 100.0% | 12 | 96.0% | 100.0% |

### Table 8. The lineup known at tip

The version 2 with each side's lineup taken from the players who played in the game itself, at their usual minutes, with its own SIGMA (2.913) and early widening (1.21). It is the ceiling a pre-game lineup feed could reach; the site cannot know who plays.

| Seasons | Games | Version 2 log loss | Lineup at tip log loss | At tip - version 2 [95%] | At tip - Vegas [95%] |
| --- | --- | --- | --- | --- | --- |
| Tuning | 10206 | 0.6156 | 0.6112 | -0.0045 [-0.0061, -0.0030] | +0.0084 [+0.0055, +0.0113] |
| Exploration | 3962 | 0.6015 | 0.5946 | -0.0069 [-0.0094, -0.0044] | +0.0126 [+0.0078, +0.0174] |

### Table 9. Provisional threshold

Version 1's rule on the version 2. k is the number of games the less experienced side had played before a game. E(k) is the mean excess log loss (pre-game, as priced, minus the season's final fit at SIGMA) of the tuning seasons' games with k within 2 of k. The settled level, games with k from 40 to 59, is 0.0243. The threshold is the first k from which E stays within 0.01 of it: **8 games**.

| k | Games at k | E(k) | E(k) - settled |
| --- | --- | --- | --- |
| 0 | 129 | 0.0134 | -0.0109 |
| 1 | 128 | 0.0202 | -0.0041 |
| 2 | 125 | 0.0277 | +0.0035 |
| 3 | 127 | 0.0331 | +0.0088 |
| 4 | 121 | 0.0363 | +0.0120 |
| 5 | 126 | 0.0431 | +0.0189 |
| 6 | 124 | 0.0397 | +0.0154 |
| 7 | 127 | 0.0363 | +0.0121 |
| 8 | 117 | 0.0296 | +0.0053 |
| 9 | 123 | 0.0284 | +0.0041 |
| 10 | 124 | 0.0259 | +0.0017 |
| 11 | 118 | 0.0282 | +0.0040 |
| 12 | 126 | 0.0232 | -0.0011 |
| 13 | 125 | 0.0273 | +0.0030 |
| 14 | 120 | 0.0241 | -0.0002 |
| 15 | 117 | 0.0170 | -0.0073 |
| 16 | 123 | 0.0166 | -0.0076 |
| 17 | 121 | 0.0179 | -0.0064 |
| 18 | 122 | 0.0128 | -0.0115 |
| 19 | 126 | 0.0134 | -0.0109 |
| 20 | 119 | 0.0155 | -0.0087 |
| 21 | 123 | 0.0138 | -0.0105 |
| 22 | 121 | 0.0124 | -0.0118 |
| 23 | 127 | 0.0220 | -0.0023 |
| 24 | 114 | 0.0261 | +0.0018 |
| 25 | 124 | 0.0280 | +0.0037 |
| 26 | 119 | 0.0265 | +0.0023 |
| 27 | 115 | 0.0291 | +0.0049 |
| 28 | 120 | 0.0216 | -0.0027 |
| 29 | 126 | 0.0210 | -0.0032 |
| 30 | 123 | 0.0222 | -0.0020 |
| 31 | 124 | 0.0228 | -0.0014 |
| 32 | 116 | 0.0214 | -0.0029 |
| 33 | 122 | 0.0234 | -0.0009 |
| 34 | 118 | 0.0237 | -0.0005 |
| 35 | 116 | 0.0234 | -0.0009 |
| 36 | 127 | 0.0236 | -0.0007 |
| 37 | 110 | 0.0258 | +0.0015 |
| 38 | 120 | 0.0271 | +0.0028 |
| 39 | 127 | 0.0279 | +0.0037 |

### Table 10. The Elo scale, version 2

As in version 1, a rating is 1000 plus the fitted rating times 295.7 / SIGMA Elo points.

| Quantity | Value |
| --- | --- |
| SIGMA, margin units | 2.997 |
| Elo points per margin unit | 98.66 |
| Home edge, Elo points | 61.4 |
| Back-to-back, Elo points | 39.5 |

### Table 11. 2026-27, logged only

Logged only, as a running record. Since 2026-11-13 no result on these games keeps or switches the site's model (`docs/adr/0002-versions-are-judged-on-past-seasons.md`).

| Season | Games | Version 1 log loss | Version 2 log loss |
| --- | --- | --- | --- |
| 2026-27 | 56 | 0.6767 | 0.6129 |

### Check

Version 2 as frozen in scripts/evaluate.ts matches the choice, `{"n0":96,"margin":{"kind":"power","q":0.5},"home":{"kind":"fixed","value":0.622},"seed":{"scale":5,"fade":120,"carry":0.7},"b2b":0.4,"players":{"a":0.08,"np":320,"halfLife":365},"sigma":2.997,"widen":1.15,"provisional":8}`.
<!-- results:end -->

## Settings and their evidence

Written after the results. Each setting lived in `src/lib/elo.ts` (`PARAMS`, `EARLY`, `PROVISIONAL`) until the site switched to version 3 on 2026-10-31 (`docs/model-v3.md`), and is frozen since as `V2` in `scripts/evaluate.ts`. `npm run backtest:v2` fails if they differ from what the tables choose.

- **The candidate, `a` 0.08, `np` 320, box rating half-life 365 days.** Lowest tuning log loss of the 18, 0.6156 against version 1's 0.6298, a difference of -0.0142 [-0.0172, -0.0110], and it wins all 8 tuning seasons (tables 1 and 2). It is eligible only under the deviation below. The 12 candidates with `a` 0.08 or 0.11 differ by at most 0.0004, so the data barely separate them. Each `a` 0.15 candidate is 0.0013 to 0.0017 worse than the choice (table 1).
- **The fixed parts.** The team seed `5.0 * (W / G - 0.5)` with prior strength `96 * exp(-day / 120)`, the back-to-back `0.4` margin units, and the home edge `0.622`, all as the pre-registration fixes them. The seed is worth -0.0073 [-0.0099, -0.0047] of tuning log loss, the back-to-back -0.0014 [-0.0025, -0.0004] more, and the players -0.0055 [-0.0077, -0.0035] more (table 3).
- **Margins, `(|m| + 3)^0.5`.** Version 1's rule, inside the owner's limit: a 43-point win counts 3.4 times a 1-point win.
- **`SIGMA` = 2.997 margin units.** Fitted by maximum likelihood on the tuning seasons (table 2). On the exploration seasons, which it never saw, its favourites won within 3.0 points of the stated chance in every bucket with more than 60 games (table 7).
- **Early widening, 1.15.** Fitted by maximum likelihood on the tuning games where either side had played fewer than 5 (table 2). With the seed, a season's first games need far less widening than version 1's 1.55.
- **The Elo scale.** As in version 1, a rating is 1000 plus the fitted rating times 295.7 / SIGMA, 98.66 Elo points per margin unit. Home court is 61.4 Elo points and a back-to-back 39.5 (table 10).
- **Provisional until 8 games.** Table 9's rule, version 1's run on this candidate, gives 8: from 8 games on, the excess log loss stays within 0.01 of its settled level. Version 1's ratings started level and took 26.
- **What the reader sees.** A team's displayed rating is its team part plus the player part of its usual rotation: everyone who played in any of its last 10 games, each at his minutes per team game over those games, a game he missed counting 0, scaled to 240. Until the team has played 10 games, a player's minutes per game last season, on any team, count as one more game times the share of those games he played in, at no more than his most minutes in one of them; a rookie has this season's alone. One pseudo-game predicted a team's minutes over its next 10 games better than 0, 2, 3, 5, 8 or 20 in each of the 10 finished seasons that have a season before them. A stronger prior early did not steady the chart either. With 2, 3 or 5 pseudo-games until game 10 or fading over it, or the window filled to 3 or 5 games, the 99th percentile of a team's daily move in its first 10 games stayed between 18 and 19 points, the largest between 40 and 48, and B's next-10 miss moved by less than 0.0002. In the five early swings examined, minutes shifting in one game moved the rotation most, two of them after losses by 42 and 51, and a prior cannot steady a player with no last season. Weighting last season by the share of games played came after: in full, DET's four players with 2 to 7 minutes in a 14-point loss at NY on 2026-10-27 took 13.5 of its 240 minutes on their old teams' roles and cost it 10.5 points. Weighted, the next-10 miss changed by -0.00007 [-0.00023, 0.00008], dropping last season changed it by +0.00026 [-0.00047, 0.00107], and counting it only for a player's own team by -0.00008 [-0.00048, 0.00031], which cut a traded starter's early minutes. Capping last season at his most minutes in a game this season came last: WSH's three players with 1 minute each in its second game, on 2026-10-23, counted for 2 to 4 minutes a game on their old roles and cost it 5 points. Capped, the next-10 miss changed by +0.00036 [-0.00018, 0.00101], better in 5 of 11 seasons, and no game's chance changed. Only games with a box score count. A team counts no players while none of its last 10 games has one, or while fewer than half its games this season do. ESPN has no player lines for CHI and NO in 2015-16 to 2017-18, so the fit's team part for those teams already holds their players. A player leaves his old team's rotation on the day he first plays for a new one. Before a team's first game it shows its seed, plus that game's rotation once the game is played, if the game has a box score. After a team's last game in the season's file, played or to come, its rating holds. Nothing re-centres the ratings, so a team's rating moves only with its own team part and players, and the league's average floats. Re-centred each day, the shift ranged over 15 to 28 points within each finished season and moved by at most 7 in a day. It changed no gap and no chance. The owner dropped it on 2026-10-29 so that every point of a team's move is its own. A game's change keeps the rotation the team had before it, so a change of players shows on the chart on its day and never in the game's change. The chances still come from the lineup each team takes into a game, from the players in its previous one, and from the back-to-back, which never moves a rating.
- **Against version 1 and Vegas.** On the exploration seasons version 2's log loss is 0.6015 against version 1's 0.6137, -0.0122 [-0.0182, -0.0061], and Vegas's 0.5819 (table 4). It is better in weeks 1-2 and the last three weeks of the regular season and ties in the other parts (table 5).

### Deviation from the plan

The choice failed as written, on two windows, and the site switches to version 2 anyway under a deviation declared here.

- Windows 23 and 24, days 322 to 349, hold 15 and 9 tuning games: the 2019-20 bubble's conference semifinals, conference finals and Finals. Each window's games sit in two (season, week) blocks. Every candidate is worse than version 1 in both. The chosen candidate's differences are +0.0352 [+0.0329, +0.0386] in window 23 and +0.0363 [+0.0256, +0.0577] in window 24 (table 6).
- A bootstrap that resamples two blocks draws block A twice, block B twice, or one of each, so it has three possible means. Its 2.5th and 97.5th percentiles fall among them, and the "interval" spans at most from one block's mean to the other's. It describes those two weeks, not the uncertainty about them, so it is no 95% interval. This is the reason version 1 declared for a one-block window, whose interval has no width (`docs/model.md`, Deviation from the plan). The plan did not foresee the two-block case.
- The deviation: a window whose games sit in two or fewer blocks is not judged. Nothing else changes. Under it, 18 of 18 candidates are eligible and the lowest is the one above (tables 1 and 2).
- The owner accepted the deviation on 2026-10-28, after seeing the result.
- The 2026-27 confirmation runs under the same rule: a window is judged only when its games sit in more than two blocks. Its verdict stays binding. If version 2's pooled 2026-27 log loss is not below version 1's, or it is worse in a judged window, the site returns to version 1, frozen as `V1` in `scripts/evaluate.ts`.

### Deviation for the 2026-27 confirmation

Declared on 2026-10-31, when the owner asked for the two-week window rule to be removed or adjusted. The 2026-27 games through 2026-10-30 had been played and are logged in table 11; the confirmation has not run.

- The window constraint no longer judges the confirmation. On the tuning seasons, a model exactly as good as version 1, made by swapping version 1's and version 2's chances at random within each (season, week) block, is worse in at least one of the 17 judged windows in 206 of 400 tries, 52%: with many windows one is worse by chance, and each window's interval, from 13 to 16 blocks, runs narrow. The rule would return the site to version 1 about half the time between two equally good models. `node scripts/window-rule.ts v2` runs the check.
- The confirmation is now: version 2 stays on the site when its pooled 2026-27 log loss is below version 1's; otherwise the site returns to version 1, frozen as `V1` in `scripts/evaluate.ts`. The two-week windows are still reported. This replaces the last point of the deviation above.
- The change comes after part of 2026-27 was seen, with version 2 ahead of version 1 there, and it makes the confirmation easier to pass. Its reason, the rule's false-fail rate, comes from the tuning seasons alone. Version 3's plan, `docs/model-v3.md`, judges the same way.
- On 2026-11-13 this confirmation stopped being a gate, as the note above the pre-registration records. No 2026-27 result returns the site to version 1.

## How the injury report will be judged

Written on 2026-10-28, before any archived injury report is scored. It decides only the shown rating, never a game's chance, and is not part of the pre-registration.

- The shown rating counts each team's usual rotation, definition B in `npm run ratings`. On the finished seasons B predicts a team's next 10 games about as well as expected minutes from a games-missed curve, definition C: a root mean square miss of 1.2494 against 1.2504, with C better in 6 of 11 seasons. A rating from results alone, definition A, misses by 1.2890. The site keeps B, the simpler of the two.
- From 2026-10-28, `npm run fetch` saves ESPN's injury report once a day to `src/data/injuries/<season>.json`. For each listed player it gives a projected return date, which the curve cannot know.
- After the 2026-27 regular season ends, the owner runs `npm run ratings -- 2026-27`, which scores definition D against B. D is C, except that a player on that morning's report is available for the share of his team's next 10 games on or after his projected return, times the curve's availability for a player who missed no game, so a listed player never outweighs a healthy one. A day's report counts only if it was fetched before that day's first tip-off. B and D are scored on the same metric over the team-days from 2026-10-28 to the last day of the regular season.
- D replaces B only if its miss is lower and the 95% interval of D minus B, from version 1's weekly block bootstrap, lies wholly below 0. Otherwise the site keeps B, and the archive keeps running.
- Showing D on the site needs each team's next 10 games on file, so `scripts/fetch-season.mjs` would fetch fixtures 28 days ahead.
- On 2026-10-31 the owner chose to show long absences now, outside this judgment. After each game day, a player the next morning's report, or the latest before it, lists as out with a projected return more than 21 days away leaves his team's shown rotation. He stays out while the report lists him as out, until he plays: from 2026-11-12, a return date coming within 21 days no longer brings him back, since the first version counted Paolo Banchero (ORL, +9.2), Kawhi Leonard (TOR, +5.9) and Ja Morant (POR, +7.5) back 21 days early, while each could play at most 1 of his team's next 10 games. His minutes go as the team gave them out in its last 10 games without him, when it has 2 or more, and otherwise to a player with no appearances, valued at `a` times the box rating every newcomer starts from. A player who has played for the team since the day of his entry is back, whatever the entry still says, and counts as the usual rotation counts him, so a returning player comes back over his next 10 team games, as he always did. That ramp undercounts a returning player on average: in the finished seasons' 6,492 team-days within 10 games of a 20-minute player's return from 10 or more missed games, his team beat its rating by +0.0838 a game. But crediting him faster predicted those games worse: 1.3138 for the ramp, against 1.3140 to 1.3168 for 25% to all of the way to his minutes since his return, and 1.3167 and 1.3220 for half and all of the way to his minutes before the absence. A return is less certain than an absence, with minutes limits, rust and the next injury, so the ramp stays. Nor does a shorter window help: over all 46,391 team-days of the finished seasons from 2016-17, a usual rotation over the last 3, 5, 7, 10, 15 or 20 games missed the next 10 by 1.2642, 1.2633, 1.2629, 1.2637, 1.2654 and 1.2671, and 6, 7 and 8 games against 10 differ by -0.0019 [-0.0069, +0.0030], -0.0020 [-0.0056, +0.0017] and -0.0014 [-0.0040, +0.0010] in mean squared miss, from version 1's weekly block bootstrap. Windows of 3 and 5 also moved a team 118 in a day, against 61 for 10, so the window stays at 10. Of four ways to hand out the minutes, scored on the finished seasons' team-days with a rotation player who missed the next 10 games, known after the fact, this one missed those games by 1.3025 in root mean square, against 1.3253 keeping him, 1.3063 sharing his minutes across the rest of the rotation, 1.3026 always to a newcomer and 1.3049 to the players who played more in the games he missed, this season and last, and it was the only one without a bias (mean miss -0.0008, against -0.1063 keeping him and -0.0389 to his usual replacements). On the day it came in, it took OKC from 1165 to 1102, POR from 1040 to 1004 and MIN from 1083 to 1058. The judgment above still runs as written: `npm run ratings` scores its own B, the usual rotation without this rule.
- On 2026-11-01 the owner replaced how those minutes are handed out, because the stand-in at replacement level moved a team twice for one absence: down when the player left, then up again two games later, when the team's games without him took over, with nothing played to explain the second move (MIN, 2026-10-27 to 2026-10-30, -23 and then +23 back). Now the rest of the rotation takes his minutes at once, each in proportion to his own, and those minutes count 0.3 margin units per 48, 29 Elo points, below what the rest of the rotation gives in them, because backups play them, and play them worse than the regulars. The gap rides on the share of the team's last 10 games the rotation still counts him for, so it fades as the team plays without him and the players who take his minutes count for them, and is gone after 10 games. On the same team-days, this missed the next 10 games by 1.3008 in root mean square, against 1.3025 for the rule it replaced, 1.3063 for the rest of the rotation at their own worth and 1.3253 keeping him, with a mean miss of +0.0489; gaps of 0.2, 0.4 and 0.5 missed by 1.3008, 1.3027 and 1.3064, with mean misses of +0.0051, +0.0926 and +0.1364. 0.3 is the value docs/model-v4.md's plan prices games with, for the same reason, so the site counts a missing player's minutes one way. Nor does an absence ever raise a team: the gap on a player's minutes is at least what keeps them from counting above his own value, so a player rated more than 0.3 below the rest of his rotation counts as nothing gone rather than a gain. A team's History now credits each player's change in counted minutes to whoever caused it. A player who sits or leaves the rotation is charged with the trades of minutes that cost his team, a player who joins it credited with those that helped, and the rest of their trades go to the players on the other end, so a player who sits never shows a gain: when a player rated below his teammates sits, the gain shows on the teammates who took his minutes. Counted against a league-average player, as before, a player rated below average who sat showed a gain while his replacements showed the loss.
- What the finished seasons say about such gains, on games priced with the players who in fact played, at their usual minutes. On 38% of team-games of 2015-16 to 2022-23, and 44% of 2023-24 to 2025-26, the players who sat were rated below those who played, by 11 Elo points on average. Teams beat their ratings by -0.32 [+/- 0.33] and -0.41 [+/- 0.45] of that, and by -0.50 [+/- 0.55] of it when the player who sat was a rookie: about a third of such gains never came. Where the players who sat were rated above those who played, teams fell short by a further +1.14 [+/- 0.19] and +1.09 [+/- 0.25] of the loss. Split another way, every absence cost 20 [+/- 6] and 30 [+/- 9] Elo points per 48 of its minutes beyond what the ratings credited, rookies' no less, and gaps between players counted about half again what the ratings say. A rookie's value runs low through his first season: against its value at the season's end, by 3.3 Elo points per 48 before January and 1.8 over the season, and a top-three pick's by 20.2 and 10.7, against 0.2 for players 23 and older. Under docs/model-v4.md's pricing, which counts the 0.3 gap, an absence raised a side's expected margin in 5% to 6% of team-games, by 3.5 Elo points on average; taking those gains out tied it to the fourth decimal, so the plan leaves its pricing as it is.

## Before the build

These choices change what the reader sees, not the score. They were applied as defaults on 2026-10-28, outside this plan, for the owner to review.

- **A team's displayed rating.** The team rating plus the player part of its usual rotation, on version 1's Elo scale, not re-centred. A winner going down or a loser going up shows in two places. In the game log, a game's change, the first default, the lineup each team takes into its next game, did it 456 to 881 times in a full season, by as much as 178 points. The rotation does it 41 to 76 times a season, 2.3% of team games, by at most 8 points, against version 1's 6 to 43 times, 0.9%, by at most 5. On the chart, a game day's move also counts the team's new rotation and a player leaving for another team. There the rotation does it 169 to 332 times a season, 10.0% of team games, by at most 34 points. LAL won on 2025-02-08 and dropped 34 the day Anthony Davis first played for DAL. Version 1's chart and game log give the same counts. The chart's largest one-day move is 61 points, HOU on 2021-01-16 when James Harden first played for BKN, against version 1's 63 early in a season. In its first 10 games a team's move on a game day is above 22 points one time in 100 and at most 48, MIL's second game of 2021-22, a 42-point loss, against version 1's largest of 63. Everything here covers the 11 finished seasons, and version 2's counts and largest moves come from `npm run ratings`.
- **How the site explains player values.** The About page and "How it works" now say that each team starts from its preseason odds and that a rating counts who is playing.
- **Where preseason totals come from each October,** and who enters them. Still open.
