# The rating model, version 5

Version 5 changes what a player's value is pulled toward. In version 4 (`docs/model-v4.md`) the fit pulls each player's value toward his box rating. Version 5 pulls it toward his on-court rating too: his rating from the scoreline while he is on the floor, adjusted for the teammates and opponents out there with him (`GLOSSARY.md`). Everything else is version 4's.

Version 5 also changes how a game's lineup is predicted: from the team's recent roster, each player counted at his chance of playing (Roster-based lineups, below). The site runs version 4 until `SITE_ON_COURT` and `SITE_ROSTER` in `src/lib/v5.ts` point it at version 5's settings (issue 71). The model's own preseason seed is the other part of version 5 (issue 65), and this file does not cover it yet.

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

The research (branch `prototype/model-v5`, `scripts/research/README.md`) tried about 131 variants of the on-court rating, with every season in view. Its best was ridge 3,000, half-life 730 days, box prior 0.5 and weight 0.12, with three-point luck taken out. It found these flat: garbage time, free-throw luck, a game-specific spread of outcomes, a rookie hold, a playoff weight, daily refits, lineup synergy, and stints as the fit's own rows. This build tries nothing beyond the search above.

For lineups the research ran the roster rule in three forms: the chance of playing alone, with minutes moved toward the bench, and with moved players taken off their old team's roster. It scored each at fills of 0, -0.15, -0.3 and -0.45. This build tried three more things. The fills -0.6 and -0.75 joined the choice, because the fill chosen from every finished season sat at the end of the list, and neither is chosen in any season. A report now adds a player only once he has played this season, which the walk-forward check forced and which cost +0.0001 [-0.0000, +0.0003] in log loss on 2023-24 to 2025-26 on the research copy. The starting five was tested and not built.

The same past seasons judge every one of these, so the size of the best is somewhat inflated (`docs/adr/0002-versions-are-judged-on-past-seasons.md`).

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

## Roster-based lineups

A game's chance counts each side's players for the minutes the model expects them to play. Version 4 starts that lineup from the players of the team's previous game and takes out the ones the NBA's injury report lists as out (`src/lib/v4.ts`). A regular who sat the previous game and is not on the report counts for nothing. Version 5 starts from the team's recent roster and counts each player at his chance of playing times the minutes he is expected to play (`src/lib/roster-lineups.ts`). The fit itself reads the minutes played, so a change of lineups moves the chances and leaves the ratings where they were, but for the fill term below.

- **The roster.** Everyone who played in one of the team's last 10 games this season and whose latest game was for this team. The report adds a player it lists as Available, Probable or Questionable, once he has played this season.
- **A player who moved.** A player another team's report lists, after his last game, leaves his old team's roster. He joins the new team's when its report lists him as able to play, and for good once he plays for it.
- **Usual minutes.** The mean of his last 5 appearances, on any team.
- **The chance he plays.** The share of players in the same spot who played, in the seasons the rates are learned from. A spot is his status, how many of the team's games in a row he has missed (0, 1, 2, 3 to 5, 6 or more) and his usual minutes (under 10, 10 to 18, 18 to 26, 26 or more). His status is the report's (Out, Doubtful, Questionable, Probable, Available), "unlisted" when the report covers his team and does not list him, or "uncovered" when no report covers his team. A spot with fewer than 40 players takes the rate of its status and games missed, then of its status alone.
- **His minutes when he plays.** His usual minutes times the rate at which players of his usual minutes played, by the share of the rotation that is absent (under 8%, 8 to 20%, 20 to 35%, 35% or more). The rotation is the roster's players with 10 or more usual minutes. A player counts as absent when he is listed Out or Doubtful, or when he missed the team's last game and no report clears him. With a large share absent, the bench plays more: a player under 10 usual minutes plays 2.5 times them when 35% or more of the rotation is absent.
- **The lineup.** Each player's chance times his minutes, scaled so the side adds up to 240.
- **The fill term.** Version 4 counts the minutes its report takes out below the rest of the lineup, at -0.3 margin units for 48 of them. Version 5 keeps the term and counts the expected missing minutes: over the rotation's players who missed at most the team's last game, their usual minutes times the chance they sit.
- **A team's first game of a season** has no roster yet and an empty lineup, as in version 4.
- **A side no report covers** is priced the same way, at the "uncovered" rates.
- **Games still to come** are priced the same way from where each team's last game left its roster, with the latest report saved for the game. A new report that changes a listed player's status changes the lineup and the chance.

