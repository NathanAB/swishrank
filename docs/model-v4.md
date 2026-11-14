# The rating model, version 4

Version 4 changes how the model in `docs/model-v3.md` reads who will play. A game is priced from the NBA's official injury report, the latest saved before its tip-off, read with its every status. A team missing players counts their minutes below the rest of its lineup. A rookie drafted in the top three starts from the box rating top-three picks have played at.

This file holds the plan version 4 is confirmed by, written before its confirmation season begins. Where it says "as in version 3", the definition in `docs/model-v3.md`'s pre-registration applies unchanged. The site ran version 3 until the owner switched it to version 4 on 2026-11-02, before the confirmation season, as The switch below records.

On 2026-11-13 the owner retired this plan's confirmation as a gate (`docs/adr/0002-versions-are-judged-on-past-seasons.md`). A version is now accepted on past seasons its settings never saw, because one future season's games cannot tell a 0.002 gain in log loss from luck. The Confirmation section below stays as written, because the hash under Results covers its text, but its rule no longer decides anything. `npm run backtest:v4` keeps logging 2026-27's games in table 4 and the 2027-28 confirmation games in table 5 as a running record, and no result there keeps or switches the site's model.

## Pre-registration

Written on 2026-11-01, during 2026-27 and before 2027-28, its confirmation season. It replaces a plan written earlier the same day that changed only a top-three pick's starting level, whose hash is recorded under Results; no confirmation game had been played. `npm run backtest:v4` prints the SHA-256 of this section, from the line after its heading to the line before the next `## ` heading, as in versions 1 to 3. The hash at writing is recorded under Results.

### What came before this plan

On 2026-11-01 the investigation scored about 60 changes to version 3 on the tuning seasons. It began by setting version 3's misses against what it does not read. Rest beyond the back-to-back, three games in four nights, travel, time zones, road-trip length, altitude, a playoff home edge, a home edge from two or five seasons, the seed's scale, seeds net of what the players explain, weighting recent games within a season, carrying a player's results into the next season, box-score weights fitted to margins, the box rating's starting minutes and level, an age term, overtime margins counted as ties, a separate playoff SIGMA, a logistic curve, blending in the plain Elo, and five rookie options all tied version 3 or did worse. Counting margins as √|m| instead of √(|m| + 3) scored -0.0003 on the tuning seasons and -0.0001 on 2023-24 to 2025-26, and is not in this plan. Strong teams fell short of the model in the last two weeks of a season, by -0.0005 to -0.0007 on the tuning seasons and 0 on 2023-24 to 2025-26, after the league's 2023 rules on resting players, and that is not in this plan either.

Who plays was the one place with room. Pricing each game with the players who in fact played, at their usual minutes, scored -0.0044 on the tuning seasons and -0.0072 on 2023-24 to 2025-26 against version 3 without a report. Version 3 reads ESPN's injury list, saved once a day at about 3 AM Eastern. That list marks a player "Out" or "Day-To-Day" and nothing else, and no season before 2026-27 has it on file.

The NBA publishes its own report through each game day, on the hour until 2025-26 and every quarter-hour since, and keeps every one at a fixed address from 2019-20 on. Its statuses are Out, Doubtful, Questionable, Probable and Available. Among players of a team's previous game with 10 or more expected minutes, on the reports from about two hours before tip-off, 2019-20 to 2025-26, those listed Out played that night 0% to 1% of the time, Doubtful 0% to 5%, Questionable 45% to 60%, Probable 93% to 97%, and those not listed 96% to 97%. Version 3's rule, the previous game's lineup less the players listed Out, read from those reports scored -0.0028 on 2019-20 to 2022-23 and -0.0029 on 2023-24 to 2025-26. The same rule read from the first report after 11 AM did worse by +0.0013 and +0.0015. The report's last hours carry about half its worth, and version 3's 3 AM list misses them.

Against version 3's rule on the reports from about two hours before tip-off, 2019-20 to 2022-23 and then 2023-24 to 2025-26, in log loss, the investigation scored each part of this plan, adding one at a time:

| Added | 2019-20 to 2022-23 | 2023-24 to 2025-26 |
| --- | --- | --- |
| A missing player's minutes valued 0.3 margin units per 48 below the rest of his team's lineup | -0.0011 | -0.0015 |
| Doubtful players out, Questionable players at half their minutes | -0.0022 | -0.0022 |
| A player who missed the previous game back when the report lists him as available | -0.0023 | -0.0027 |
| Expected minutes from a player's last 5 appearances instead of 10 | -0.0025 | -0.0034 |

