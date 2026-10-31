# The rating model, version 3

Version 3 changes three things in the model in `docs/model-v2.md`:

- The home edge follows the last three seasons instead of staying at 0.622.
- A game's chance drops the players that morning's injury report lists as out.
- A rookie's value is held near his box rating with 40 games instead of 320, so his results move him sooner.

This file holds the plan version 3 is confirmed by, written before any confirmation game is played, then the results. Where this plan says "as in version 2", the definition in `docs/model-v2.md`'s pre-registration applies unchanged. The site runs version 2 until this plan's confirmation says otherwise or the owner switches it.

## Pre-registration

Written on 2026-10-31, after the investigation described below and before any 2026-27 game on or after 2026-11-01 was played. Amended twice the same day, both times before any confirmation game was played: first to add the rookie hold and to judge by pooled log loss alone, without versions 1 and 2's two-week window rule; then, when switching the site showed that CHI's and NO's veterans counted as rookies in 2018-19, to leave players new only to the files out of the rookies. The earlier versions are in the repository's history, and every hash is recorded under Results. The backtest prints the SHA-256 of this section, from the line after its heading to the line before the next `## ` heading, as in versions 1 and 2. The hash at writing is recorded under Results.

### What came before this plan

On 2026-10-31 the site's ratings were compared with six published power rankings and with ratings fitted to DraftKings' pre-game lines on 88 2026-27 games. Most of the gaps were writers reacting to five or six games, and there the market sided with version 2. Two gaps pointed at the model.

- **Home court.** Version 2's fixed edge, 0.622 margin units, makes an even home side a 58.2% favourite. That fit 2015-16 to 2018-19, when home sides won 58.3% to 59.5%. On 2023-24 to 2025-26 version 2's mean home chance was 57.2% while home sides won 54.9%, and Vegas's mean home chance was 55.2% to 56.0%. The market's 2026-27 lines put the edge at 41 to 45 Elo points against version 2's 61. A home edge set each season to the mean counted home margin of the three seasons before it, without the back-to-back adjustment below, scored +0.0003 [-0.0003, +0.0008] against version 2 on the tuning seasons and -0.0008 [-0.0016, -0.0000] on 2023-24 to 2025-26. With the back-to-back term taken out, as this plan defines it, it scored +0.0001 [-0.0004, +0.0006] on the tuning seasons and -0.0009 [-0.0018, -0.0001] on 2023-24 to 2025-26, against version 2 with its SIGMA refitted the same way, with SIGMA 3.008 and early widening 1.15. It reads 0.459 for 2026-27, 45 Elo points. A fixed edge of 0.45 or 0.50 scored -0.0014 and -0.0012 on 2023-24 to 2025-26, but a value picked from those seasons cannot be confirmed by them, so this plan fixes the rule and no value.
- **Injuries.** A game's chance comes from the players in each team's previous game, so an absence counts one game after the market knows of it. Version 2's table 8 puts the lineup known at tip at -0.0045 on the tuning seasons and -0.0069 on the exploration seasons. ESPN's injury report has been archived each morning only since 2026-10-28, so no past season can score a report-based lineup and this plan fixes the rule untested. Its gain should be well below that ceiling: of the 218 entries marked out on 2026-10-29 to 2026-10-31's usable reports, 2 named a player in his team's previous lineup, because a long absence already left the previous game's lineup. The rule catches a new absence between two games, such as POR's Ja Morant on 2026-10-31.
- **Rookies.** A player with no history starts at a box rating of 8.49 per 36 minutes, about the 6th percentile of players with 500 minutes or more in 2025-26 against the 20th in 2015-16, and his value is held near `a` times that rating with 320 games, so his team's results barely move him. Box ratings that start from 50 to 300 replacement-level minutes instead of 400 tied version 2 on the tuning seasons. A weaker hold on rookies' values did not. With the hold at 160, 80, 40, 20, 10, 5 and 2 games, the tuning seasons scored -0.0001, -0.0002, -0.0003, -0.0003, +0.0000, +0.0010 and +0.0034 against version 2 refitted the same way, and 2023-24 to 2025-26 -0.0002, -0.0005, -0.0009, -0.0015, -0.0020, -0.0020 and -0.0009. That grid found rookies from ESPN's draft records. With this plan's rule, which reads only the box scores on file, the hold at 40 scored -0.0002 [-0.0006, +0.0001] on the tuning seasons, -0.0009 [-0.0015, -0.0003] on 2023-24 to 2025-26, and -0.0015 [-0.0026, -0.0004] on the games where a side gave rookies a fifth of its minutes or more, with SIGMA 3.025. 40 ties 20 on the tuning seasons with the narrower interval, and this plan fixes 40. Holding every player with fewer than 500 career minutes at 40 instead scored about the same, -0.0002 [-0.0006, +0.0003] on the tuning seasons and -0.0010 [-0.0016, -0.0003] on 2023-24 to 2025-26; this plan holds the rookies alone, the players with no history at all. A weaker hold lets a rookie's value take up his team's results: through 2026-10-30, at 40, MEM's Cameron Boozer counts +7 Elo points in his team's rating instead of -11 after a 5-0 start, and SAC's Darius Acuff Jr. -36 instead of -21 after 0-5.

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