### Where the rates come from

Every rate that prices a season is learned from the seasons before it that have NBA reports on file, and from nothing later. The site and the backtest learn them again each time they run, from the seasons on file, so no table of rates is kept in the repo. A season with no earlier season of reports keeps version 4's lineups: 2019-20 is the first season with reports, so it is priced as version 4 prices it, and 2020-21 is the first with roster-based lineups, at rates learned from 2019-20 alone.

The fill is chosen from the earlier seasons too, from 0, -0.15, -0.3, -0.45, -0.6 and -0.75, by log loss on the seasons that have roster-based lineups, with version 4's ratings and SIGMA. With no such season it is version 4's -0.3. `V5.roster` in `src/lib/v5.ts` holds the fill chosen from every finished season, and `npm run backtest:v5` fails when it differs from what the candidate chooses.

`npm run roster-check` prints the rates learned from 2019-20 to 2022-23. Of players with 18 or more usual minutes, the share who played, with the count of players behind each:

| Status | Missed 0 | Missed 1 | Missed 2 | Missed 3-5 | Missed 6+ |
| --- | --- | --- | --- | --- | --- |
| Out | 0.00 (3278) | 0.00 (1836) | 0.00 (1312) | 0.00 (2502) | 0.00 (1848) |
| Doubtful | 0.00 (118) | 0.02 (55) | 0.08 (36) | 0.04 (46) | 0.00 (16) |
| Questionable | 0.59 (963) | 0.59 (377) | 0.58 (194) | 0.63 (235) | 0.64 (179) |
| Probable | 0.96 (772) | 0.92 (118) | 0.96 (50) | 0.97 (59) | 0.98 (48) |
| Available | 0.98 (1697) | 0.97 (560) | 0.95 (266) | 0.94 (290) | 0.92 (262) |
| unlisted | 0.98 (62669) | 0.78 (1729) | 0.56 (515) | 0.46 (656) | 0.23 (380) |
| uncovered | 0.98 (1331) | 0.63 (70) | 0.61 (33) | 0.46 (26) | 0.22 (9) |

Played minutes over usual minutes, for players who played:

| Usual minutes | Absent <8% | Absent 8-20% | Absent 20-35% | Absent 35%+ |
| --- | --- | --- | --- | --- |
| <10 | 1.017 (2171) | 1.218 (3937) | 1.495 (2818) | 2.454 (1197) |
| 10-18 | 0.947 (4111) | 0.986 (8312) | 1.090 (6432) | 1.373 (2114) |
| 18-26 | 0.948 (5767) | 0.970 (10460) | 1.010 (7980) | 1.099 (2589) |
| 26+ | 0.956 (10134) | 0.970 (17847) | 0.982 (12277) | 1.005 (3214) |

### The lineups' port against the prototype

The prototype was `scripts/research/analysis/c2.py` on branch `prototype/model-v5`, run as `redist moved`. The port differs from it in four places:

- The prototype read each game's box score before it priced the next game of the same day. The port reads a day's box scores after it has priced the whole day.
- For a team's first game of a season the prototype built a lineup from the one to three players the report happened to list, all 240 minutes on them. The port gives that game an empty lineup, as version 4 does.
- The prototype added any listed player who had ever appeared. The port adds him once he has played this season. The fit holds a value for a player before his first game of a season only when he plays later in that season, so a lineup that held him read the future. The walk-forward check caught it.
- The prototype learned its rates once, from 2019-20 to 2022-23. The port learns them for each season from the seasons before it.

