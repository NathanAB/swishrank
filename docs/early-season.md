# The start of a season

Written on 2026-11-02, two weeks into 2026-27. Investigation only: nothing here changes the site's model.

## The question

On 2026-11-02 MEM was 6-0 with the league's best net rating, and the site ranked it 19th while NBA.com's writers had it 5th. Two weeks in, the team seed from sportsbooks' preseason win totals still pulls each team's part of its rating with 96 * exp(-14 / 120) = 85 games. The owner asked whether early games should count for more.

## The answer

No. Version 4 is no weaker at the start of a season than later, measured against Vegas on the same games, and it does not under-react to hot or cold starts. Seven changes to how the seed and early games count were scored on the tuning seasons, each with its own SIGMA and early widening. None beat version 4 there, and the settings the tuning seasons chose were no better on the exploration seasons. Counting early games for more, by cutting the seed's pull, made the tuning seasons worse and helped only 2024-25 and 2025-26. This investigation recommends changing nothing and writing no version 5 plan from it.

`node scripts/early-season.ts` produces every number below and rewrites the tables at the end of this file. It takes about 2.5 minutes.

## How the seed works today

Each team's part of the rating is pulled toward its seed, `5 * (W / G - 0.5)` margin units from its preseason win total, with a strength of `96 * exp(-day / 120)` games against an average team, where `day` counts from the season's first game day (`docs/model-v2.md`, Team seed and Team prior strength). That is 85 games after two weeks and 76 after four. The pull is on the team part only. The player part has its own prior, each player's box rating held with 320 games (40 for a rookie), and it moves with the lineup the injury report gives each game. While either side has played fewer than 5 games, a rating gap counts 1.15 times less (`EARLY` in `src/lib/elo.ts`).

MEM's seed is -72 Elo points, 25th of 30. After six games its team part is -48 and its players add +38, for a rating of 989. Its six opponents' preseason win totals average 32.7, and four of its games were on the road.

## Diagnosis

The diagnosis scores version 4 as `modelInputs` builds it for the site, refitted on the tuning seasons to SIGMA 2.981 and early widening 1.15, the values in `src/lib/elo.ts`. It splits games by the game number of the side that had played fewer games.

**Early games are harder for everyone, and no harder for the model than for Vegas.** On the tuning seasons, 2015-16 to 2022-23, version 4's log loss runs 0.638 in games 1-5 and 0.607 from game 41 on, and Vegas's 0.626 and 0.594 on the same games (table 1). Version 4's gap to Vegas is +0.0124 in games 1-5, +0.0096 in games 6-10, +0.0041 in games 11-20, +0.0048 in games 21-40 and +0.0132 from game 41 on. On the exploration seasons, 2023-24 to 2025-26, it is +0.0127, +0.0203, +0.0078, +0.0109 and +0.0109. Only games 6-10 of the exploration seasons sit above the late-season gap, with an interval of [+0.0051, +0.0336] that overlaps it.

**Early chances are calibrated as well as Vegas's.** In games 1-10, favourites the model gave 50-60% won 52.8% against 54.8% predicted, and Vegas's won 53.7% against 55.4% (table 2). The other bins are within 3 points for both. Boldness, the multiplier on the z-score that would maximise the likelihood, swings the same way for both sources: in games 6-10 it is 0.866 for version 4 and 0.864 for Vegas on the tuning seasons, and 1.174 and 1.322 on the exploration seasons (table 1). Those swings belong to the seasons, not to the model.

**The model does not under-react to hot or cold starts.** For each team-season, its surprise is its mean miss against the model's expected margin over its first games. If the seed held a hot team back too long, its surprise would predict that it keeps beating the model's chances. Over 330 team-seasons, the slope of the next 20 games' result less the model's chance on the surprise over games 1-10 is +0.003 [-0.006, +0.013] per margin unit (table 3). A team one SD hotter than the model expected wins 0.004 games per game more than its chances afterwards, under one tenth of a win over 20 games. Every early window's interval holds 0, as do the mid-season controls', and Vegas's slopes on the same team-seasons are as flat.

**The test can see the mistake it looks for.** A model whose seed pulls with 960 games all season, which must under-react, gives a slope of +0.013 [+0.004, +0.023], and one with 8 games, which must over-react, -0.026 [-0.038, -0.014] (table 4). Version 4's interval excludes an over-reaction of the second's size, and an under-reaction as large as the first's lies at its upper edge. A smaller under-reaction, up to about 0.013 wins per game per margin unit, cannot be ruled out, and is what the tests below would find.

## Ideas

The ideas tried, and why:

1. **A looser or faster-fading pull.** The owner's question taken directly. The version 2 exploration tuned n0 and fade (`docs/model-v2-exploration.tsv`, H1, H9, H18) before version 3's lineups and version 4's injury report changed what the player part carries, so it was retested on a 48-point grid of n0 from 24 to 384 and fade from 30 days to none.
2. **A fade by each team's games played instead of the calendar.** A team that has played more has shown more. Not tried before.
3. **A pull by roster continuity.** The share of a team's minutes so far played by players who played for it last season, the league's mean taken out, raised to a power gamma. A team that changed more should lean less on its win total. DARKO learns faster after a team change for the same reason. Not tried before.
4. **A heavier-tailed seed.** The pull cut for a team whose part has strayed far from its seed, by 1 / (1 + (gap / delta)^2), from the day before's fit. A seed that is wrong for one team should let go of that team sooner. Not tried before.
5. **Last season's team part in the seed.** The seed blends in a share w of each team's team part at the end of the season before: what its players did not explain, such as coaching or system. Version 2 used it only for a season with no totals.
6. **A smooth early widening.** `1 + c * exp(-k / kappa)` by the less experienced side's games played k, in place of the 1.15 step below 5 games. Version 2's H10 tried it before players were in. It was retested because it costs no fit, and table 8 shows what each game number wants.
7. **Early margins counted fuller.** Margins counted as (|m| + 3)^q with q of 0.75 or 1 for the first 14 or 28 days, then 0.5. A blowout may say more early, when the model knows less. Not tried before.

