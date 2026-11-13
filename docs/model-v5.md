# The rating model, version 5

Version 5 is being built (issue 65). Until its method is written up here, this file holds its results. `npm run backtest:v5` writes them: every candidate in `scripts/candidates/` against version 4 on past seasons, by the rule in `docs/adr/0002-versions-are-judged-on-past-seasons.md`.

## Results

<!-- results:start -->
Bootstrap: 2000 resamples of whole weeks, seed 20261025. Seasons scored from 2019-20 on, each with every setting chosen from the seasons before it. Candidates scored: 1, version 4's check against itself included.

### Table 1. The injury reports both versions read

Both versions read scripts/nba-reports-at-tip/, built to hold each game's last NBA report published at least 30 minutes before its tip-off. A side without one takes version 3's lineup. The last three columns measure the rule on the files: the minutes from the time each report says it was published to its game's tip-off, and how many games read a report from under 30 minutes before it.

| Season | Final games | Both sides | One side | Neither | Median minutes before tip-off | Shortest | Under 30 minutes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 1143 | 0 | 0 | 1143 |  |  |  |
| 2020-21 | 1171 | 0 | 0 | 1171 |  |  |  |
| 2021-22 | 1323 | 0 | 0 | 1323 |  |  |  |
| 2022-23 | 1320 | 0 | 0 | 1320 |  |  |  |
| 2023-24 | 1319 | 1265 | 53 | 1 | 30 | 0 | 435 |
| 2024-25 | 1321 | 1280 | 40 | 1 | 30 | 0 | 447 |
| 2025-26 | 1322 | 1278 | 42 | 2 | 30 | -15 | 141 |

### Version 4: log loss on real results

Each season is scored with the candidate's settings chosen from the seasons before it; the pooled row takes every scored game. Version 4 is the site's (src/lib/inputs.ts) on the reports of Table 1, so its numbers differ from docs/model-v4.md's, which read the 5 PM reports. It keeps the site's settings in every season, and its plan chose them with these seasons in view, so the comparison favours version 4.

| Season | Settings chosen from | Candidate's settings | Games | Version 4 log loss | Candidate log loss | Candidate minus version 4 [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2015-16 to 2018-19 | the site's: SIGMA 2.986, early widening 1.14 | 1143 | 0.6198 | 0.6198 | +0.0000 [+0.0000, +0.0000] | tie |
| 2020-21 | 2015-16 to 2019-20 | the site's: SIGMA 2.986, early widening 1.14 | 1171 | 0.6312 | 0.6312 | +0.0000 [+0.0000, +0.0000] | tie |
| 2021-22 | 2015-16 to 2020-21 | the site's: SIGMA 2.986, early widening 1.14 | 1323 | 0.6273 | 0.6273 | +0.0000 [+0.0000, +0.0000] | tie |
| 2022-23 | 2015-16 to 2021-22 | the site's: SIGMA 2.986, early widening 1.14 | 1320 | 0.6379 | 0.6379 | +0.0000 [+0.0000, +0.0000] | tie |
| 2023-24 | 2015-16 to 2022-23 | the site's: SIGMA 2.986, early widening 1.14 | 1319 | 0.5923 | 0.5923 | +0.0000 [+0.0000, +0.0000] | tie |
| 2024-25 | 2015-16 to 2023-24 | the site's: SIGMA 2.986, early widening 1.14 | 1321 | 0.5991 | 0.5991 | +0.0000 [+0.0000, +0.0000] | tie |
| 2025-26 | 2015-16 to 2024-25 | the site's: SIGMA 2.986, early widening 1.14 | 1322 | 0.5846 | 0.5846 | +0.0000 [+0.0000, +0.0000] | tie |
| Pooled |  |  | 8919 | 0.6128 | 0.6128 | +0.0000 [+0.0000, +0.0000] | tie |

### Version 4 beside Vegas and Polymarket

On the games each market has a chance for. The markets are reported, never used to choose a setting or to judge.

| Season | Market | Games | Market log loss | Version 4 log loss | Candidate log loss |
| --- | --- | --- | --- | --- | --- |
| 2019-20 | Vegas | 1143 | 0.6107 | 0.6198 | 0.6198 |
| 2020-21 | Vegas | 1171 | 0.6189 | 0.6312 | 0.6312 |
| 2021-22 | Vegas | 1323 | 0.6067 | 0.6273 | 0.6273 |
| 2022-23 | Vegas | 1320 | 0.6264 | 0.6379 | 0.6379 |
| 2023-24 | Vegas | 1319 | 0.5833 | 0.5923 | 0.5923 |
| 2024-25 | Vegas | 1321 | 0.5858 | 0.5991 | 0.5991 |
| 2024-25 | Polymarket | 1319 | 0.5858 | 0.5991 | 0.5991 |
| 2025-26 | Vegas | 1322 | 0.5767 | 0.5846 | 0.5846 |
| 2025-26 | Polymarket | 1321 | 0.5767 | 0.5846 | 0.5846 |
| Pooled | Vegas | 8919 | 0.6007 | 0.6128 | 0.6128 |
| Pooled | Polymarket | 2640 | 0.5813 | 0.5918 | 0.5918 |

### Version 4: lineup minutes against the minutes played

Over the team-games with a box score, played minutes scaled to 240 a side. Minutes misplaced is half the summed gap between each player's predicted and played minutes: the minutes of a team-game the lineup put on the wrong players. Value error is the root mean square of the sum over players of (predicted - played) / 48 times the player's value, at each version's own values, in margin units.

| Season | Team-games | Version 4 minutes misplaced | Candidate minutes misplaced | Candidate minus version 4 [95%] | Version 4 value error | Candidate value error |
| --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2286 | 41.76 | 41.76 | +0.00 [+0.00, +0.00] | 0.274 | 0.274 |
| 2020-21 | 2330 | 45.38 | 45.38 | +0.00 [+0.00, +0.00] | 0.316 | 0.316 |
| 2021-22 | 2646 | 46.90 | 46.90 | +0.00 [+0.00, +0.00] | 0.310 | 0.310 |
| 2022-23 | 2640 | 46.85 | 46.85 | +0.00 [+0.00, +0.00] | 0.339 | 0.339 |
| 2023-24 | 2638 | 35.50 | 35.50 | +0.00 [+0.00, +0.00] | 0.227 | 0.227 |
| 2024-25 | 2642 | 37.25 | 37.25 | +0.00 [+0.00, +0.00] | 0.237 | 0.237 |
| 2025-26 | 2636 | 38.58 | 38.58 | +0.00 [+0.00, +0.00] | 0.239 | 0.239 |
| Pooled | 17818 | 41.68 | 41.68 | +0.00 [+0.00, +0.00] | 0.280 | 0.280 |

### Check

Version 4 against itself: every difference is exactly 0.
<!-- results:end -->