Every season from 2019-20 to 2025-26 scored better with all four, by -0.0012 to -0.0048. The values were chosen with both groups of seasons in view, and on 2019-20 to 2022-23 each is the best of those tried or within 0.0002 of it. The fill-in value scored -0.0009, -0.0011 and -0.0011 at -0.2, -0.3 and -0.5. Bringing back every player who missed the previous game, listed or not, did worse than bringing back none, -0.0026 against -0.0030 on 2019-20 to 2022-23, so this plan brings back only players the report lists. Those numbers are the investigation's; `npm run backtest:v4` scores this plan's own definitions under Results.

On 2026-10-30 version 3 valued WSH's AJ Dybantsa, the 2026 draft's first pick, at -24 Elo points per 48 minutes after two games, below the league's average player, while he scored 19 and 17 points. Every player with no appearances starts at a box rating of 8.49 per 36 minutes, 5.5 below the league's mean in 2025-26. Over 2016-17 to 2022-23, rookies drafted first to third played their first 500 minutes at 0.28 per 36 above the league's minutes-weighted mean, and later picks 3.07 to 3.90 below it. Starting the top three at that level tied version 3 on every group of seasons and games tried. It is in this plan so the site does not value the top of each draft as replacement-level players, at no cost in accuracy.

Moving each team's rating only on its own game days tied version 3 exactly, -0.0000 [-0.0001, +0.0000] on the tuning seasons and +0.0000 [-0.0001, +0.0001] on 2023-24 to 2025-26. The site has run it since 2026-11-01, so it is part of the baseline and of version 4 alike, and this plan does not test it. Counting each game's opponent as it stood before the game, so a past opponent's later results never reach a team, tied version 3 too, -0.0001 [-0.0002, +0.0001] on the tuning seasons and -0.0002 [-0.0004, +0.0001] on 2023-24 to 2025-26. The site has run it since 2026-11-05, and it is part of both alike in the same way.

What the investigation saw of 2026-27: the games through 2026-10-31, their results, Vegas's lines for them, and ESPN's reports. No NBA report from 2026-27 was read.

### Data and split

- Games, box scores, preseason win totals, Vegas lines and ESPN's injury reports as in version 3.
- The NBA's reports: `src/data/nba-reports/<season>.json`, each final game's report, with each listed player's status by ESPN athlete id. A name is matched among the players with a box line for the team that season, by `nameMatcher` in `src/lib/nba-report.ts`; a name it cannot match changes nothing. For 2019-20 to 2025-26, `scripts/nba-report-history.ts` took each game's report from the league's archive: the latest published on the hour at least 90 minutes before tip-off, Eastern time, no later than 5 PM and no earlier than 11 AM, or before 2021-22, when the league published at 1, 5 and 8 PM, the latest of those at or before that hour. A game before 12:30 PM has none. From 2026-27 on, `scripts/fetch-nba-report.ts` saves the latest report several times each game day, and a game keeps the latest saved before its tip-off (`withNbaReport`).
- Each player's draft: `src/data/draft.json`, from ESPN's athlete pages.
- Tuning seasons: 2015-16 to 2022-23; the NBA's reports cover 2019-20 to 2022-23 of them. Exploration seasons: 2023-24 to 2025-26, reported, never used to confirm. 2026-27: logged.
- Confirmation games: every final 2027-28 game, play-in and playoffs included.

### Score

As in version 3: log loss, with Brier score and accuracy reported and never used to judge.

### The baseline

Version 3 as the site runs it: `src/lib/elo.ts` `PARAMS` and `EARLY`, each game priced with the lineups of the teams' previous games less ESPN's "Out", from the report saved before the day's first tip-off, and, since 2026-11-01, each team's rating moving only on its own game days and, since 2026-11-05, each game counting each side against the other as it stood before the game (`docs/model-v3.md`, The switch).

### The model

Version 3 with these changes, and nothing else changed. `availability` and `topThreeStart` in `src/lib/v4.ts` compute them, with the settings in its `V4`.