The ideas not tried, and why:

8. **A pull by the share of minutes rookies play.** Rookies' starting levels belong to another investigation running beside this one, and continuity in idea 3 already counts rookies as new minutes.
9. **The seed's scale.** Version 4's investigation tried it (`docs/model-v4.md`, What came before this plan), and nothing since has changed the seed.
10. **Weighting recent games within a season.** Version 2's H2 and version 4's investigation both tried it.
11. **A stronger prior on early rotations.** Version 2 tried 2, 3 and 5 pseudo-games of last season's minutes until game 10 and found the chart no steadier and the next-10 miss moved by less than 0.0002 (`docs/model-v2.md`, Settings and their evidence).
12. **A seed that follows the market through the season,** from futures or game lines. It would make Vegas an input, where this repo keeps it a reference, and the data is not on file.

## What the tests found

Each idea's grid was scored on the tuning seasons alone, and its best setting there was then checked on the exploration seasons and on the early games of each (tables 5 and 6). Early games are those where the side that had played fewer games had played 10 or fewer, or 20 or fewer, before it.

| Idea | Best tuning setting | Tuning | Tuning, ≤ 10 | Tuning, ≤ 20 | Exploration | Exploration, ≤ 10 | Exploration, ≤ 20 | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pull and fade | n0 288, fade 45 days | -0.0001 [-0.0004, +0.0002] | +0.0003 [-0.0004, +0.0011] | +0.0000 [-0.0007, +0.0007] | +0.0003 [-0.0004, +0.0010] | +0.0016 [+0.0002, +0.0032] | +0.0023 [+0.0009, +0.0037] | tie on tuning, worse early on exploration |
| Fade by games played | n0 144, fade 30 games | -0.0001 [-0.0003, +0.0002] | +0.0000 [-0.0003, +0.0004] | +0.0000 [-0.0003, +0.0003] | -0.0000 [-0.0005, +0.0004] | +0.0007 [+0.0001, +0.0013] | +0.0008 [+0.0003, +0.0012] | tie on tuning, worse early on exploration |
| Pull by roster continuity | gamma 2 | -0.0002 [-0.0008, +0.0004] | -0.0009 [-0.0032, +0.0018] | -0.0003 [-0.0017, +0.0012] | -0.0004 [-0.0011, +0.0003] | +0.0001 [-0.0012, +0.0014] | +0.0001 [-0.0013, +0.0015] | tie |
| Heavier-tailed seed | delta 2 | +0.0000 [-0.0000, +0.0001] | -0.0000 [-0.0001, +0.0000] | +0.0000 [-0.0000, +0.0000] | -0.0000 [-0.0002, +0.0001] | +0.0000 [-0.0000, +0.0001] | -0.0000 [-0.0001, +0.0001] | tie |
| Last season's team part | w 0.15 | -0.0000 [-0.0003, +0.0002] | -0.0007 [-0.0019, +0.0004] | -0.0002 [-0.0009, +0.0005] | +0.0002 [-0.0002, +0.0006] | +0.0002 [-0.0013, +0.0016] | +0.0001 [-0.0009, +0.0009] | tie |
| Early margins fuller | q 0.75 for 14 days | +0.0013 [+0.0004, +0.0021] | +0.0015 [-0.0010, +0.0040] | +0.0023 [+0.0004, +0.0043] | +0.0000 [-0.0013, +0.0014] | -0.0030 [-0.0075, +0.0012] | -0.0010 [-0.0043, +0.0021] | worse |
| Smooth early widening | kappa 8, c 0.111 | +0.0000 [-0.0001, +0.0002] | +0.0000 [-0.0009, +0.0009] | +0.0001 [-0.0004, +0.0006] | +0.0001 [-0.0001, +0.0003] | +0.0006 [-0.0007, +0.0017] | +0.0005 [-0.0002, +0.0012] | tie |

Log loss less version 4's, with 95% intervals from the weekly block bootstrap. Below 0 is better.

- **The seed's pull sits on a flat ridge.** On the tuning seasons, n0 96 with a 120-day fade, n0 192 with 60 days and n0 288 with 45 days all score within 0.0001 of each other (table 5). The ridge's best point pulls harder early and lets go faster, the opposite of the owner's idea, and it does worse on the exploration seasons' early games.
- **Counting early games for more fails on the tuning seasons and helps the last two seasons.** Cutting n0 to 64, 48 or 24 with the 120-day fade scores +0.0001, +0.0004 and +0.0016 on the tuning seasons, and +0.0003, +0.0008 and +0.0032 on their games with a side at 20 or fewer (table 7). On the exploration seasons' early games the same cuts score -0.0014, -0.0023 and -0.0042. Season by season (table 7b), the gain comes from 2024-25 and 2025-26: n0 48 scores -0.0030 and -0.0039 there on the early games, and +0.0017 to +0.0022 in 2016-17 and 2020-21 to 2022-23. Among the tuning seasons, only 2015-16 leans the same way, and four lean the other. Two recent seasons do not make a rule. A setting chosen on the exploration seasons cannot be confirmed by them either.
- **Roster continuity is the one idea that never scored worse,** at -0.0002 [-0.0008, +0.0004] on the tuning seasons and -0.0004 [-0.0011, +0.0003] on the exploration seasons, with gamma 0.5 to 3 all within 0.0001. It ties, and is too small to plan a version around.
- **The early widening has no shape to find.** The widening each game number wants swings between 0.7 and 1.6 from one game to the next on the tuning seasons, and between 0.4 and 1.5 on the exploration seasons, with no pattern shared by the two (table 8). On about 125 games each, that is noise around the 1.15 step.
- **Counting early margins fuller is worse.** Every setting on its grid was worse on the tuning seasons, by +0.0013 to +0.0100.

