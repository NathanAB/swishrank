# The rating model, version 5

Version 5 changes what a player's value is pulled toward. In version 4 (`docs/model-v4.md`) the fit pulls each player's value toward his box rating. Version 5 pulls it toward his on-court rating too: his rating from the scoreline while he is on the floor, adjusted for the teammates and opponents out there with him (`GLOSSARY.md`). Everything else is version 4's.

The site runs version 4 until `SITE_ON_COURT` in `src/lib/v5.ts` points it at version 5's settings (issue 71). Roster-based lineups and the model's own preseason seed are the other parts of version 5 (issue 65), and this file does not cover them yet.

Version 5 is judged by `docs/adr/0002-versions-are-judged-on-past-seasons.md`: every new setting is chosen from the seasons before the one scored, and log loss on real results decides. No betting number trains, tunes or chooses anything (`docs/adr/0001-no-betting-lines-in-the-model.md`). `npm run backtest:v5` writes the Results below.

## The on-court rating

`src/lib/on-court.ts` fits it from the play-by-play record in `scripts/stints/` (`src/lib/stints.ts`).

- **A stint.** Ten players' time on the floor together, with each side's points and three-point shots. A stint counts when the record names five players a side and it lasted more than 0 seconds.
- **What is fitted.** One number for each player and one for the home side. A stint's expected margin per 100 possessions is the home five's numbers added up, less the away five's, plus the home term. The fit is least squares over every stint so far. A stint weighs its possessions, at a fixed pace of 100 a side per 48 minutes, times 0.5^(days since / half-life).
- **Three-point luck.** Each side's points lose 3 for every three it made beyond the league's rate, which is the makes over the attempts of the record's earlier seasons. The record's first season keeps its points as scored.
- **The pull.** Each player is pulled toward the box prior, a multiple of his box rating, with `ridge` possessions of weight. His prior follows his box rating from his first stint of a season on, and until then it stays where the season before left it.
- **When.** A season is refitted after every 7th game day, and once more after its last game day when the next season begins. A refit on a day reads that day's stints and everything before it. The games of the days after it read the refit.
- **Into the model.** A player's prior centre in the model's fit is 0.08 times his box rating in version 4. In version 5 it is 0.08 times his box rating plus `weight` times the part of his on-court rating his box rating does not explain, which is his on-court rating less the box prior times his box rating. `modelInputs` in `src/lib/inputs.ts` builds it when given version 5's settings.
- **A player with no play-by-play on record** has no such part, and keeps version 4's centre exactly. **A season with no record on file** adds no stints, and its players keep what the earlier seasons left them.
- **Walking forward.** A day's on-court rating reads only games played on or before that day. `src/lib/on-court.test.ts` and `scripts/candidates/candidates.test.ts` change every later game and require every earlier rating and chance to stay exactly as it was.

ESPN's play-by-play misses some substitutions in 2017-18 to 2019-20. Those seasons are used as they are.

## How the settings are chosen

`scripts/candidates/v5.ts` chooses version 5's settings for a season from the seasons before it, and from nothing else:

- the ridge, from 1,500, 3,000 and 6,000 possessions;
- the half-life, from 365, 730 and 1,460 days;
- the box prior, from 0, 0.5 and 1;
- the weight, from 0 to 0.30 in steps of 0.02, where 0 is version 4's player values;
- SIGMA and the early widening, by maximum likelihood, for each combination of the four.

The combination with the lowest log loss on those seasons is the one the next season is scored with: 432 combinations a season. The ranges come from the research, which saw every season. That is the only way a later season reaches an earlier season's settings.

The model's fit is linear in the players' prior centres, and a game's expected margin is linear in the fit. So each ridge, half-life and box prior is fitted once, at weight 0.1, and the expected margins at any other weight lie on the line through that fit's and version 4's. A test in `scripts/candidates/candidates.test.ts` checks this against a real fit at each weight.

`V5` in `src/lib/v5.ts` holds the settings chosen from every finished season on file, 2015-16 to 2025-26, which are the ones the site would run: ridge 1,500, half-life 365 days, box prior 0.5, weight 0.12, SIGMA 3.194 and early widening 1.21. `npm run backtest:v5` fails when they differ from what the candidate chooses.

