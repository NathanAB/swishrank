# The rating model, version 3

Version 3 changes two things in the model in `docs/model-v2.md`:

- The home edge follows the last three seasons instead of staying at 0.622.
- A game's chance drops the players that morning's injury report lists as out.

This file holds the plan version 3 is confirmed by, written before any confirmation game is played, then the results. Where this plan says "as in version 2", the definition in `docs/model-v2.md`'s pre-registration applies unchanged. The site runs version 2 until this plan's confirmation says otherwise or the owner switches it.

## Pre-registration

Written on 2026-10-31, after the investigation described below and before any 2026-27 game on or after 2026-11-01 was played. The backtest prints the SHA-256 of this section, from the line after its heading to the line before the next `## ` heading, as in versions 1 and 2. The hash at writing is recorded under Results.

### What came before this plan

On 2026-10-31 the site's ratings were compared with six published power rankings and with ratings fitted to DraftKings' pre-game lines on 88 2026-27 games. Most of the gaps were writers reacting to five or six games, and there the market sided with version 2. Two gaps pointed at the model.

- **Home court.** Version 2's fixed edge, 0.622 margin units, makes an even home side a 58.2% favourite. That fit 2015-16 to 2018-19, when home sides won 58.3% to 59.5%. On 2023-24 to 2025-26 version 2's mean home chance was 57.2% while home sides won 54.9%, and Vegas's mean home chance was 55.2% to 56.0%. The market's 2026-27 lines put the edge at 41 to 45 Elo points against version 2's 61. A home edge set each season to the mean counted home margin of the three seasons before it, without the back-to-back adjustment below, scored +0.0003 [-0.0003, +0.0008] against version 2 on the tuning seasons and -0.0008 [-0.0016, -0.0000] on 2023-24 to 2025-26. With the back-to-back term taken out, as this plan defines it, it scored +0.0001 [-0.0004, +0.0006] on the tuning seasons and -0.0009 [-0.0018, -0.0001] on 2023-24 to 2025-26, against version 2 with its SIGMA refitted the same way, with SIGMA 3.008 and early widening 1.15. It reads 0.459 for 2026-27, 45 Elo points. A fixed edge of 0.45 or 0.50 scored -0.0014 and -0.0012 on 2023-24 to 2025-26, but a value picked from those seasons cannot be confirmed by them, so this plan fixes the rule and no value.
- **Injuries.** A game's chance comes from the players in each team's previous game, so an absence counts one game after the market knows of it. Version 2's table 8 puts the lineup known at tip at -0.0045 on the tuning seasons and -0.0069 on the exploration seasons. ESPN's injury report has been archived each morning only since 2026-10-28, so no past season can score a report-based lineup and this plan fixes the rule untested. Its gain should be well below that ceiling: of the 218 entries marked out on 2026-10-29 to 2026-10-31's usable reports, 2 named a player in his team's previous lineup, because a long absence already left the previous game's lineup. The rule catches a new absence between two games, such as POR's Ja Morant on 2026-10-31.

The investigation also tested, on the tuning seasons, centring the player part on each team's opening lineup, scaling the seed, a player weight of 0.05, rookie starting levels by draft slot, rookie box ratings that start from 200 replacement-level minutes instead of 400, and newcomers starting at the previous season's 20th percentile of Game Score. Each tied version 2 or was worse, and none is in this plan.

What the investigation saw of 2026-27: the games through 2026-10-30, their results, Vegas's lines for them, and the injury reports archived through 2026-10-31. None of those games is a confirmation game.

### Data and split

- Games, box scores, preseason win totals and Vegas lines as in version 2.
- Injury reports: `src/data/injuries/<season>.json`, the first report the fetch saved each US Eastern day. A day's report counts only if it was fetched before that day's first tip-off, as `beforeTip` in `src/lib/injuries.ts` defines it.
- Tuning seasons: 2015-16 to 2022-23. Exploration seasons: 2023-24 to 2025-26, reported, never used to confirm.
- Confirmation games: every final 2026-27 game on a US Eastern day from 2026-11-01 to the season's last game, play-in and playoffs included.