Version 2 with three changes, and nothing else changed.

- **Home edge.** A season's home edge, in margin units, is the mean over the final, non-neutral games of the three seasons before it in `src/data/games/` of `counted(home margin) - b2b`, where `b2b` is version 2's back-to-back term for that game. A season with fewer seasons before it uses those it has, and the first season uses 0.622. It replaces the fixed 0.622 everywhere version 2 uses it: in the fit, where it is taken out of every margin, and in every game's expected margin. `trailingHomeEdges` in `src/lib/home.ts` computes it.
- **Lineup for a prediction.** Version 2's lineup, the players of the team's previous game with expected minutes of at least 10, less every player that day's report lists for that team with the status "Out". The rest keep their ratio and are scaled back to 240 minutes, so a dropped player's minutes go to the rest of the lineup, as version 2's do when a player misses the previous game, and dropping a player rated below his teammates raises his team. A day without a report fetched before its first tip-off uses version 2's lineup. A report's "Day-To-Day" entries change nothing. `reportLineups` in `src/lib/report-lineup.ts` computes it. On seasons before 2026-27, which have no reports, it is version 2's lineup.
- **Rookie hold.** A rookie is a player whose first line in the box scores on file is in this season. 2015-16, the first season on file, has none. Nor is a player whose first line is for a team with player lines in fewer than half its final games the season before: ESPN has none for CHI and NO in 2015-16 to 2017-18, so their veterans, Anthony Davis among them, are new only to the files in 2018-19. In every fit of his first season a rookie's value is pulled toward `a` times his box rating with 40 games instead of version 2's 320. Every other player keeps 320, and a rookie's box rating is as in version 2. `newcomers` in `src/lib/rookies.ts` finds the rookies.
- **SIGMA and early widening.** Fitted by maximum likelihood on the tuning seasons, as in version 2, with the new home edge and the rookie hold. The lineup change has no history to fit them on, so it uses them as they are.
- **Everything else.** As in version 2: margins, team seed and its strength, back-to-back, players, the fit and the chance. The shown rating, the provisional threshold of 8 games and the Elo scale's formula are unchanged.

### Uncertainty and constraint

As in version 2: the weekly block bootstrap, 2000 resamples, seed 20261025. Two-week windows are reported and judge nothing. Versions 1 and 2 also required a new model to be worse than its baseline in no two-week window, each window judged by its own 95% interval. On the tuning seasons' 17 judged windows, a model exactly as good as its baseline, made by swapping version 2's and version 3's chances at random within each (season, week) block, fails that rule in 217 of 400 tries, 54%, because one of many windows is worse by chance and each window's interval, from 13 to 16 blocks, runs narrow (`scripts/window-rule.ts`). Version 3 as fixed here is worse in one tuning window, days 196 to 209, by +0.0073 [+0.0002, +0.0147], beside a window better by -0.0084 [-0.0152, -0.0028]. This plan judges by pooled log loss alone.

### Confirmation

Run once, after the last 2026-27 game.

- Score version 3 against version 2 on the confirmation games: the pooled log loss difference with its interval.
- Version 3 goes on the site when its pooled log loss on the confirmation games is below version 2's. Otherwise the site keeps version 2.
- If version 2's own confirmation returns the site to version 1, version 3 does not go on. It was not tested on version 1.
- The owner may switch the site to version 3 before 2026-27 ends. The confirmation runs either way.

### Reported, not used to judge

- Each change alone: the home edge, and the rookie hold, each with version 2's lineups and its own SIGMA and widening fitted on the tuning seasons, on the tuning, exploration and confirmation games; and on the confirmation games the report lineups with version 2's home edge, SIGMA and widening.
- Version 3, version 2 and Vegas on the same games: tuning, exploration and confirmation.
- How many confirmation games had a report fetched before tip-off, how many lineups it changed, and how many players it dropped.
- Each season's home edge and the games it came from.
- Two-week windows, version 3 against version 2, on the tuning and confirmation games.

## Results

Generated by `npm run backtest:v3`, which rewrites the text between the markers below.