## MEM

Under each idea's best tuning setting, MEM's rating after 2026-11-01 runs from 977 to 995 and its rank from 17th to 20th, against 989 and 19th today (table 9). The early margins rule, which the tuning seasons reject, puts it at 1041 and 14th. Cutting the pull to n0 48 puts it at 1008 and 16th. The loosest pull tried, n0 24 with a 30-day fade, worse than version 4 by +0.0040 on the tuning seasons, puts it at 1048 and 12th. No setting tried puts MEM in the top 10.

Vegas had MEM at 50.4% at UTAH on 2026-10-27, its fourth game, where version 4 had 42.2% and the loosest pull 47.6% (table 10). In MEM's first three games Vegas's chance was above version 4's once and below it twice. The lines for its last two games are not yet on file. That is one game of evidence that the market moved on MEM sooner than the model, and it is not enough to judge by.

The gap to NBA.com's 5th comes mostly from what the ranking reads. Net rating does not adjust for opponents, and MEM's six opponents average 32.7 preseason wins, with four of the six games on the road. The model weighs those six games against a seed that sportsbooks set at 29.5 wins, and the tests above say that over 11 seasons that weighting has been about right.

## Recommendation

Change nothing. No idea here earns a pre-registered version 5 plan: none beat version 4 on the tuning seasons, and the setting each chose there did not hold on the exploration seasons. The one pattern worth watching is that 2024-25 and 2025-26 both favoured a looser pull on their early games. `node scripts/early-season.ts` reruns table 7b with 2026-27 once the season's early games are final. If 2026-27 leans the same way, a third season would justify a plan that fixes n0 64 before 2027-28 and judges it there, since n0 64 ties version 4 on the tuning seasons.

## What others do