The choice among the best is close to a coin toss. On those eleven seasons the chosen combination scores 0.60433, the next eleven lie within 0.00011 of it, and every one of the twelve has box prior 0.5, a ridge of 1,500 or 3,000 and a weight of 0.10 to 0.16. The best combination with weight 0 scores 0.60671. These are the scores the settings were chosen on, so they say which settings fit, and the Results below say what the on-court rating is worth.

## How many ideas were tried

The research (branch `prototype/model-v5`, `scripts/research/README.md`) tried about 131 variants of the on-court rating, with every season in view. Its best was ridge 3,000, half-life 730 days, box prior 0.5 and weight 0.12, with three-point luck taken out. It found these flat: garbage time, free-throw luck, a game-specific spread of outcomes, a rookie hold, a playoff weight, daily refits, lineup synergy, and stints as the fit's own rows. This build tries nothing beyond the search above. The same past seasons judge every one of these, so the size of the best is somewhat inflated (`docs/adr/0002-versions-are-judged-on-past-seasons.md`).

## The port against the prototype

The prototype was Python. The site's fit is the same formulation in TypeScript, and differs from it in five places:

- The prototype took a record's first season's three-point luck out at that season's own rate, which reads later games. The port leaves the first season's points as scored.
- The prototype set a player's prior from the season's whole list of box-score players, so a player who returned late in a season changed the ratings before his return. The port moves a player's prior only once he has a stint that season.
- The prototype refitted on every season's last game day. The port does it when the next season begins, so the latest season's ratings do not change when its next game day is added.
- The prototype rounded each rating to three decimals. The port does not.
- The prototype solved each refit exactly. The port solves it by conjugate gradients, as the model's own fit does, to a relative residual of 1e-10, and stops with an error if a refit does not get there.