- **Expected minutes.** A player's expected minutes are the mean of his last 5 appearances on any team, instead of 10, everywhere a lineup reads them for a prediction.
- **Lineup for a prediction, a side the NBA's report covers.** A side is covered when the game's report lists its team as submitted. It starts from the players of the team's previous game. Those listed Out or Doubtful leave. Any player who missed that game, played for the team in one of its last 10 games, has not played for another team since, and is listed Available, Probable or Questionable comes back. Each keeps his expected minutes when they are at least 10, a Questionable player half of them, and they are scaled to 240.
- **Missing minutes.** A covered side's missing minutes are the expected minutes of its previous game's players the report takes out, and half of each Questionable one's, over the expected minutes of that game's whole lineup, times 5: a share of 48 minutes. A game's expected home margin gains -0.3 times the home side's missing minutes less the away side's. Like the back-to-back term, it is taken out of the game's margin in every fit.
- **Lineup for a prediction, a side the report does not cover.** Version 3's: the previous game's players, less those ESPN's report lists as "Out", with 5-appearance minutes. Its missing minutes are 0.
- **A top-three rookie's starting level.** A top-three rookie is one of version 3's rookies whom `src/data/draft.json` lists as drafted in the first round with an overall pick of 1, 2 or 3, in the season's draft year or up to three before it. His box rating starts from the previous season's minutes-weighted mean Game Score per 36 minutes plus 0.28, in place of 8.49, for all 400 of its starting minutes. The level is fixed when he first appears. Every other player starts from 8.49.
- **SIGMA and early widening.** Fitted by maximum likelihood on the tuning seasons, as in version 3, with these changes.
- **Everything else.** As the site runs version 3, the shown rating included, each team's rating moving only on its own game days, and each game counting each side against the other as it stood before the game.

### Uncertainty

As in version 3: the weekly block bootstrap, 2000 resamples, seed 20261025.

### Confirmation

Run once, after the last 2027-28 game.

- Score version 4 against version 3 on the confirmation games: the pooled log loss difference with its interval.
- Version 4 goes on the site when its pooled log loss on the confirmation games is below version 3's. Otherwise the site keeps version 3.
- If version 3's own confirmation returns the site to version 2, version 4 does not go on. It was not tested on version 2.
- The owner may switch the site to version 4 before 2027-28 ends. The confirmation runs either way.

### Reported, not used to judge

- Each part: version 4 without the missing-minutes term, without the top-three start, the top-three start alone, and version 3's rule read from the NBA's report, each with its own SIGMA and widening fitted on the tuning seasons, on the tuning, exploration and confirmation games.
- Version 4, version 3 and Vegas on the same games.
- How many of each season's games the NBA's report covers, on one side or both, and how many names it could not match.
- 2026-27's games with a saved NBA report.

## Results

Generated by `npm run backtest:v4`, which rewrites the text between the markers below.

The plan this one replaced, written earlier on 2026-11-01: `25165e9ba9957633058fcc14645495bb76206e44f62417edc8162ce1a5244f99`. This plan when written: `9cd3057edc4818383e1bf6d0e0885abe39dbdc2d40a4b805dec35704b0097062`. As amended on 2026-11-01, when the site began moving each team's rating only on its own game days, before any confirmation game: `cf8d8da90813f602c24fd5530ba3a8920fa484bfcb272f78a91a58b4aebb7ce2`. As amended on 2026-11-05, when each game began counting each side against the other as it stood before the game, before any confirmation game: `90f4dd33b78b01a496c2274c7c13b76ae3732edc8e71fe8df96649996c04641c`.

<!-- results:start -->
Pre-registration SHA-256 now: `90f4dd33b78b01a496c2274c7c13b76ae3732edc8e71fe8df96649996c04641c`, unchanged since its amendment on 2026-11-05. Bootstrap: 2000 resamples of whole weeks, seed 20261025. Version 4's SIGMA 2.986 (99.0 Elo points per margin unit), early widening 1.14; version 3's 3.037 and 1.14. Version 3's log loss on the tuning seasons: 0.6154.

### Table 1. The NBA's reports on file

Each final game's report and how many of its sides it covers; a side is uncovered when the report does not list the team or lists it as not yet submitted. Unmatched names are entries the fetch could not match to a player with a box line for the team that season, nearly all players out for the whole season.