A line-for-line reading of the prototype on its own input reproduces its posted figures exactly. Given the port's first three rules, that reading and the port agree on every one of the 7,924 lineups of 2023-24 to 2025-26, to a ten-thousandth of a minute. On those three seasons, with rates learned from 2019-20 to 2022-23, version 4's ratings and a fill of -0.3:

| Roster-based against version 4 | Prototype as posted | Prototype's rule, version 4 on the same reports | Port (`npm run roster-check`) |
| --- | --- | --- | --- |
| Lineup value error, margin units | 0.220 against 0.263 | 0.220 against 0.235 | 0.203 against 0.237 |
| Minutes on the wrong players, of 240 | 35.1 against 40.8 | 35.1 against 36.7 | 35.6 against 37.4 |
| Log loss less version 4's | -0.0017 [-0.0039, +0.0004] | -0.0015 [-0.0028, -0.0002] | -0.0009 [-0.0022, +0.0003] |

The posted figures set roster-based lineups on the pre-tip reports against version 4 on its 5 PM reports, so part of the posted gain was the later report. The third column gives version 4 the same pre-tip reports and the site's rule. The prototype's value error also carried the first-game lineups of the second difference above: without those 24 team-games it is 0.199 against version 4's 0.234. The port's column counts every team-game the scoreboard counts, first games included, where both versions have an empty lineup. Its log loss comes from a fit of its own, in which the fill term also moves the ratings. The prototype changed the lineup's part of each expected margin after version 4's fit, and fitted SIGMA again in its posted figure.

### The starting five, tested and not built

Teams announce their starters about 30 minutes before tip-off. As one more thing a rate may look up, whether a player is in the announced five, it was tested on the research copy of the rule, with rates learned from 2019-20 to 2022-23 and the starters ESPN's box scores record:

| Seasons | Value error | Minutes on the wrong players | Log loss less the roster-based lineup's |
| --- | --- | --- | --- |
| 2019-20 to 2022-23, the seasons the rates were learned from | 0.197 to 0.178 | 35.8 to 34.1 | -0.0007 [-0.0016, +0.0001] |
| 2023-24 to 2025-26, unseen | 0.199 to 0.186 | 34.6 to 33.6 | -0.0009 [-0.0022, +0.0003] |

It points the same way on both sets of seasons and is not clear of zero on either. By the rule lineups are judged on, it would go in. It was not built, because it counts only if the site can read the five before tip-off, and issue 70 records what ESPN's public data shows before a game starts.

## What it costs

Measured on a developer's Mac on 2026-11-13, twice each.

- **The model's inputs for all 12 seasons**, which a site build works out once: 1.0 second in version 4, 8.7 seconds with the on-court rating, which is 336 refits over 1,623 players.
- **Fitting one finished season** after that: 0.2 seconds in both.
- **A build of the site's four pages outside the seasons** (How it works, Track record, Injury report and the 404 page), which fits every season: 5.0 and 5.6 seconds on version 4, 13.8 and 13.9 seconds with `SITE_ON_COURT` set.

The on-court rating therefore adds about 8.5 seconds to a build, once, however many pages it writes. The full build of about 15,000 pages takes over 40 minutes and was not run for this measurement.

`npm run backtest:v5` takes 8 to 15 minutes with version 5 in it, against under a minute for version 4 alone, because the search fits 27 on-court ratings. The two candidates with roster-based lineups add about a minute: version 5's reuses version 5's search.

Roster-based lineups add about 0.6 seconds to the model's inputs: one more pass over the box scores and reports of the 11 finished seasons took 0.5 and 0.7 seconds in two runs, and the rates are counted from that pass.

## What others do