### Score

As in version 2: log loss, with Brier score and accuracy reported and never used to judge. Days and two-week windows count from the season's first game day.

### The baseline

Version 2 as the site runs it: `src/lib/elo.ts` `PARAMS` and `EARLY`, each game priced with the lineups of the teams' previous games.

### The model

Version 2 with two changes, and nothing else changed.

- **Home edge.** A season's home edge, in margin units, is the mean over the final, non-neutral games of the three seasons before it in `src/data/games/` of `counted(home margin) - b2b`, where `b2b` is version 2's back-to-back term for that game. A season with fewer seasons before it uses those it has, and the first season uses 0.622. It replaces the fixed 0.622 everywhere version 2 uses it: in the fit, where it is taken out of every margin, and in every game's expected margin. `trailingHomeEdges` in `src/lib/home.ts` computes it.
- **Lineup for a prediction.** Version 2's lineup, the players of the team's previous game with expected minutes of at least 10, less every player that day's report lists for that team with the status "Out". The rest keep their ratio and are scaled back to 240 minutes, so a dropped player's minutes go to the rest of the lineup, as version 2's do when a player misses the previous game, and dropping a player rated below his teammates raises his team. A day without a report fetched before its first tip-off uses version 2's lineup. A report's "Day-To-Day" entries change nothing. `reportLineups` in `src/lib/report-lineup.ts` computes it. On seasons before 2026-27, which have no reports, it is version 2's lineup.
- **SIGMA and early widening.** Fitted by maximum likelihood on the tuning seasons, as in version 2, with the new home edge. The lineup change has no history to fit them on, so it uses them as they are.
- **Everything else.** As in version 2: margins, team seed and its strength, back-to-back, players, the fit and the chance. The shown rating, the provisional threshold of 8 games and the Elo scale's formula are unchanged.

### Uncertainty and constraint

As in version 2: the weekly block bootstrap, 2000 resamples, seed 20261025, and two-week windows, judging only a window whose games sit in more than two (season, week) blocks.

### Eligibility

Version 3 goes to the confirmation only if, on the tuning seasons, it is worse than version 2 in no judged two-week window. Otherwise the site keeps version 2 and the confirmation is not run.

### Confirmation

Run once, after the last 2026-27 game.

- Score version 3 against version 2 on the confirmation games: the pooled log loss difference with its interval, and the window constraint.
- Version 3 goes on the site when its pooled log loss on the confirmation games is below version 2's and it is worse in no judged window. Otherwise the site keeps version 2.
- If version 2's own confirmation returns the site to version 1, version 3 does not go on. It was not tested on version 1.
- The owner may switch the site to version 3 before 2026-27 ends. The confirmation runs either way.

### Reported, not used to judge

- Each change alone on the confirmation games: the home edge with version 2's lineups, and the report lineups with version 2's home edge, SIGMA and widening.
- Version 3, version 2 and Vegas on the same games: tuning, exploration and confirmation.
- How many confirmation games had a report fetched before tip-off, how many lineups it changed, and how many players it dropped.
- Each season's home edge and the games it came from.

## Results

Generated by `npm run backtest:v3`, which rewrites the text between the markers below.

The pre-registration's SHA-256 when it was written: `17b8b3af487f5760e1392a2359768360d4dadb2a641e5f8ed6362a523093caac`.

<!-- results:start -->
Pre-registration SHA-256 now: `17b8b3af487f5760e1392a2359768360d4dadb2a641e5f8ed6362a523093caac`, unchanged since it was written. Bootstrap: 2000 resamples of whole weeks, seed 20261025. Version 3's SIGMA 3.008, early widening 1.15.

### Table 1. Each season's home edge

The mean of counted(home margin) less the back-to-back term over the final, non-neutral games of the three seasons before it, in margin units and in Elo points at version 3's SIGMA. Version 2 uses 0.622 every season.