With the prototype's settings fixed for every season, and scored the prototype's way (SIGMA and the early widening fitted on 2015-16 to 2022-23, each game's 5 PM injury report), version 5 less version 4 in log loss on real results:

| Seasons | Prototype | Port |
| --- | --- | --- |
| 2015-16 to 2022-23 | -0.0017 [-0.0027, -0.0006] | -0.0018 [-0.0030, -0.0007] |
| 2023-24 to 2025-26 | -0.0037 [-0.0057, -0.0015] | -0.0036 [-0.0057, -0.0016] |

The same comparison on the pre-tip reports the Results below read gives -0.0019 [-0.0031, -0.0008] and -0.0035 [-0.0055, -0.0015]. The Results differ from both, because there each season's settings are chosen from the seasons before it, and scoring starts in 2019-20.

## What it costs

Measured on a developer's Mac on 2026-11-13, twice each.

- **The model's inputs for all 12 seasons**, which a site build works out once: 1.0 second in version 4, 8.7 seconds with the on-court rating, which is 336 refits over 1,623 players.
- **Fitting one finished season** after that: 0.2 seconds in both.
- **A build of the site's four pages outside the seasons** (How it works, Track record, Injury report and the 404 page), which fits every season: 5.0 and 5.6 seconds on version 4, 13.8 and 13.9 seconds with `SITE_ON_COURT` set.

The on-court rating therefore adds about 8.5 seconds to a build, once, however many pages it writes. The full build of about 15,000 pages takes over 40 minutes and was not run for this measurement.

`npm run backtest:v5` takes about 15 minutes with version 5 in it, against under a minute for version 4 alone, because the search fits 27 on-court ratings.

## What others do

Rating players by a ridge regression over the stints they were on the floor for is basketball analytics' standard measure of what a player does to the scoreline, known there as regularized adjusted plus-minus. Pulling it toward a box-score rating, and correcting stints for shooting luck, are common refinements of it. Basketball-Reference fits its Box Plus/Minus to such ratings (https://www.basketball-reference.com/about/bpm2.html). Version 5 follows that practice and departs in one way: the rating is not shown or used by itself, and only moves where the model's own fit starts each player.

## Reading the results

Pooled over the seven scored seasons, version 5's log loss is 0.6072 against version 4's 0.6095, a difference of -0.0024 [-0.0037, -0.0010], which is clear of zero. By season it is better in one, level in six, and the one season it trails in is 2020-21, by +0.0028 [-0.0002, +0.0063]. The first scored seasons have the least to choose from and the shortest record to rate players on: 2019-20's settings come from four seasons.

Version 5 prices the lineups version 4 prices, so the two versions' minutes misplaced are equal in the lineup table. Version 5's value error is larger there, 0.276 against 0.228, because the on-court rating spreads the players' values wider, and the same misplaced minutes then cost more margin. That measure judges a change of lineups, which this is not.

## Results

<!-- results:start -->
Bootstrap: 2000 resamples of whole weeks, seed 20261025. Seasons scored from 2019-20 on, each with every setting chosen from the seasons before it. Candidates scored: 2, version 4's check against itself included.

### Table 1. The injury reports both versions read

Both versions read scripts/nba-reports-at-tip/, built to hold each game's last NBA report published at least 30 minutes before its tip-off. A side without one takes version 3's lineup. The last three columns measure the rule on the files: the minutes from the time each report says it was published to its game's tip-off, and how many games read a report from under 30 minutes before it.

| Season | Final games | Both sides | One side | Neither | Median minutes before tip-off | Shortest | Under 30 minutes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 1143 | 1088 | 53 | 2 | 120 | 30 | 0 |
| 2020-21 | 1171 | 1109 | 60 | 2 | 120 | 30 | 0 |
| 2021-22 | 1323 | 1300 | 23 | 0 | 30 | 30 | 0 |
| 2022-23 | 1320 | 1274 | 44 | 2 | 30 | 30 | 0 |
| 2023-24 | 1319 | 1265 | 53 | 1 | 30 | 30 | 0 |
| 2024-25 | 1321 | 1280 | 40 | 1 | 30 | 30 | 0 |
| 2025-26 | 1322 | 1278 | 42 | 2 | 60 | 30 | 0 |

### Version 4: log loss on real results

Each season is scored with the candidate's settings chosen from the seasons before it; the pooled row takes every scored game. Version 4 is the site's (src/lib/inputs.ts) on the reports of Table 1, so its numbers differ from docs/model-v4.md's, which read the 5 PM reports. It keeps the site's settings in every season, and its plan chose them with these seasons in view, so the comparison favours version 4.

| Season | Settings chosen from | Candidate's settings | Games | Version 4 log loss | Candidate log loss | Candidate minus version 4 [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2015-16 to 2018-19 | the site's: SIGMA 2.986, early widening 1.14 | 1143 | 0.6144 | 0.6144 | +0.0000 [+0.0000, +0.0000] | tie |
| 2020-21 | 2015-16 to 2019-20 | the site's: SIGMA 2.986, early widening 1.14 | 1171 | 0.6289 | 0.6289 | +0.0000 [+0.0000, +0.0000] | tie |
| 2021-22 | 2015-16 to 2020-21 | the site's: SIGMA 2.986, early widening 1.14 | 1323 | 0.6169 | 0.6169 | +0.0000 [+0.0000, +0.0000] | tie |
| 2022-23 | 2015-16 to 2021-22 | the site's: SIGMA 2.986, early widening 1.14 | 1320 | 0.6323 | 0.6323 | +0.0000 [+0.0000, +0.0000] | tie |
| 2023-24 | 2015-16 to 2022-23 | the site's: SIGMA 2.986, early widening 1.14 | 1319 | 0.5935 | 0.5935 | +0.0000 [+0.0000, +0.0000] | tie |
| 2024-25 | 2015-16 to 2023-24 | the site's: SIGMA 2.986, early widening 1.14 | 1321 | 0.5988 | 0.5988 | +0.0000 [+0.0000, +0.0000] | tie |
| 2025-26 | 2015-16 to 2024-25 | the site's: SIGMA 2.986, early widening 1.14 | 1322 | 0.5849 | 0.5849 | +0.0000 [+0.0000, +0.0000] | tie |
| Pooled |  |  | 8919 | 0.6095 | 0.6095 | +0.0000 [+0.0000, +0.0000] | tie |

### Version 4 beside Vegas and Polymarket

On the games each market has a chance for. The markets are reported, never used to choose a setting or to judge.

| Season | Market | Games | Market log loss | Version 4 log loss | Candidate log loss |
| --- | --- | --- | --- | --- | --- |
| 2019-20 | Vegas | 1143 | 0.6107 | 0.6144 | 0.6144 |
| 2020-21 | Vegas | 1171 | 0.6189 | 0.6289 | 0.6289 |
| 2021-22 | Vegas | 1323 | 0.6067 | 0.6169 | 0.6169 |
| 2022-23 | Vegas | 1320 | 0.6264 | 0.6323 | 0.6323 |
| 2023-24 | Vegas | 1319 | 0.5833 | 0.5935 | 0.5935 |
| 2024-25 | Vegas | 1321 | 0.5858 | 0.5988 | 0.5988 |
| 2024-25 | Polymarket | 1319 | 0.5858 | 0.5987 | 0.5987 |
| 2025-26 | Vegas | 1322 | 0.5767 | 0.5849 | 0.5849 |
| 2025-26 | Polymarket | 1321 | 0.5767 | 0.5849 | 0.5849 |
| Pooled | Vegas | 8919 | 0.6007 | 0.6095 | 0.6095 |
| Pooled | Polymarket | 2640 | 0.5813 | 0.5918 | 0.5918 |

### Version 4: lineup minutes against the minutes played

Over the team-games with a box score, played minutes scaled to 240 a side. Minutes misplaced is half the summed gap between each player's predicted and played minutes: the minutes of a team-game the lineup put on the wrong players. Value error is the root mean square of the sum over players of (predicted - played) / 48 times the player's value, at each version's own values, in margin units.

| Season | Team-games | Version 4 minutes misplaced | Candidate minutes misplaced | Candidate minus version 4 [95%] | Version 4 value error | Candidate value error |
| --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2286 | 36.26 | 36.26 | +0.00 [+0.00, +0.00] | 0.210 | 0.210 |
| 2020-21 | 2330 | 38.63 | 38.63 | +0.00 [+0.00, +0.00] | 0.238 | 0.238 |
| 2021-22 | 2646 | 38.05 | 38.05 | +0.00 [+0.00, +0.00] | 0.213 | 0.213 |
| 2022-23 | 2640 | 37.30 | 37.30 | +0.00 [+0.00, +0.00] | 0.224 | 0.224 |
| 2023-24 | 2638 | 36.07 | 36.07 | +0.00 [+0.00, +0.00] | 0.232 | 0.232 |
| 2024-25 | 2642 | 37.61 | 37.61 | +0.00 [+0.00, +0.00] | 0.240 | 0.240 |
| 2025-26 | 2636 | 38.65 | 38.65 | +0.00 [+0.00, +0.00] | 0.239 | 0.239 |
| Pooled | 17818 | 37.52 | 37.52 | +0.00 [+0.00, +0.00] | 0.228 | 0.228 |

### Check

Version 4 against itself: every difference is exactly 0.

### Version 5: log loss on real results

Each season is scored with the candidate's settings chosen from the seasons before it; the pooled row takes every scored game. Version 4 is the site's (src/lib/inputs.ts) on the reports of Table 1, so its numbers differ from docs/model-v4.md's, which read the 5 PM reports. It keeps the site's settings in every season, and its plan chose them with these seasons in view, so the comparison favours version 4.

| Season | Settings chosen from | Candidate's settings | Games | Version 4 log loss | Candidate log loss | Candidate minus version 4 [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2015-16 to 2018-19 | on-court rating with ridge 1500, half-life 365 days and box prior 1, at weight 0.08; SIGMA 2.928, early widening 0.97 | 1143 | 0.6144 | 0.6137 | -0.0008 [-0.0038, +0.0020] | tie |
| 2020-21 | 2015-16 to 2019-20 | on-court rating with ridge 6000, half-life 1460 days and box prior 0.5, at weight 0.14; SIGMA 3.171, early widening 0.98 | 1171 | 0.6289 | 0.6317 | +0.0028 [-0.0002, +0.0063] | tie |
| 2021-22 | 2015-16 to 2020-21 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, at weight 0.10; SIGMA 3.164, early widening 1.08 | 1323 | 0.6169 | 0.6112 | -0.0057 [-0.0089, -0.0024] | better |
| 2022-23 | 2015-16 to 2021-22 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, at weight 0.12; SIGMA 3.202, early widening 1.15 | 1320 | 0.6323 | 0.6309 | -0.0013 [-0.0043, +0.0016] | tie |
| 2023-24 | 2015-16 to 2022-23 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, at weight 0.12; SIGMA 3.219, early widening 1.19 | 1319 | 0.5935 | 0.5898 | -0.0037 [-0.0072, +0.0001] | tie |
| 2024-25 | 2015-16 to 2023-24 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, at weight 0.14; SIGMA 3.227, early widening 1.21 | 1321 | 0.5988 | 0.5953 | -0.0035 [-0.0076, +0.0006] | tie |
| 2025-26 | 2015-16 to 2024-25 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, at weight 0.14; SIGMA 3.235, early widening 1.26 | 1322 | 0.5849 | 0.5815 | -0.0035 [-0.0070, +0.0005] | tie |
| Pooled |  |  | 8919 | 0.6095 | 0.6072 | -0.0024 [-0.0037, -0.0010] | better |

### Version 5 beside Vegas and Polymarket

On the games each market has a chance for. The markets are reported, never used to choose a setting or to judge.

| Season | Market | Games | Market log loss | Version 4 log loss | Candidate log loss |
| --- | --- | --- | --- | --- | --- |
| 2019-20 | Vegas | 1143 | 0.6107 | 0.6144 | 0.6137 |
| 2020-21 | Vegas | 1171 | 0.6189 | 0.6289 | 0.6317 |
| 2021-22 | Vegas | 1323 | 0.6067 | 0.6169 | 0.6112 |
| 2022-23 | Vegas | 1320 | 0.6264 | 0.6323 | 0.6309 |
| 2023-24 | Vegas | 1319 | 0.5833 | 0.5935 | 0.5898 |
| 2024-25 | Vegas | 1321 | 0.5858 | 0.5988 | 0.5953 |
| 2024-25 | Polymarket | 1319 | 0.5858 | 0.5987 | 0.5951 |
| 2025-26 | Vegas | 1322 | 0.5767 | 0.5849 | 0.5815 |
| 2025-26 | Polymarket | 1321 | 0.5767 | 0.5849 | 0.5814 |
| Pooled | Vegas | 8919 | 0.6007 | 0.6095 | 0.6072 |
| Pooled | Polymarket | 2640 | 0.5813 | 0.5918 | 0.5882 |

### Version 5: lineup minutes against the minutes played

Over the team-games with a box score, played minutes scaled to 240 a side. Minutes misplaced is half the summed gap between each player's predicted and played minutes: the minutes of a team-game the lineup put on the wrong players. Value error is the root mean square of the sum over players of (predicted - played) / 48 times the player's value, at each version's own values, in margin units.

| Season | Team-games | Version 4 minutes misplaced | Candidate minutes misplaced | Candidate minus version 4 [95%] | Version 4 value error | Candidate value error |
| --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2286 | 36.26 | 36.26 | +0.00 [+0.00, +0.00] | 0.210 | 0.210 |
| 2020-21 | 2330 | 38.63 | 38.63 | +0.00 [+0.00, +0.00] | 0.238 | 0.302 |
| 2021-22 | 2646 | 38.05 | 38.05 | +0.00 [+0.00, +0.00] | 0.213 | 0.253 |
| 2022-23 | 2640 | 37.30 | 37.30 | +0.00 [+0.00, +0.00] | 0.224 | 0.268 |
| 2023-24 | 2638 | 36.07 | 36.07 | +0.00 [+0.00, +0.00] | 0.232 | 0.276 |
| 2024-25 | 2642 | 37.61 | 37.61 | +0.00 [+0.00, +0.00] | 0.240 | 0.298 |
| 2025-26 | 2636 | 38.65 | 38.65 | +0.00 [+0.00, +0.00] | 0.239 | 0.307 |
| Pooled | 17818 | 37.52 | 37.52 | +0.00 [+0.00, +0.00] | 0.228 | 0.276 |

### Version 5: settings from every finished season

Chosen from 2015-16 to 2025-26, the settings the season after them would run with: on-court rating with ridge 1500, half-life 365 days and box prior 0.5, at weight 0.12; SIGMA 3.194, early widening 1.21. They are the settings on file for the site.
<!-- results:end -->