Rating players by a ridge regression over the stints they were on the floor for is basketball analytics' standard measure of what a player does to the scoreline, known there as regularized adjusted plus-minus. Pulling it toward a box-score rating, and correcting stints for shooting luck, are common refinements of it. Basketball-Reference fits its Box Plus/Minus to such ratings (https://www.basketball-reference.com/about/bpm2.html). Version 5 follows that practice and departs in one way: the rating is not shown or used by itself, and only moves where the model's own fit starts each player.

Projecting each player's minutes for a game from who is available, and weighting his value by them, is how public NBA forecasts price a lineup. FiveThirtyEight's forecast built a depth chart for every game, marked the players listed as injured or resting as out, and gave their minutes to the rest ([How our NBA predictions work](https://web.archive.org/web/20240101081135/https://fivethirtyeight.com/methodology/how-our-nba-predictions-work/)). Version 5's lineups follow that practice and depart in one way: a player is not marked in or out. He counts at the rate players with his status and recent absences have played, learned from earlier seasons.

## Reading the results

Pooled over the seven scored seasons, version 5's log loss is 0.6072 against version 4's 0.6095, a difference of -0.0024 [-0.0037, -0.0010], which is clear of zero. By season it is better in one, level in six, and the one season it trails in is 2020-21, by +0.0028 [-0.0002, +0.0063]. The first scored seasons have the least to choose from and the shortest record to rate players on: 2019-20's settings come from four seasons.

Version 5 prices the lineups version 4 prices, so the two versions' minutes misplaced are equal in the lineup table. Version 5's value error is larger there, 0.276 against 0.228, because the on-court rating spreads the players' values wider, and the same misplaced minutes then cost more margin. That measure judges a change of lineups, which this is not.

### What roster-based lineups are worth

Lineups are judged by the second rule of `docs/adr/0002-versions-are-judged-on-past-seasons.md`: the lineup's value error against the minutes played must be lower on seasons its rates were not learned from, and log loss must be no worse. Both hold, so roster-based lineups are part of version 5.

- **Against version 5 with version 4's lineups**, which is the like-for-like test: the value error falls from 0.276 to 0.248 over the seven scored seasons, and it is lower in each of the six seasons that have roster-based lineups. They put 1.16 fewer minutes of a team-game on the wrong players, [-1.54, -0.81]. Log loss is 0.6065 against 0.6072, a difference of -0.0007 [-0.0018, +0.0003].
- **With version 4's values, against version 4:** the value error falls from 0.228 to 0.205, and log loss from 0.6095 to 0.6090, a difference of -0.0005 [-0.0015, +0.0004].
- **Version 5 with roster-based lineups against version 4:** 0.6065 against 0.6095, a difference of -0.0031 [-0.0046, -0.0016]. Version 5 with version 4's lineups stands at -0.0024 [-0.0037, -0.0010].

The lineups' own log-loss gain is not clear of zero. By season it is better in 2023-24, at -0.0023 [-0.0046, -0.0002] against version 5, and level in the others, trailing by 0.0005 in 2021-22. 2019-20 has no earlier season of reports, so it keeps version 4's lineups and its rows are equal. The lineup measure improves more in the later seasons: 0.29 fewer minutes misplaced in 2020-21, whose rates come from one season, and 2.68 fewer in 2025-26, whose rates come from six.

In the table that sets version 5 with roster-based lineups against version 4, the two value errors are not like for like, 0.248 against 0.228, because version 5's values spread wider. The table against version 5 is the one to read for lineups.

## Results

<!-- results:start -->
Bootstrap: 2000 resamples of whole weeks, seed 20261025. Seasons scored from 2019-20 on, each with every setting chosen from the seasons before it. Candidates scored: 4, version 4's check against itself included.

### Table 1. The injury reports both versions read

Both versions read scripts/nba-reports-at-tip/, built to hold each game's last NBA report published at least 30 minutes before its tip-off. A side without one takes version 3's lineup in version 4, and is priced at the uncovered rates under roster-based lineups. The last three columns measure the rule on the files: the minutes from the time each report says it was published to its game's tip-off, and how many games read a report from under 30 minutes before it.

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

### Version 4 with roster-based lineups: log loss on real results

Each season is scored with the candidate's settings chosen from the seasons before it; the pooled row takes every scored game. Version 4 is the site's (src/lib/inputs.ts) on the reports of Table 1, so its numbers differ from docs/model-v4.md's, which read the 5 PM reports. It keeps the site's settings in every season, and its plan chose them with these seasons in view, so the comparison favours version 4.

| Season | Settings chosen from | Candidate's settings | Games | Version 4 log loss | Candidate log loss | Candidate minus version 4 [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2015-16 to 2018-19 | the site's: SIGMA 2.986, early widening 1.14; roster lineups at fill -0.3 | 1143 | 0.6144 | 0.6144 | +0.0000 [+0.0000, +0.0000] | tie |
| 2020-21 | 2015-16 to 2019-20 | the site's: SIGMA 2.986, early widening 1.14; roster lineups at fill -0.3 | 1171 | 0.6289 | 0.6292 | +0.0003 [-0.0018, +0.0025] | tie |
| 2021-22 | 2015-16 to 2020-21 | the site's: SIGMA 2.986, early widening 1.14; roster lineups at fill -0.15 | 1323 | 0.6169 | 0.6174 | +0.0005 [-0.0019, +0.0029] | tie |
| 2022-23 | 2015-16 to 2021-22 | the site's: SIGMA 2.986, early widening 1.14; roster lineups at fill -0.3 | 1320 | 0.6323 | 0.6312 | -0.0010 [-0.0036, +0.0017] | tie |
| 2023-24 | 2015-16 to 2022-23 | the site's: SIGMA 2.986, early widening 1.14; roster lineups at fill -0.45 | 1319 | 0.5935 | 0.5912 | -0.0023 [-0.0045, -0.0001] | better |
| 2024-25 | 2015-16 to 2023-24 | the site's: SIGMA 2.986, early widening 1.14; roster lineups at fill -0.45 | 1321 | 0.5988 | 0.5989 | +0.0001 [-0.0033, +0.0033] | tie |
| 2025-26 | 2015-16 to 2024-25 | the site's: SIGMA 2.986, early widening 1.14; roster lineups at fill -0.45 | 1322 | 0.5849 | 0.5839 | -0.0011 [-0.0045, +0.0022] | tie |
| Pooled |  |  | 8919 | 0.6095 | 0.6090 | -0.0005 [-0.0015, +0.0004] | tie |

### Version 4 with roster-based lineups beside Vegas and Polymarket

On the games each market has a chance for. The markets are reported, never used to choose a setting or to judge.

| Season | Market | Games | Market log loss | Version 4 log loss | Candidate log loss |
| --- | --- | --- | --- | --- | --- |
| 2019-20 | Vegas | 1143 | 0.6107 | 0.6144 | 0.6144 |
| 2020-21 | Vegas | 1171 | 0.6189 | 0.6289 | 0.6292 |
| 2021-22 | Vegas | 1323 | 0.6067 | 0.6169 | 0.6174 |
| 2022-23 | Vegas | 1320 | 0.6264 | 0.6323 | 0.6312 |
| 2023-24 | Vegas | 1319 | 0.5833 | 0.5935 | 0.5912 |
| 2024-25 | Vegas | 1321 | 0.5858 | 0.5988 | 0.5989 |
| 2024-25 | Polymarket | 1319 | 0.5858 | 0.5987 | 0.5987 |
| 2025-26 | Vegas | 1322 | 0.5767 | 0.5849 | 0.5839 |
| 2025-26 | Polymarket | 1321 | 0.5767 | 0.5849 | 0.5838 |
| Pooled | Vegas | 8919 | 0.6007 | 0.6095 | 0.6090 |
| Pooled | Polymarket | 2640 | 0.5813 | 0.5918 | 0.5913 |

### Version 4 with roster-based lineups: lineup minutes against the minutes played

Over the team-games with a box score, played minutes scaled to 240 a side. Minutes misplaced is half the summed gap between each player's predicted and played minutes: the minutes of a team-game the lineup put on the wrong players. Value error is the root mean square of the sum over players of (predicted - played) / 48 times the player's value, at each version's own values, in margin units.

| Season | Team-games | Version 4 minutes misplaced | Candidate minutes misplaced | Candidate minus version 4 [95%] | Version 4 value error | Candidate value error |
| --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2286 | 36.26 | 36.26 | +0.00 [+0.00, +0.00] | 0.210 | 0.210 |
| 2020-21 | 2330 | 38.63 | 38.34 | -0.29 [-1.02, +0.48] | 0.238 | 0.223 |
| 2021-22 | 2646 | 38.05 | 37.25 | -0.80 [-1.95, +0.35] | 0.213 | 0.197 |
| 2022-23 | 2640 | 37.30 | 36.11 | -1.19 [-2.37, -0.16] | 0.224 | 0.200 |
| 2023-24 | 2638 | 36.07 | 35.20 | -0.88 [-1.65, -0.16] | 0.232 | 0.202 |
| 2024-25 | 2642 | 37.61 | 35.59 | -2.02 [-2.97, -1.06] | 0.240 | 0.205 |
| 2025-26 | 2636 | 38.65 | 35.97 | -2.68 [-3.68, -1.82] | 0.239 | 0.198 |
| Pooled | 17818 | 37.52 | 36.36 | -1.16 [-1.54, -0.81] | 0.228 | 0.205 |

### Version 4 with roster-based lineups: settings from every finished season

Chosen from 2015-16 to 2025-26, the settings the season after them would run with: the site's: SIGMA 2.986, early widening 1.14; roster lineups at fill -0.45.

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

### Version 5 with roster-based lineups: log loss on real results

Each season is scored with the candidate's settings chosen from the seasons before it; the pooled row takes every scored game. Version 4 is the site's (src/lib/inputs.ts) on the reports of Table 1, so its numbers differ from docs/model-v4.md's, which read the 5 PM reports. It keeps the site's settings in every season, and its plan chose them with these seasons in view, so the comparison favours version 4.

| Season | Settings chosen from | Candidate's settings | Games | Version 4 log loss | Candidate log loss | Candidate minus version 4 [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2015-16 to 2018-19 | on-court rating with ridge 1500, half-life 365 days and box prior 1, at weight 0.08; SIGMA 2.928, early widening 0.97; roster lineups at fill -0.3 | 1143 | 0.6144 | 0.6137 | -0.0008 [-0.0038, +0.0020] | tie |
| 2020-21 | 2015-16 to 2019-20 | on-court rating with ridge 6000, half-life 1460 days and box prior 0.5, at weight 0.14; SIGMA 3.171, early widening 0.98; roster lineups at fill -0.3 | 1171 | 0.6289 | 0.6312 | +0.0023 [-0.0011, +0.0059] | tie |
| 2021-22 | 2015-16 to 2020-21 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, at weight 0.10; SIGMA 3.164, early widening 1.08; roster lineups at fill -0.15 | 1323 | 0.6169 | 0.6117 | -0.0052 [-0.0089, -0.0014] | better |
| 2022-23 | 2015-16 to 2021-22 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, at weight 0.12; SIGMA 3.202, early widening 1.15; roster lineups at fill -0.3 | 1320 | 0.6323 | 0.6299 | -0.0024 [-0.0063, +0.0017] | tie |
| 2023-24 | 2015-16 to 2022-23 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, at weight 0.12; SIGMA 3.219, early widening 1.19; roster lineups at fill -0.45 | 1319 | 0.5935 | 0.5875 | -0.0060 [-0.0100, -0.0016] | better |
| 2024-25 | 2015-16 to 2023-24 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, at weight 0.14; SIGMA 3.227, early widening 1.21; roster lineups at fill -0.45 | 1321 | 0.5988 | 0.5950 | -0.0038 [-0.0079, +0.0000] | tie |
| 2025-26 | 2015-16 to 2024-25 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, at weight 0.14; SIGMA 3.235, early widening 1.26; roster lineups at fill -0.45 | 1322 | 0.5849 | 0.5801 | -0.0048 [-0.0098, -0.0000] | better |
| Pooled |  |  | 8919 | 0.6095 | 0.6065 | -0.0031 [-0.0046, -0.0016] | better |

### Version 5 with roster-based lineups beside Vegas and Polymarket

On the games each market has a chance for. The markets are reported, never used to choose a setting or to judge.

| Season | Market | Games | Market log loss | Version 4 log loss | Candidate log loss |
| --- | --- | --- | --- | --- | --- |
| 2019-20 | Vegas | 1143 | 0.6107 | 0.6144 | 0.6137 |
| 2020-21 | Vegas | 1171 | 0.6189 | 0.6289 | 0.6312 |
| 2021-22 | Vegas | 1323 | 0.6067 | 0.6169 | 0.6117 |
| 2022-23 | Vegas | 1320 | 0.6264 | 0.6323 | 0.6299 |
| 2023-24 | Vegas | 1319 | 0.5833 | 0.5935 | 0.5875 |
| 2024-25 | Vegas | 1321 | 0.5858 | 0.5988 | 0.5950 |
| 2024-25 | Polymarket | 1319 | 0.5858 | 0.5987 | 0.5947 |
| 2025-26 | Vegas | 1322 | 0.5767 | 0.5849 | 0.5801 |
| 2025-26 | Polymarket | 1321 | 0.5767 | 0.5849 | 0.5800 |
| Pooled | Vegas | 8919 | 0.6007 | 0.6095 | 0.6065 |
| Pooled | Polymarket | 2640 | 0.5813 | 0.5918 | 0.5873 |

### Version 5 with roster-based lineups: lineup minutes against the minutes played

Over the team-games with a box score, played minutes scaled to 240 a side. Minutes misplaced is half the summed gap between each player's predicted and played minutes: the minutes of a team-game the lineup put on the wrong players. Value error is the root mean square of the sum over players of (predicted - played) / 48 times the player's value, at each version's own values, in margin units.

| Season | Team-games | Version 4 minutes misplaced | Candidate minutes misplaced | Candidate minus version 4 [95%] | Version 4 value error | Candidate value error |
| --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2286 | 36.26 | 36.26 | +0.00 [+0.00, +0.00] | 0.210 | 0.210 |
| 2020-21 | 2330 | 38.63 | 38.34 | -0.29 [-1.02, +0.48] | 0.238 | 0.283 |
| 2021-22 | 2646 | 38.05 | 37.25 | -0.80 [-1.95, +0.35] | 0.213 | 0.234 |
| 2022-23 | 2640 | 37.30 | 36.11 | -1.19 [-2.37, -0.16] | 0.224 | 0.243 |
| 2023-24 | 2638 | 36.07 | 35.20 | -0.88 [-1.65, -0.16] | 0.232 | 0.243 |
| 2024-25 | 2642 | 37.61 | 35.59 | -2.02 [-2.97, -1.06] | 0.240 | 0.258 |
| 2025-26 | 2636 | 38.65 | 35.97 | -2.68 [-3.68, -1.82] | 0.239 | 0.259 |
| Pooled | 17818 | 37.52 | 36.36 | -1.16 [-1.54, -0.81] | 0.228 | 0.248 |

### Version 5 with roster-based lineups against version 5: log loss on real results

Each season is scored with the candidate's settings chosen from the seasons before it; the pooled row takes every scored game. The baseline is version 5 (scripts/candidates/v5.ts), its settings chosen from the same seasons.

| Season | Settings chosen from | Candidate's settings | Games | Version 5 log loss | Candidate log loss | Candidate minus version 5 [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2015-16 to 2018-19 | on-court rating with ridge 1500, half-life 365 days and box prior 1, at weight 0.08; SIGMA 2.928, early widening 0.97; roster lineups at fill -0.3 | 1143 | 0.6137 | 0.6137 | +0.0000 [+0.0000, +0.0000] | tie |
| 2020-21 | 2015-16 to 2019-20 | on-court rating with ridge 6000, half-life 1460 days and box prior 0.5, at weight 0.14; SIGMA 3.171, early widening 0.98; roster lineups at fill -0.3 | 1171 | 0.6317 | 0.6312 | -0.0005 [-0.0029, +0.0020] | tie |
| 2021-22 | 2015-16 to 2020-21 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, at weight 0.10; SIGMA 3.164, early widening 1.08; roster lineups at fill -0.15 | 1323 | 0.6112 | 0.6117 | +0.0005 [-0.0017, +0.0028] | tie |
| 2022-23 | 2015-16 to 2021-22 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, at weight 0.12; SIGMA 3.202, early widening 1.15; roster lineups at fill -0.3 | 1320 | 0.6309 | 0.6299 | -0.0011 [-0.0036, +0.0015] | tie |
| 2023-24 | 2015-16 to 2022-23 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, at weight 0.12; SIGMA 3.219, early widening 1.19; roster lineups at fill -0.45 | 1319 | 0.5898 | 0.5875 | -0.0023 [-0.0046, -0.0002] | better |
| 2024-25 | 2015-16 to 2023-24 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, at weight 0.14; SIGMA 3.227, early widening 1.21; roster lineups at fill -0.45 | 1321 | 0.5953 | 0.5950 | -0.0003 [-0.0039, +0.0029] | tie |
| 2025-26 | 2015-16 to 2024-25 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, at weight 0.14; SIGMA 3.235, early widening 1.26; roster lineups at fill -0.45 | 1322 | 0.5815 | 0.5801 | -0.0014 [-0.0051, +0.0021] | tie |
| Pooled |  |  | 8919 | 0.6072 | 0.6065 | -0.0007 [-0.0018, +0.0003] | tie |

### Version 5 with roster-based lineups against version 5: lineup minutes against the minutes played

Over the team-games with a box score, played minutes scaled to 240 a side. Minutes misplaced is half the summed gap between each player's predicted and played minutes: the minutes of a team-game the lineup put on the wrong players. Value error is the root mean square of the sum over players of (predicted - played) / 48 times the player's value, at each version's own values, in margin units.

| Season | Team-games | Version 5 minutes misplaced | Candidate minutes misplaced | Candidate minus version 5 [95%] | Version 5 value error | Candidate value error |
| --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2286 | 36.26 | 36.26 | +0.00 [+0.00, +0.00] | 0.210 | 0.210 |
| 2020-21 | 2330 | 38.63 | 38.34 | -0.29 [-1.02, +0.48] | 0.302 | 0.283 |
| 2021-22 | 2646 | 38.05 | 37.25 | -0.80 [-1.95, +0.35] | 0.253 | 0.234 |
| 2022-23 | 2640 | 37.30 | 36.11 | -1.19 [-2.37, -0.16] | 0.268 | 0.243 |
| 2023-24 | 2638 | 36.07 | 35.20 | -0.88 [-1.65, -0.16] | 0.276 | 0.243 |
| 2024-25 | 2642 | 37.61 | 35.59 | -2.02 [-2.97, -1.06] | 0.298 | 0.258 |
| 2025-26 | 2636 | 38.65 | 35.97 | -2.68 [-3.68, -1.82] | 0.307 | 0.259 |
| Pooled | 17818 | 37.52 | 36.36 | -1.16 [-1.54, -0.81] | 0.276 | 0.248 |

### Version 5 with roster-based lineups: settings from every finished season

Chosen from 2015-16 to 2025-26, the settings the season after them would run with: on-court rating with ridge 1500, half-life 365 days and box prior 0.5, at weight 0.12; SIGMA 3.194, early widening 1.21; roster lineups at fill -0.45. They are the settings on file for the site.
<!-- results:end -->