| Season | Home edge | Elo points | Games | From |
| --- | --- | --- | --- | --- |
| 2015-16 | 0.622 | 61.1 | 0 | none, 0.622 |
| 2016-17 | 0.746 | 73.3 | 1314 | 2015-16 |
| 2017-18 | 0.724 | 71.1 | 2620 | 2015-16, 2016-17 |
| 2018-19 | 0.696 | 68.4 | 3929 | 2015-16, 2016-17, 2017-18 |
| 2019-20 | 0.687 | 67.5 | 3924 | 2016-17, 2017-18, 2018-19 |
| 2020-21 | 0.625 | 61.4 | 3586 | 2017-18, 2018-19, 2019-20 |
| 2021-22 | 0.526 | 51.7 | 3448 | 2018-19, 2019-20, 2020-21 |
| 2022-23 | 0.416 | 40.9 | 3462 | 2019-20, 2020-21, 2021-22 |
| 2023-24 | 0.490 | 48.1 | 3813 | 2020-21, 2021-22, 2022-23 |
| 2024-25 | 0.523 | 51.4 | 3956 | 2021-22, 2022-23, 2023-24 |
| 2025-26 | 0.531 | 52.2 | 3948 | 2022-23, 2023-24, 2024-25 |
| 2026-27 | 0.459 | 45.2 | 3945 | 2023-24, 2024-25, 2025-26 |

### Table 2. Version 3 on the tuning and exploration seasons

Before 2026-27 no season has an injury report, so on these seasons version 3 differs from version 2 only in its home edge. SIGMA and the early widening are version 3's own, fitted by maximum likelihood on the tuning seasons. The exploration seasons informed the plan and confirm nothing.

| Seasons | Games | Version 2 log loss | Version 3 log loss | Version 3 - version 2 [95%] | Verdict | Brier, version 3 | Accuracy, version 3 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tuning, 2015-16 to 2022-23 | 10206 | 0.6156 | 0.6157 | +0.0001 [-0.0004, +0.0006] | tie | 0.2136 | 66.3% |
| Exploration, 2023-24 to 2025-26 | 3962 | 0.6014 | 0.6005 | -0.0009 [-0.0018, -0.0001] | better | 0.2072 | 67.4% |

### Table 3. Eligibility: two-week windows, tuning seasons pooled

Window w holds days 14w to 14w + 13 of each season. A window of two or fewer (season, week) blocks is not judged. Version 3 is worse in no judged window, so it goes to the confirmation.