| Season | Final games | Both sides | One side | Neither | Unmatched names |
| --- | --- | --- | --- | --- | --- |
| 2019-20 | 1143 | 1088 | 53 | 2 | 933 |
| 2020-21 | 1171 | 1104 | 64 | 3 | 389 |
| 2021-22 | 1323 | 1295 | 28 | 0 | 1398 |
| 2022-23 | 1320 | 1273 | 45 | 2 | 669 |
| 2023-24 | 1319 | 1264 | 54 | 1 | 796 |
| 2024-25 | 1321 | 1278 | 42 | 1 | 850 |
| 2025-26 | 1322 | 1276 | 43 | 3 | 1076 |
| 2026-27 | 123 | 34 | 1 | 88 | 136 |

### Table 2. Version 4 and its parts against version 3

Version 3 as the site runs it, with its SIGMA and early widening; before 2026-27 it has no injury report, so it prices every game with the previous game's lineup. Version 4 and each part have their own SIGMA and widening, fitted on the tuning seasons. Only the tuning seasons judge; 2019-20 to 2022-23 are the tuning seasons with reports, and the exploration seasons informed the plan and confirm nothing.

| Model | Seasons | Games | Version 3 log loss | Log loss | Minus version 3 [95%] | Verdict | Brier | Accuracy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Version 4 | Tuning, 2015-16 to 2022-23 | 10206 | 0.6154 | 0.6127 | -0.0027 [-0.0041, -0.0014] | better | 0.2123 | 66.3% |
| Version 4 | Tuning with reports, 2019-20 to 2022-23 | 4957 | 0.6292 | 0.6241 | -0.0052 [-0.0077, -0.0025] | better | 0.2174 | 65.2% |
| Version 4 | Exploration, 2023-24 to 2025-26 | 3962 | 0.5995 | 0.5930 | -0.0065 [-0.0093, -0.0038] | better | 0.2042 | 67.2% |
| Without the fill-in term | Tuning, 2015-16 to 2022-23 | 10206 | 0.6154 | 0.6135 | -0.0019 [-0.0029, -0.0010] | better | 0.2126 | 66.3% |
| Without the fill-in term | Tuning with reports, 2019-20 to 2022-23 | 4957 | 0.6292 | 0.6257 | -0.0036 [-0.0053, -0.0017] | better | 0.2180 | 65.2% |
| Without the fill-in term | Exploration, 2023-24 to 2025-26 | 3962 | 0.5995 | 0.5948 | -0.0047 [-0.0067, -0.0028] | better | 0.2049 | 67.4% |
| Without the top-three start | Tuning, 2015-16 to 2022-23 | 10206 | 0.6154 | 0.6127 | -0.0026 [-0.0041, -0.0014] | better | 0.2123 | 66.4% |
| Without the top-three start | Tuning with reports, 2019-20 to 2022-23 | 4957 | 0.6292 | 0.6240 | -0.0052 [-0.0077, -0.0027] | better | 0.2174 | 65.3% |
| Without the top-three start | Exploration, 2023-24 to 2025-26 | 3962 | 0.5995 | 0.5932 | -0.0063 [-0.0090, -0.0036] | better | 0.2043 | 67.3% |
| Top-three start alone | Tuning, 2015-16 to 2022-23 | 10206 | 0.6154 | 0.6153 | -0.0000 [-0.0002, +0.0001] | tie | 0.2134 | 66.5% |
| Top-three start alone | Tuning with reports, 2019-20 to 2022-23 | 4957 | 0.6292 | 0.6293 | +0.0000 [-0.0002, +0.0003] | tie | 0.2195 | 65.1% |
| Top-three start alone | Exploration, 2023-24 to 2025-26 | 3962 | 0.5995 | 0.5993 | -0.0001 [-0.0004, +0.0001] | tie | 0.2068 | 67.3% |
| Version 3's "Out" rule on the NBA's report | Tuning, 2015-16 to 2022-23 | 10206 | 0.6154 | 0.6140 | -0.0014 [-0.0021, -0.0008] | better | 0.2128 | 66.6% |
| Version 3's "Out" rule on the NBA's report | Tuning with reports, 2019-20 to 2022-23 | 4957 | 0.6292 | 0.6265 | -0.0028 [-0.0040, -0.0015] | better | 0.2183 | 65.5% |
| Version 3's "Out" rule on the NBA's report | Exploration, 2023-24 to 2025-26 | 3962 | 0.5995 | 0.5966 | -0.0029 [-0.0044, -0.0014] | better | 0.2056 | 67.3% |

### Table 3. Version 4, version 3 and Vegas on the same games

Every game with a Vegas line. Vegas is reported, never used to judge.

