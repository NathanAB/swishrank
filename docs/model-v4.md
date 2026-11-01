# The rating model, version 4

Version 4 changes one thing in the model in `docs/model-v3.md`: a rookie drafted in the top three starts from the box rating top-three picks have played at, not from replacement level.

This file holds the plan version 4 is confirmed by, written before its confirmation season begins. Where this plan says "as in version 3", the definition in `docs/model-v3.md`'s pre-registration applies unchanged. The site runs version 3 until this plan's confirmation says otherwise or the owner switches it.

## Pre-registration

Written on 2026-11-01, during 2026-27 and before 2027-28, its confirmation season. A backtest written before 2027-28's first game will print the SHA-256 of this section, from the line after its heading to the line before the next `## ` heading, as in versions 1 to 3. The hash at writing is recorded under Results.

### What came before this plan

Every player with no appearances starts at a box rating of 8.49 per 36 minutes, with 400 minutes of it before his own count. That was 2015-16's 20th percentile, 3.2 below the league's mean that season and 5.5 below it in 2025-26. On 2026-10-30 it valued WSH's AJ Dybantsa, the 2026 draft's first pick, at -24 Elo points per 48 minutes after two games, below the league's average player, while he scored 19 and 17 points.

Over 2016-17 to 2022-23, rookies drafted first to third played their first 500 minutes at 0.28 per 36 above the league's minutes-weighted mean Game Score. Rookies drafted fourth to tenth played 3.42 below it, eleventh to twentieth 3.07 below, twenty-first to thirtieth 3.30 below, in the second round 3.90 below, and undrafted 3.63 below.

On 2026-11-01 the investigation scored starting levels by draft slot inside version 3's model, with its rookie hold of 40 games and the home edge fixed at 0.622. Each slot's level was the previous season's mean plus its gap, the gap measured on the other tuning seasons. Against starting every rookie at 8.49, in log loss with 95% intervals from version 1's weekly block bootstrap:

| Starting level | Tuning seasons | 2023-24 to 2025-26 | Games with a top-three rookie playing 20 or more minutes | Games where a side gave rookies a fifth of its minutes |
| --- | --- | --- | --- | --- |
| Top three by slot | -0.0000 [-0.0002, +0.0001] | -0.0001 [-0.0004, +0.0001] | -0.0001 [-0.0008, +0.0007] | -0.0002 [-0.0005, +0.0001] |
| Top ten by slot | -0.0000 [-0.0002, +0.0001] | -0.0001 [-0.0004, +0.0001] | -0.0001 [-0.0008, +0.0006] | -0.0001 [-0.0004, +0.0002] |
| Every rookie by slot | -0.0000 [-0.0002, +0.0001] | +0.0004 [+0.0000, +0.0007] | +0.0000 [-0.0008, +0.0008] | +0.0006 [+0.0002, +0.0010] |

Starting the top three at their slot's level predicted as well as version 3 everywhere, and every rookie by slot predicted worse. Version 4 is not expected to predict better. It exists so the site does not value the top of each draft as replacement-level players at no cost in accuracy, and its confirmation asks only that it be no worse. That grid found rookies and their draft slots from ESPN's athlete records; this plan's rookies are version 3's.

### Data and split

- As in version 3, with one more file: each player's draft year, round and overall pick from ESPN's athlete records, kept in the repository before 2027-28 begins.
- Confirmation games: every final 2027-28 game, play-in and playoffs included.

### Score

As in version 3: log loss, with Brier score and accuracy reported and never used to judge.

### The baseline

Version 3 as the site runs it, with its SIGMA and early widening.

### The model

Version 3 with one change, and nothing else changed.

- **A top-three rookie's starting level.** A top-three rookie is one of version 3's rookies whom ESPN lists as drafted in the first round with an overall pick of 1, 2 or 3, in the season's draft year or up to three before it. His box rating starts from the previous season's minutes-weighted mean per-36 Game Score plus 0.28, in place of 8.49, for all 400 of its starting minutes. The level is fixed when he first appears and stays his. Every other player starts from 8.49, as in version 3.
- **SIGMA and early widening.** Fitted by maximum likelihood on the tuning seasons, as in version 3, with this change.

### Uncertainty

As in version 3: the weekly block bootstrap, 2000 resamples, seed 20261025.

### Confirmation

Run once, after the last 2027-28 game.

- Score version 4 against version 3 on the confirmation games: the pooled log loss difference with its 95% interval.
- Version 4 goes on the site when the upper end of that interval is below +0.0005: no worse than version 3 by more than a twentieth of a percent of log loss. Otherwise the site keeps version 3.
- If version 3 is not on the site when the confirmation runs, version 4 does not go on. It was not tested on another base.
- The owner may switch the site to version 4 before 2027-28 ends. The confirmation runs either way.

### Reported, not used to judge

- The same comparison on the games with a top-three rookie playing 20 or more minutes for either side.
- Version 4, version 3 and Vegas on the same games.
- Each 2027-28 top-three rookie's starting level, and his value after 10, 20 and 40 games under both versions.

## Results

None yet. The backtest that checks this plan's hash and scores the confirmation is written before 2027-28 begins.

The pre-registration's SHA-256 when it was written: `25165e9ba9957633058fcc14645495bb76206e44f62417edc8162ce1a5244f99`.