| Window | Days | Games | Blocks | Version 2 log loss | Version 3 log loss | Version 3 - version 2 [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0-13 | 799 | 16 | 0.6402 | 0.6403 | +0.0001 [-0.0016, +0.0027] | tie |
| 1 | 14-27 | 823 | 16 | 0.6144 | 0.6150 | +0.0006 [-0.0006, +0.0021] | tie |
| 2 | 28-41 | 817 | 16 | 0.6115 | 0.6129 | +0.0014 [-0.0004, +0.0031] | tie |
| 3 | 42-55 | 818 | 16 | 0.6078 | 0.6087 | +0.0008 [-0.0011, +0.0033] | tie |
| 4 | 56-69 | 781 | 16 | 0.6388 | 0.6377 | -0.0012 [-0.0026, -0.0001] | better |
| 5 | 70-83 | 789 | 16 | 0.6058 | 0.6064 | +0.0006 [-0.0013, +0.0032] | tie |
| 6 | 84-97 | 825 | 16 | 0.6267 | 0.6271 | +0.0005 [-0.0011, +0.0020] | tie |
| 7 | 98-111 | 794 | 16 | 0.5982 | 0.5984 | +0.0003 [-0.0009, +0.0016] | tie |
| 8 | 112-125 | 600 | 16 | 0.5956 | 0.5952 | -0.0004 [-0.0021, +0.0013] | tie |
| 9 | 126-139 | 792 | 16 | 0.6260 | 0.6260 | -0.0000 [-0.0020, +0.0019] | tie |
| 10 | 140-153 | 704 | 15 | 0.5828 | 0.5815 | -0.0012 [-0.0020, -0.0005] | better |
| 11 | 154-167 | 651 | 14 | 0.6094 | 0.6094 | -0.0000 [-0.0013, +0.0012] | tie |
| 12 | 168-181 | 431 | 14 | 0.6119 | 0.6114 | -0.0006 [-0.0025, +0.0013] | tie |
| 13 | 182-195 | 212 | 14 | 0.6162 | 0.6149 | -0.0014 [-0.0079, +0.0054] | tie |
| 14 | 196-209 | 111 | 14 | 0.6389 | 0.6457 | +0.0068 [-0.0004, +0.0141] | tie |
| 15 | 210-223 | 58 | 13 | 0.6336 | 0.6250 | -0.0086 [-0.0156, -0.0029] | better |
| 16 | 224-237 | 27 | 11 | 0.6785 | 0.6768 | -0.0017 [-0.0102, +0.0070] | tie |
| 17 | 238-251 | 2 | 2 | 0.8758 | 0.8714 | -0.0044 [-0.0321, +0.0233] | tie, two blocks, not judged |
| 20 | 280-293 | 66 | 2 | 0.6956 | 0.6955 | -0.0001 [-0.0001, +0.0001] | tie, two blocks, not judged |
| 21 | 294-307 | 55 | 2 | 0.6650 | 0.6648 | -0.0001 [-0.0005, +0.0002] | tie, two blocks, not judged |
| 22 | 308-321 | 24 | 2 | 0.6792 | 0.6793 | +0.0000 [-0.0001, +0.0002] | tie, two blocks, not judged |
| 23 | 322-335 | 15 | 2 | 0.7236 | 0.7234 | -0.0002 [-0.0003, -0.0002] | better, two blocks, not judged |
| 24 | 336-349 | 9 | 2 | 0.7191 | 0.7189 | -0.0002 [-0.0002, -0.0002] | better, two blocks, not judged |
| 25 | 350-363 | 3 | 1 | 0.6223 | 0.6224 | +0.0001 [+0.0001, +0.0001] | worse, one block, not judged |

### Table 4. Version 3, version 2 and Vegas on the same games

Every game with a Vegas line, as in version 2. Vegas is reported, never used to judge.

| Seasons | Games | Vegas log loss | Version 2 log loss | Version 3 log loss | Version 3 - version 2 [95%] | Version 3 - Vegas [95%] |
| --- | --- | --- | --- | --- | --- | --- |
| Tuning, 2015-16 to 2022-23 | 10162 | 0.6028 | 0.6157 | 0.6157 | +0.0001 [-0.0004, +0.0006] | +0.0129 [+0.0093, +0.0165] |
| Exploration, 2023-24 to 2025-26 | 3962 | 0.5819 | 0.6014 | 0.6005 | -0.0009 [-0.0018, -0.0001] | +0.0186 [+0.0133, +0.0236] |
| Confirmation, 2026-11-01 on | 0 |  |  |  |  |  |

### Table 5. The injury report on the confirmation games

Days with a saved report: 4, 3 of them fetched before the day's first tip-off. A game uses its day's report only then.

| Confirmation games so far | With a report fetched before tip-off | Games with a lineup changed | Team lineups changed | Players dropped |
| --- | --- | --- | --- | --- |
| 0 | 0 | 0 | 0 | 0 |

### Table 6. Confirmation, 2026-27 from 2026-11-01

Logged only: the confirmation judges once, after the season's last game. Each piece alone is reported, never used to judge.

No confirmation game has been played.

### Check

src/lib/v3.ts V3 matches the plan's fit, `{"home":{"seasons":3,"fallback":0.622},"out":["Out"],"sigma":3.008,"widen":1.15}`.
<!-- results:end -->