The pre-registration's SHA-256 when first written: `17b8b3af487f5760e1392a2359768360d4dadb2a641e5f8ed6362a523093caac`. As first amended on 2026-10-31, before any confirmation game: `00dc450fffdebed71e9d946cc41305bf531833684967142b34d971d184e30b78`. As amended again the same day, still before any confirmation game: `d4996fce984e4d47137aac2e1ed0e96c6938085629d344c6073d0510e4a2af59`.

<!-- results:start -->
Pre-registration SHA-256 now: `d4996fce984e4d47137aac2e1ed0e96c6938085629d344c6073d0510e4a2af59`, unchanged since its last amendment on 2026-10-31. Bootstrap: 2000 resamples of whole weeks, seed 20261025. Version 3's SIGMA 3.037, early widening 1.14.

### Table 1. Each season's home edge

The mean of counted(home margin) less the back-to-back term over the final, non-neutral games of the three seasons before it, in margin units and in Elo points at version 3's SIGMA. Version 2 uses 0.622 every season.

| Season | Home edge | Elo points | Games | From |
| --- | --- | --- | --- | --- |
| 2015-16 | 0.622 | 60.6 | 0 | none, 0.622 |
| 2016-17 | 0.746 | 72.6 | 1314 | 2015-16 |
| 2017-18 | 0.724 | 70.5 | 2620 | 2015-16, 2016-17 |
| 2018-19 | 0.696 | 67.8 | 3929 | 2015-16, 2016-17, 2017-18 |
| 2019-20 | 0.687 | 66.9 | 3924 | 2016-17, 2017-18, 2018-19 |
| 2020-21 | 0.625 | 60.8 | 3586 | 2017-18, 2018-19, 2019-20 |
| 2021-22 | 0.526 | 51.2 | 3448 | 2018-19, 2019-20, 2020-21 |
| 2022-23 | 0.416 | 40.5 | 3462 | 2019-20, 2020-21, 2021-22 |
| 2023-24 | 0.490 | 47.7 | 3813 | 2020-21, 2021-22, 2022-23 |
| 2024-25 | 0.523 | 51.0 | 3956 | 2021-22, 2022-23, 2023-24 |
| 2025-26 | 0.531 | 51.7 | 3948 | 2022-23, 2023-24, 2024-25 |
| 2026-27 | 0.459 | 44.7 | 3945 | 2023-24, 2024-25, 2025-26 |

### Table 2. Version 3 on the tuning and exploration seasons

Before 2026-27 no season has an injury report, so on these seasons version 3 differs from version 2 in its home edge and its rookie hold. SIGMA and the early widening are version 3's own, fitted by maximum likelihood on the tuning seasons. Each change alone has its own. The exploration seasons informed the plan and confirm nothing.

| Model | Seasons | Games | Version 2 log loss | Log loss | Minus version 2 [95%] | Verdict | Brier | Accuracy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Version 3 | Tuning, 2015-16 to 2022-23 | 10206 | 0.6156 | 0.6155 | -0.0002 [-0.0007, +0.0005] | tie | 0.2134 | 66.4% |
| Version 3 | Exploration, 2023-24 to 2025-26 | 3962 | 0.6014 | 0.5996 | -0.0018 [-0.0030, -0.0007] | better | 0.2069 | 67.3% |
| Home edge alone | Tuning, 2015-16 to 2022-23 | 10206 | 0.6156 | 0.6157 | +0.0001 [-0.0004, +0.0006] | tie | 0.2136 | 66.3% |
| Home edge alone | Exploration, 2023-24 to 2025-26 | 3962 | 0.6014 | 0.6005 | -0.0009 [-0.0018, -0.0001] | better | 0.2072 | 67.4% |
| Rookie hold alone | Tuning, 2015-16 to 2022-23 | 10206 | 0.6156 | 0.6154 | -0.0002 [-0.0006, +0.0001] | tie | 0.2134 | 66.5% |
| Rookie hold alone | Exploration, 2023-24 to 2025-26 | 3962 | 0.6014 | 0.6005 | -0.0009 [-0.0015, -0.0003] | better | 0.2072 | 67.1% |

### Table 3. Two-week windows, tuning seasons pooled

Window w holds days 14w to 14w + 13 of each season. Reported, never used to judge: each window's own 95% interval would call some window worse by chance alone, as the pre-registration says.