- **FiveThirtyEight's NBA Elo** keeps three-quarters of each team's rating from the season before, reverting the rest toward 1505, and updates every game with the same K of 20 all season. It treats early games no differently, and its write-up points to OKC holding above 1508 through a 3-12 start as a case where reacting slowly paid off ([How We Calculate NBA Elo Ratings](https://www.goodreads.com/author_blog_posts/8399806-how-we-calculate-nba-elo-ratings), a copy of FiveThirtyEight's article, whose own address now redirects). Version 4 does what it does: one schedule for every team, and no special early rule beyond the widening.
- **DARKO** projects each player with a modified Kalman filter and per-stat decay, uses no preseason data, and learns faster about a player after a team change ([DARKO, About](https://darko.app/about)). Idea 3 is that rule at the team level. It tied version 4 here, likely because version 4's player part already follows each player across teams.
- **Neil Paine's forecast** rates teams on a window that includes the end of the season before, regressed to the mean by 15 games ([2024-25 NBA Forecast](https://neilpaine.substack.com/p/2024-25-nba-forecast)). That is a far weaker prior than version 4's 85 games at two weeks, but its prior is last season's results, while version 4's is the market's win total, which already knows about the summer's moves. On the tuning seasons, version 4's seed at a tenth of its pull scored worse by +0.0040 (table 7).
- **Vegas** is on the same games in tables 1 to 3. Its early-season gap to its own late-season log loss is the same size as the model's, and its hot-start slopes are as flat. The market does not move faster on early results than the model does, in these seasons.

## Tables

Generated by `node scripts/early-season.ts`, which rewrites the text between the markers below.

<!-- tables:start -->
### Table 1. Log loss by the less experienced side's game number, against Vegas

Version 4 as the site runs it, with SIGMA and early widening fitted on the tuning seasons. A game falls in the bucket of the game number of the side that had played fewer games. Only games with a Vegas line. Boldness is the multiplier on each chance's z-score that would maximise its likelihood on those games: 1 is calibrated, below 1 the chances should have been more timid, above 1 bolder. Version 4's boldness on tuning games 1-5 is 1 by construction, since the early widening is fitted on those games.

| Seasons | Game number | Games | Vegas log loss | Version 4 log loss | Version 4 - Vegas [95%] | Version 4 boldness | Vegas boldness |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tuning | 1-5 | 630 | 0.6257 | 0.6381 | +0.0124 [-0.0029, +0.0272] | 1.000 | 0.875 |
| Tuning | 6-10 | 617 | 0.6248 | 0.6344 | +0.0096 [+0.0002, +0.0190] | 0.866 | 0.864 |
| Tuning | 11-20 | 1207 | 0.6054 | 0.6096 | +0.0041 [-0.0027, +0.0124] | 1.053 | 1.019 |
| Tuning | 21-40 | 2382 | 0.6100 | 0.6149 | +0.0048 [+0.0002, +0.0098] | 0.976 | 0.954 |
| Tuning | 41+ | 5326 | 0.5938 | 0.6070 | +0.0132 [+0.0088, +0.0180] | 1.029 | 0.979 |
| Exploration | 1-5 | 238 | 0.6189 | 0.6316 | +0.0127 [-0.0054, +0.0285] | 1.051 | 1.030 |
| Exploration | 6-10 | 228 | 0.5675 | 0.5878 | +0.0203 [+0.0051, +0.0336] | 1.174 | 1.322 |
| Exploration | 11-20 | 461 | 0.5876 | 0.5954 | +0.0078 [-0.0026, +0.0182] | 1.048 | 1.064 |
| Exploration | 21-40 | 903 | 0.6048 | 0.6157 | +0.0109 [+0.0019, +0.0207] | 0.937 | 0.979 |
| Exploration | 41+ | 2132 | 0.5684 | 0.5793 | +0.0109 [+0.0032, +0.0180] | 1.081 | 1.063 |

### Table 2. Calibration by game number

The favourite's mean chance / how often the favourite won (games), in bins of the favourite's chance, for version 4 and for Vegas on the same games. Tuning and exploration seasons pooled, games with a Vegas line.

| Game number | Source | 50-60% | 60-70% | 70-80% | 80%+ |
| --- | --- | --- | --- | --- | --- |
| 1-10 | Version 4 | 54.8% / 52.8% (669) | 65.0% / 65.1% (539) | 74.6% / 75.0% (364) | 84.7% / 83.0% (141) |
| 1-10 | Vegas | 55.4% / 53.7% (551) | 64.8% / 62.1% (528) | 74.7% / 73.9% (395) | 85.2% / 83.7% (239) |
| 11-20 | Version 4 | 55.0% / 53.0% (585) | 65.0% / 66.6% (491) | 74.8% / 75.9% (386) | 84.9% / 85.4% (206) |
| 11-20 | Vegas | 55.2% / 56.5% (527) | 64.6% / 61.1% (504) | 74.7% / 78.7% (380) | 85.1% / 84.4% (257) |
| 41+ | Version 4 | 54.9% / 55.9% (2558) | 64.7% / 65.4% (2210) | 74.8% / 76.4% (1560) | 85.8% / 86.1% (1130) |
| 41+ | Vegas | 55.3% / 55.0% (2082) | 64.9% / 65.9% (2133) | 74.6% / 75.5% (1700) | 86.0% / 85.2% (1543) |

### Table 3. Do a team's early misses keep going?

Tuning and exploration seasons pooled. A team's surprise is its mean miss against version 4's expected margin, in margin units, over the games named. The slope is how its result less the model's chance, per game over the games after, moves per margin unit of surprise, with a 95% interval from resampling team-seasons; above 0, the model under-reacts. Per SD is the slope times the surprise's spread: the wins per game beyond the chances that a team one SD hotter than the model expected goes on to get. Hottest and coldest fifth are the mean result less the model's chance per game over the next games for the fifth of teams with the largest and smallest surprise. Vegas's slope is on the team-seasons whose next games all have a line, with version 4's on the same ones beside it.

| Window | Team-seasons | Surprise SD | Version 4 slope [95%] | Version 4 per SD | Hottest fifth | Coldest fifth | Team-seasons with lines | Version 4 slope, same [95%] | Vegas slope [95%] |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Games 1-5, next 10 | 330 | 1.554 | +0.004 [-0.007, +0.015] | +0.006 | +0.007 | -0.015 | 323 | +0.003 [-0.008, +0.014] | -0.005 [-0.016, +0.006] |
| Games 1-10, next 10 | 330 | 1.145 | +0.008 [-0.006, +0.021] | +0.009 | +0.016 | -0.005 | 303 | +0.011 [-0.004, +0.026] | +0.003 [-0.011, +0.017] |
| Games 1-10, next 20 | 330 | 1.145 | +0.003 [-0.006, +0.013] | +0.004 | +0.016 | +0.007 | 300 | +0.005 [-0.005, +0.015] | -0.001 [-0.011, +0.009] |
| Games 1-20, next 20 | 330 | 0.828 | -0.008 [-0.021, +0.005] | -0.007 | -0.005 | +0.020 | 300 | -0.007 [-0.020, +0.006] | -0.013 [-0.027, +0.000] |
| Games 31-40, next 20 (control) | 330 | 1.128 | -0.001 [-0.012, +0.010] | -0.001 | +0.012 | +0.017 | 330 | -0.001 [-0.012, +0.010] | -0.005 [-0.015, +0.006] |
| Games 21-40, next 20 (control) | 330 | 0.787 | +0.007 [-0.008, +0.022] | +0.005 | +0.017 | +0.004 | 330 | +0.007 [-0.008, +0.022] | +0.000 [-0.014, +0.014] |

### Table 4. The test on planted mistakes

Table 3's window of games 1-10 and the next 20, for the site's model and for two versions built to be wrong: one whose seed pulls with 960 games all season, which must under-react, and one with 8, which must over-react. Each has its own SIGMA and early widening.

| Model | Team-seasons | Surprise SD | Version 4 slope [95%] | Version 4 per SD | Hottest fifth | Coldest fifth | Team-seasons with lines | Version 4 slope, same [95%] | Vegas slope [95%] |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Version 4 | 330 | 1.145 | +0.003 [-0.006, +0.013] | +0.004 | +0.016 | +0.007 | 300 | +0.005 [-0.005, +0.015] | -0.001 [-0.011, +0.009] |
| Pull of 960 games, no fade | 330 | 1.191 | +0.013 [+0.004, +0.023] | +0.016 | +0.031 | -0.013 | 300 | +0.016 [+0.006, +0.025] | -0.001 [-0.011, +0.008] |
| Pull of 8 games, no fade | 330 | 0.890 | -0.026 [-0.038, -0.014] | -0.023 | -0.022 | +0.031 | 300 | -0.023 [-0.036, -0.011] | +0.002 [-0.011, +0.016] |

### Table 5. Each idea's grid on the tuning seasons

Each setting has its own SIGMA and early widening, fitted on the tuning seasons, and is scored by its tuning log loss less version 4's. Best first.

| Idea | Settings, best first, with tuning log loss less version 4's |
| --- | --- |
| Pull and fade | n0 288, fade 45 days -0.0001; n0 384, fade 45 days -0.0001; n0 192, fade 60 days -0.0001; n0 144, fade 60 days -0.0000; n0 288, fade 60 days -0.0000; n0 96, fade 120 days +0.0000; n0 192, fade 45 days +0.0000; n0 144, fade 120 days +0.0001; n0 64, fade 240 days +0.0001; n0 384, fade 60 days +0.0001; n0 384, fade 30 days +0.0001; n0 96, fade 240 days +0.0001; n0 64, fade 120 days +0.0001; n0 144, fade 45 days +0.0002; n0 96, fade 60 days +0.0002; n0 48, fade 240 days +0.0002; n0 48, fade none +0.0002; n0 192, fade 120 days +0.0003; n0 64, fade none +0.0003; n0 288, fade 30 days +0.0003; n0 144, fade 240 days +0.0004; n0 48, fade 120 days +0.0004; n0 96, fade none +0.0005; n0 96, fade 45 days +0.0006; n0 288, fade 120 days +0.0006; n0 192, fade 30 days +0.0006; n0 192, fade 240 days +0.0006; n0 64, fade 60 days +0.0006; n0 144, fade none +0.0008; n0 384, fade 120 days +0.0008; n0 24, fade none +0.0009; n0 144, fade 30 days +0.0009; n0 288, fade 240 days +0.0010; n0 48, fade 60 days +0.0011; n0 64, fade 45 days +0.0011; n0 192, fade none +0.0011; n0 24, fade 240 days +0.0012; n0 384, fade 240 days +0.0013; n0 96, fade 30 days +0.0015; n0 288, fade none +0.0015; n0 48, fade 45 days +0.0016; n0 24, fade 120 days +0.0016; n0 384, fade none +0.0017; n0 64, fade 30 days +0.0021; n0 24, fade 60 days +0.0025; n0 48, fade 30 days +0.0026; n0 24, fade 45 days +0.0030; n0 24, fade 30 days +0.0040 |
| Fade by games played | n0 144, fade 30 games -0.0001; n0 96, fade 59 games -0.0000; n0 144, fade 59 games +0.0000; n0 96, fade 120 games +0.0001; n0 96, fade 30 games +0.0001; n0 48, fade 120 games +0.0002; n0 48, fade 59 games +0.0004; n0 144, fade 120 games +0.0004; n0 144, fade 15 games +0.0009; n0 48, fade 30 games +0.0010; n0 96, fade 15 games +0.0014; n0 48, fade 15 games +0.0025 |
| Pull by roster continuity | gamma 2 -0.0002; gamma 1 -0.0001; gamma 0.5 -0.0001; gamma 3 -0.0001 |
| Heavier-tailed seed | delta 2 +0.0000; delta 1 +0.0001; delta 0.5 +0.0008; delta 0.25 +0.0037 |
| Last season's team part in the seed | w 0.15 -0.0000; w 0.3 +0.0001; w 0.5 +0.0006 |
| Early margins counted fuller | q 0.75 for 14 days +0.0013; q 0.75 for 28 days +0.0017; q 1 for 14 days +0.0080; q 1 for 28 days +0.0100 |
| Smooth early widening | kappa 8, c 0.111 +0.0000; kappa 16, c 0.070 +0.0000; kappa 4, c 0.140 +0.0000; kappa 1, c 0.000 +0.0001; kappa 2, c 0.000 +0.0001 |

### Table 6. Each idea's best tuning setting against version 4

The setting each idea's grid chose on the tuning seasons, against version 4 on the same games, with SIGMA and early widening refitted. Only the tuning rows chose it; the exploration rows check whether it holds. Early rows are games where the side that had played fewer games had played 10 or fewer, or 20 or fewer, before it.

| Idea | Setting | SIGMA | Games | Version 4 log loss | Log loss | Minus version 4 [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pull and fade | n0 288, fade 45 days: Tuning | 3.007 | 10206 | 0.6128 | 0.6127 | -0.0001 [-0.0004, +0.0002] | tie |
|  | Tuning, a side ≤ 10 games |  | 1371 | 0.6321 | 0.6325 | +0.0003 [-0.0004, +0.0011] | tie |
|  | Tuning, a side ≤ 20 games |  | 2588 | 0.6202 | 0.6202 | +0.0000 [-0.0007, +0.0007] | tie |
|  | Exploration |  | 3962 | 0.5931 | 0.5934 | +0.0003 [-0.0004, +0.0010] | tie |
|  | Exploration, a side ≤ 10 games |  | 510 | 0.6107 | 0.6123 | +0.0016 [+0.0002, +0.0032] | worse |
|  | Exploration, a side ≤ 20 games |  | 970 | 0.6019 | 0.6042 | +0.0023 [+0.0009, +0.0037] | worse |
| Fade by games played | n0 144, fade 30 games: Tuning | 3.014 | 10206 | 0.6128 | 0.6127 | -0.0001 [-0.0003, +0.0002] | tie |
|  | Tuning, a side ≤ 10 games |  | 1371 | 0.6321 | 0.6322 | +0.0000 [-0.0003, +0.0004] | tie |
|  | Tuning, a side ≤ 20 games |  | 2588 | 0.6202 | 0.6203 | +0.0000 [-0.0003, +0.0003] | tie |
|  | Exploration |  | 3962 | 0.5931 | 0.5931 | -0.0000 [-0.0005, +0.0004] | tie |
|  | Exploration, a side ≤ 10 games |  | 510 | 0.6107 | 0.6114 | +0.0007 [+0.0001, +0.0013] | worse |
|  | Exploration, a side ≤ 20 games |  | 970 | 0.6019 | 0.6026 | +0.0008 [+0.0003, +0.0012] | worse |
| Pull by roster continuity | gamma 2: Tuning | 3.001 | 10206 | 0.6128 | 0.6126 | -0.0002 [-0.0008, +0.0004] | tie |
|  | Tuning, a side ≤ 10 games |  | 1371 | 0.6321 | 0.6313 | -0.0009 [-0.0032, +0.0018] | tie |
|  | Tuning, a side ≤ 20 games |  | 2588 | 0.6202 | 0.6199 | -0.0003 [-0.0017, +0.0012] | tie |
|  | Exploration |  | 3962 | 0.5931 | 0.5927 | -0.0004 [-0.0011, +0.0003] | tie |
|  | Exploration, a side ≤ 10 games |  | 510 | 0.6107 | 0.6108 | +0.0001 [-0.0012, +0.0014] | tie |
|  | Exploration, a side ≤ 20 games |  | 970 | 0.6019 | 0.6019 | +0.0001 [-0.0013, +0.0015] | tie |
| Heavier-tailed seed | delta 2: Tuning | 2.988 | 10206 | 0.6128 | 0.6128 | +0.0000 [-0.0000, +0.0001] | tie |
|  | Tuning, a side ≤ 10 games |  | 1371 | 0.6321 | 0.6321 | -0.0000 [-0.0001, +0.0000] | tie |
|  | Tuning, a side ≤ 20 games |  | 2588 | 0.6202 | 0.6203 | +0.0000 [-0.0000, +0.0000] | tie |
|  | Exploration |  | 3962 | 0.5931 | 0.5931 | -0.0000 [-0.0002, +0.0001] | tie |
|  | Exploration, a side ≤ 10 games |  | 510 | 0.6107 | 0.6107 | +0.0000 [-0.0000, +0.0001] | tie |
|  | Exploration, a side ≤ 20 games |  | 970 | 0.6019 | 0.6019 | -0.0000 [-0.0001, +0.0001] | tie |
| Last season's team part in the seed | w 0.15: Tuning | 2.989 | 10206 | 0.6128 | 0.6127 | -0.0000 [-0.0003, +0.0002] | tie |
|  | Tuning, a side ≤ 10 games |  | 1371 | 0.6321 | 0.6315 | -0.0007 [-0.0019, +0.0004] | tie |
|  | Tuning, a side ≤ 20 games |  | 2588 | 0.6202 | 0.6200 | -0.0002 [-0.0009, +0.0005] | tie |
|  | Exploration |  | 3962 | 0.5931 | 0.5933 | +0.0002 [-0.0002, +0.0006] | tie |
|  | Exploration, a side ≤ 10 games |  | 510 | 0.6107 | 0.6109 | +0.0002 [-0.0013, +0.0016] | tie |
|  | Exploration, a side ≤ 20 games |  | 970 | 0.6019 | 0.6020 | +0.0001 [-0.0009, +0.0009] | tie |
| Early margins counted fuller | q 0.75 for 14 days: Tuning | 3.261 | 10206 | 0.6128 | 0.6141 | +0.0013 [+0.0004, +0.0021] | worse |
|  | Tuning, a side ≤ 10 games |  | 1371 | 0.6321 | 0.6336 | +0.0015 [-0.0010, +0.0040] | tie |
|  | Tuning, a side ≤ 20 games |  | 2588 | 0.6202 | 0.6225 | +0.0023 [+0.0004, +0.0043] | worse |
|  | Exploration |  | 3962 | 0.5931 | 0.5931 | +0.0000 [-0.0013, +0.0014] | tie |
|  | Exploration, a side ≤ 10 games |  | 510 | 0.6107 | 0.6077 | -0.0030 [-0.0075, +0.0012] | tie |
|  | Exploration, a side ≤ 20 games |  | 970 | 0.6019 | 0.6009 | -0.0010 [-0.0043, +0.0021] | tie |
| Smooth early widening | kappa 8, c 0.111: Tuning | 2.981 | 10206 | 0.6128 | 0.6128 | +0.0000 [-0.0001, +0.0002] | tie |
|  | Tuning, a side ≤ 10 games |  | 1371 | 0.6321 | 0.6322 | +0.0000 [-0.0009, +0.0009] | tie |
|  | Tuning, a side ≤ 20 games |  | 2588 | 0.6202 | 0.6204 | +0.0001 [-0.0004, +0.0006] | tie |
|  | Exploration |  | 3962 | 0.5931 | 0.5932 | +0.0001 [-0.0001, +0.0003] | tie |
|  | Exploration, a side ≤ 10 games |  | 510 | 0.6107 | 0.6113 | +0.0006 [-0.0007, +0.0017] | tie |
|  | Exploration, a side ≤ 20 games |  | 970 | 0.6019 | 0.6024 | +0.0005 [-0.0002, +0.0012] | tie |

### Table 7. Early games counted for more

The owner's question taken directly: the seed's pull cut, so a team's first games move it further, each with its own SIGMA and early widening, against version 4. Version 4 pulls with 96 * exp(-day / 120) games: 85 after two weeks, 76 after four.

| Pull | SIGMA | Seasons | Games | Version 4 log loss | Log loss | Minus version 4 [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n0 64, fade 120 days | 3.031 | Tuning | 10206 | 0.6128 | 0.6129 | +0.0001 [-0.0001, +0.0004] | tie |
|  |  | Tuning, a side ≤ 10 games | 1371 | 0.6321 | 0.6319 | -0.0002 [-0.0006, +0.0003] | tie |
|  |  | Tuning, a side ≤ 20 games | 2588 | 0.6202 | 0.6206 | +0.0003 [-0.0001, +0.0008] | tie |
|  |  | Exploration | 3962 | 0.5931 | 0.5928 | -0.0004 [-0.0008, +0.0001] | tie |
|  |  | Exploration, a side ≤ 10 games | 510 | 0.6107 | 0.6099 | -0.0008 [-0.0019, +0.0002] | tie |
|  |  | Exploration, a side ≤ 20 games | 970 | 0.6019 | 0.6005 | -0.0014 [-0.0024, -0.0002] | better |
| n0 48, fade 120 days | 3.073 | Tuning | 10206 | 0.6128 | 0.6132 | +0.0004 [+0.0000, +0.0008] | worse |
|  |  | Tuning, a side ≤ 10 games | 1371 | 0.6321 | 0.6319 | -0.0002 [-0.0011, +0.0007] | tie |
|  |  | Tuning, a side ≤ 20 games | 2588 | 0.6202 | 0.6210 | +0.0008 [+0.0000, +0.0016] | worse |
|  |  | Exploration | 3962 | 0.5931 | 0.5927 | -0.0005 [-0.0013, +0.0003] | tie |
|  |  | Exploration, a side ≤ 10 games | 510 | 0.6107 | 0.6093 | -0.0014 [-0.0035, +0.0005] | tie |
|  |  | Exploration, a side ≤ 20 games | 970 | 0.6019 | 0.5995 | -0.0023 [-0.0042, -0.0002] | better |
| n0 24, fade 120 days | 3.196 | Tuning | 10206 | 0.6128 | 0.6144 | +0.0016 [+0.0008, +0.0025] | worse |
|  |  | Tuning, a side ≤ 10 games | 1371 | 0.6321 | 0.6329 | +0.0008 [-0.0015, +0.0029] | tie |
|  |  | Tuning, a side ≤ 20 games | 2588 | 0.6202 | 0.6234 | +0.0032 [+0.0014, +0.0050] | worse |
|  |  | Exploration | 3962 | 0.5931 | 0.5929 | -0.0003 [-0.0019, +0.0013] | tie |
|  |  | Exploration, a side ≤ 10 games | 510 | 0.6107 | 0.6080 | -0.0026 [-0.0080, +0.0023] | tie |
|  |  | Exploration, a side ≤ 20 games | 970 | 0.6019 | 0.5977 | -0.0042 [-0.0084, +0.0007] | tie |
| n0 48, fade 60 days | 3.168 | Tuning | 10206 | 0.6128 | 0.6138 | +0.0011 [+0.0004, +0.0018] | worse |
|  |  | Tuning, a side ≤ 10 games | 1371 | 0.6321 | 0.6319 | -0.0002 [-0.0013, +0.0008] | tie |
|  |  | Tuning, a side ≤ 20 games | 2588 | 0.6202 | 0.6217 | +0.0015 [+0.0004, +0.0025] | worse |
|  |  | Exploration | 3962 | 0.5931 | 0.5931 | -0.0001 [-0.0014, +0.0013] | tie |
|  |  | Exploration, a side ≤ 10 games | 510 | 0.6107 | 0.6093 | -0.0014 [-0.0040, +0.0010] | tie |
|  |  | Exploration, a side ≤ 20 games | 970 | 0.6019 | 0.5992 | -0.0027 [-0.0054, +0.0004] | tie |
| n0 24, fade 30 days | 3.400 | Tuning | 10206 | 0.6128 | 0.6168 | +0.0040 [+0.0027, +0.0053] | worse |
|  |  | Tuning, a side ≤ 10 games | 1371 | 0.6321 | 0.6339 | +0.0018 [-0.0011, +0.0045] | tie |
|  |  | Tuning, a side ≤ 20 games | 2588 | 0.6202 | 0.6270 | +0.0067 [+0.0039, +0.0096] | worse |
|  |  | Exploration | 3962 | 0.5931 | 0.5945 | +0.0014 [-0.0011, +0.0038] | tie |
|  |  | Exploration, a side ≤ 10 games | 510 | 0.6107 | 0.6079 | -0.0027 [-0.0098, +0.0036] | tie |
|  |  | Exploration, a side ≤ 20 games | 970 | 0.6019 | 0.5977 | -0.0042 [-0.0104, +0.0032] | tie |

### Table 7b. The looser pulls season by season

Each looser pull of table 7 less version 4 in log loss on the games where a side had played 20 or fewer, season by season, with its 95% interval.

| Season | Games | n0 64, fade 120 days | n0 48, fade 120 days | n0 24, fade 120 days |
| --- | --- | --- | --- | --- |
| 2015-16 | 325 | -0.0008 [-0.0016, -0.0002] | -0.0013 [-0.0027, -0.0001] | -0.0014 [-0.0045, +0.0017] |
| 2016-17 | 322 | +0.0009 [-0.0002, +0.0020] | +0.0017 [-0.0003, +0.0038] | +0.0053 [+0.0007, +0.0100] |
| 2017-18 | 325 | +0.0003 [-0.0006, +0.0012] | +0.0008 [-0.0008, +0.0023] | +0.0033 [-0.0005, +0.0068] |
| 2018-19 | 325 | -0.0001 [-0.0012, +0.0010] | +0.0000 [-0.0021, +0.0020] | +0.0014 [-0.0038, +0.0062] |
| 2019-20 | 322 | -0.0003 [-0.0009, +0.0005] | -0.0005 [-0.0015, +0.0010] | -0.0002 [-0.0024, +0.0032] |
| 2020-21 | 326 | +0.0009 [-0.0005, +0.0026] | +0.0019 [-0.0006, +0.0049] | +0.0056 [-0.0002, +0.0123] |
| 2021-22 | 322 | +0.0011 [+0.0000, +0.0025] | +0.0022 [+0.0001, +0.0048] | +0.0063 [+0.0012, +0.0125] |
| 2022-23 | 321 | +0.0008 [-0.0008, +0.0026] | +0.0017 [-0.0013, +0.0049] | +0.0051 [-0.0021, +0.0130] |
| 2023-24 | 323 | -0.0002 [-0.0026, +0.0016] | -0.0001 [-0.0046, +0.0030] | +0.0009 [-0.0093, +0.0083] |
| 2024-25 | 323 | -0.0017 [-0.0031, +0.0003] | -0.0030 [-0.0054, +0.0007] | -0.0058 [-0.0115, +0.0027] |
| 2025-26 | 324 | -0.0022 [-0.0036, -0.0009] | -0.0039 [-0.0064, -0.0014] | -0.0076 [-0.0133, -0.0019] |

### Table 8. The widening each game number wants

The widening, 1 / boldness, that maximises the likelihood of version 4's chances before any early widening on the games where the less experienced side had played k games before, on the tuning and the exploration seasons. Version 4 widens by 1.15 for k of 0 to 4 and by 1 after.

| k | Tuning games | Tuning widening wanted | Exploration games | Exploration widening wanted |
| --- | --- | --- | --- | --- |
| 0 | 129 | 0.863 | 47 | 0.440 |
| 1 | 128 | 0.713 | 51 | 1.490 |
| 2 | 125 | 1.274 | 46 | 0.989 |
| 3 | 127 | 1.523 | 45 | 1.251 |
| 4 | 121 | 1.600 | 49 | 1.329 |
| 5 | 126 | 1.216 | 44 | 0.979 |
| 6 | 124 | 1.230 | 44 | 1.098 |
| 7 | 127 | 1.260 | 49 | 0.764 |
| 8 | 117 | 0.763 | 45 | 1.040 |
| 9 | 123 | 1.527 | 46 | 0.489 |

### Table 9. MEM after 2026-11-01

MEM's shown rating and rank among the 30 teams under each idea's best tuning setting and each looser pull of table 7, as compute() shows a rating: the team part plus the player part of its rotation, on the Elo scale at the model's own SIGMA. The early widening changes chances, not ratings, so it has no row.

| Model | MEM rating | MEM rank | Top team | Top rating |
| --- | --- | --- | --- | --- |
| Version 4 | 989 | 19 | SA | 1181 |
| Pull and fade: n0 288, fade 45 days | 977 | 20 | SA | 1181 |
| Fade by games played: n0 144, fade 30 games | 984 | 19 | SA | 1180 |
| Pull by roster continuity: gamma 2 | 995 | 18 | SA | 1181 |
| Heavier-tailed seed: delta 2 | 990 | 19 | SA | 1181 |
| Last season's team part in the seed: w 0.15 | 987 | 17 | SA | 1183 |
| Early margins counted fuller: q 0.75 for 14 days | 1041 | 14 | SA | 1184 |
| Looser pull: n0 64, fade 120 days | 999 | 16 | SA | 1177 |
| Looser pull: n0 48, fade 120 days | 1008 | 16 | SA | 1174 |
| Looser pull: n0 24, fade 120 days | 1036 | 14 | SA | 1165 |
| Looser pull: n0 48, fade 60 days | 1010 | 16 | SA | 1168 |
| Looser pull: n0 24, fade 30 days | 1048 | 12 | SA | 1154 |

### Table 10. MEM's games, version 4 against Vegas

MEM's chance in each of its 2026-27 games before tip-off: version 4's, the loosest pull's of table 7 (n0 24, fade 30 days), and Vegas's. The market is a reference: if it had moved on MEM faster than the model, its chances would run above version 4's as the games went on.

| Game | Version 4 | Pull n0 24, fade 30 days | Vegas | MEM margin |
| --- | --- | --- | --- | --- |
| 2026-10-22 UTAH at MEM | 49.7% | 49.7% | 53.2% | 20 |
| 2026-10-24 MEM at GS | 48.3% | 50.9% | 40.7% | 3 |
| 2026-10-26 MEM at SAC | 62.5% | 65.8% | 61.6% | 11 |
| 2026-10-27 MEM at UTAH | 42.2% | 47.6% | 50.4% | 5 |
| 2026-10-30 MEM at POR | 33.1% | 33.9% |  | 21 |
| 2026-11-01 SAC at MEM | 75.2% | 80.7% |  | 31 |
<!-- tables:end -->