| Seasons | Games | Vegas log loss | Version 3 log loss | Version 4 log loss | Version 3 - Vegas [95%] | Version 4 - Vegas [95%] |
| --- | --- | --- | --- | --- | --- | --- |
| Tuning, 2015-16 to 2022-23 | 10162 | 0.6028 | 0.6154 | 0.6127 | +0.0125 [+0.0090, +0.0162] | +0.0098 [+0.0068, +0.0130] |
| Tuning with reports, 2019-20 to 2022-23 | 4957 | 0.6158 | 0.6292 | 0.6241 | +0.0135 [+0.0084, +0.0186] | +0.0083 [+0.0043, +0.0124] |
| Exploration, 2023-24 to 2025-26 | 3962 | 0.5819 | 0.5995 | 0.5930 | +0.0176 [+0.0121, +0.0227] | +0.0111 [+0.0062, +0.0156] |

### Table 4. 2026-27, logged

The live fetch began saving the NBA's report before each tip-off during 2026-27, so its games since then are scored here, never used to judge: version 3 had ESPN's morning report, version 4 the NBA's.

| Games with an NBA report | Version 3 log loss | Version 4 log loss | Minus version 3 [95%] |
| --- | --- | --- | --- |
| 35 | 0.5987 | 0.5961 | -0.0026 [-0.0087, +0.0046] |

### Table 5. Confirmation, 2027-28

Logged only, as a running record. Since 2026-11-13 no result on these games keeps or switches the site's model (`docs/adr/0002-versions-are-judged-on-past-seasons.md`). Each part is logged beside version 4.

No confirmation game has been played.

### Check

src/lib/v4.ts V4 matches the plan's fit, `{"sigma":2.986,"widen":1.14}`.
<!-- results:end -->

## The switch

On 2026-11-02 the owner switched the site to version 4, as the plan allows; the confirmation runs either way. `src/lib/elo.ts` holds version 4's SIGMA and early widening in `PARAMS` and `EARLY`, and `modelInputs` in `src/lib/inputs.ts` gives each season its box ratings with the top-three start and each game its lineups and extra term from `availability()`, as `scripts/backtest-v4.ts` defines them. Version 3, the baseline, is frozen as `V3` in `src/lib/v3.ts` with the settings `src/lib/elo.ts` held until then, and the backtest builds version 3's lineups and box ratings itself, so its tables do not move with the site. A game still to come is priced by the same rule as a played one, from where its teams' last games leave them: a side the latest saved report covers starts from its team's last game's players, read with the report's statuses, and adds the fill term; a side it does not cover takes version 3's next lineup, the players of its team's last game, at their minutes over 5 appearances, less those ESPN's latest report lists as out. So each game to come has its own chance, where version 3 priced every game a team had left with one lineup. Each report `.github/workflows/nba-report.yml` saves now starts the deploy, so the site reads it before tip-off instead of the next morning.

On 2026-11-06 the owner added one rule to the site beyond this plan, after Jayson Tatum was left out of BOS's lineup for its game at CHA: he missed the previous game and, healthy, was not on the report. A player the report does not list now comes back if he missed only the team's previous game, played at least 25 minutes in the game before it, and expects at least 25 minutes (`SITE_RULE` in `src/lib/v4.ts`, which `modelInputs` passes to `availability()`). The backtest does not pass it. Both minute checks are needed: expected minutes alone brought back a player who had played 2 minutes for his team because his last 5 appearances reached into another team's games, and the game's minutes alone lowered how often those players played to 81%. Such players played that night about 90% of the time: 675 of 746 on 2019-20 to 2022-23 and 586 of 633 on 2023-24 to 2025-26. Against version 4, both at the site's SIGMA and early widening, the rule scored -0.0008 [-0.0016, +0.0001] on 2019-20 to 2022-23, +0.0006 [-0.0002, +0.0013] on 2023-24 to 2025-26, and -0.0002 [-0.0008, +0.0004] on all seven seasons, by the weekly block bootstrap. It ties version 4 on log loss and is here so that a game's lineup does not leave out a regular who is expected to play. A side the report does not cover yet still takes version 3's lineup, so such a player joins it when the report arrives and that game's chance can move then. `availability()`'s default stays this plan's rule, so `npm run backtest:v4` and the confirmation still score version 4 as written. This plan's finding that bringing back every unlisted player does worse still holds: that broad rule scored +0.0003 and +0.0010 on the same two groups.