| Window | Days | Games | Blocks | Version 2 log loss | Version 3 log loss | Version 3 - version 2 [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0-13 | 799 | 16 | 0.6402 | 0.6404 | +0.0002 [-0.0018, +0.0028] | tie |
| 1 | 14-27 | 823 | 16 | 0.6144 | 0.6145 | +0.0001 [-0.0013, +0.0015] | tie |
| 2 | 28-41 | 817 | 16 | 0.6115 | 0.6127 | +0.0012 [-0.0006, +0.0030] | tie |
| 3 | 42-55 | 818 | 16 | 0.6078 | 0.6083 | +0.0004 [-0.0020, +0.0038] | tie |
| 4 | 56-69 | 781 | 16 | 0.6388 | 0.6385 | -0.0003 [-0.0026, +0.0020] | tie |
| 5 | 70-83 | 789 | 16 | 0.6058 | 0.6055 | -0.0002 [-0.0021, +0.0020] | tie |
| 6 | 84-97 | 825 | 16 | 0.6267 | 0.6274 | +0.0007 [-0.0005, +0.0020] | tie |
| 7 | 98-111 | 794 | 16 | 0.5982 | 0.5978 | -0.0003 [-0.0019, +0.0014] | tie |
| 8 | 112-125 | 600 | 16 | 0.5956 | 0.5938 | -0.0018 [-0.0035, -0.0001] | better |
| 9 | 126-139 | 792 | 16 | 0.6260 | 0.6260 | -0.0000 [-0.0020, +0.0020] | tie |
| 10 | 140-153 | 704 | 15 | 0.5828 | 0.5818 | -0.0010 [-0.0023, +0.0002] | tie |
| 11 | 154-167 | 651 | 14 | 0.6094 | 0.6080 | -0.0014 [-0.0048, +0.0017] | tie |
| 12 | 168-181 | 431 | 14 | 0.6119 | 0.6114 | -0.0005 [-0.0037, +0.0032] | tie |
| 13 | 182-195 | 212 | 14 | 0.6162 | 0.6156 | -0.0006 [-0.0074, +0.0060] | tie |
| 14 | 196-209 | 111 | 14 | 0.6389 | 0.6462 | +0.0073 [+0.0002, +0.0147] | worse |
| 15 | 210-223 | 58 | 13 | 0.6336 | 0.6253 | -0.0084 [-0.0152, -0.0028] | better |
| 16 | 224-237 | 27 | 11 | 0.6785 | 0.6751 | -0.0034 [-0.0108, +0.0049] | tie |
| 17 | 238-251 | 2 | 2 | 0.8758 | 0.8588 | -0.0170 [-0.0566, +0.0226] | tie |
| 20 | 280-293 | 66 | 2 | 0.6956 | 0.6975 | +0.0020 [+0.0013, +0.0030] | worse |
| 21 | 294-307 | 55 | 2 | 0.6650 | 0.6621 | -0.0029 [-0.0039, -0.0019] | better |
| 22 | 308-321 | 24 | 2 | 0.6792 | 0.6781 | -0.0011 [-0.0023, -0.0003] | better |
| 23 | 322-335 | 15 | 2 | 0.7236 | 0.7185 | -0.0051 [-0.0063, -0.0043] | better |
| 24 | 336-349 | 9 | 2 | 0.7191 | 0.7151 | -0.0040 [-0.0062, +0.0005] | tie |
| 25 | 350-363 | 3 | 1 | 0.6223 | 0.6260 | +0.0037 [+0.0037, +0.0037] | worse |

### Table 4. Version 3, version 2 and Vegas on the same games

Every game with a Vegas line, as in version 2. Vegas is reported, never used to judge.

| Seasons | Games | Vegas log loss | Version 2 log loss | Version 3 log loss | Version 3 - version 2 [95%] | Version 3 - Vegas [95%] |
| --- | --- | --- | --- | --- | --- | --- |
| Tuning, 2015-16 to 2022-23 | 10162 | 0.6028 | 0.6157 | 0.6155 | -0.0002 [-0.0008, +0.0004] | +0.0126 [+0.0091, +0.0162] |
| Exploration, 2023-24 to 2025-26 | 3962 | 0.5819 | 0.6014 | 0.5996 | -0.0018 [-0.0030, -0.0007] | +0.0177 [+0.0123, +0.0229] |
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

src/lib/v3.ts V3 matches the plan's fit, `{"home":{"seasons":3,"fallback":0.622},"out":["Out"],"rookieNp":40,"sigma":3.037,"widen":1.14}`.
<!-- results:end -->

## The switch

On 2026-10-31 the owner switched the site to version 3, as the plan allows; the confirmation runs either way. `src/lib/elo.ts` holds version 3's settings, and `modelInputs` in `src/lib/inputs.ts` gives each season its home edge, its rookies and its report lineups. Version 2, the baseline, is frozen as `V2` in `scripts/evaluate.ts` with the settings `src/lib/elo.ts` held until then. The games still to come are priced with the latest report, whatever day they fall on.
