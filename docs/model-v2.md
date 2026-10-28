# The rating model, version 2

Version 2 adds three things to the model in `docs/model.md`:

- A preseason seed for every team, from sportsbooks' preseason win totals.
- A back-to-back adjustment.
- A value for every player, so a game's prediction reflects who is expected to play.

This file holds the plan version 2 is chosen and confirmed by, written before the confirmation season is scored, then the results. Where this plan says "as in version 1", the definition in `docs/model.md`'s pre-registration applies unchanged.

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

The pre-registration's SHA-256 when it was written: `d0b48eb08211353a22300ab71eadb7ff59fc4303a2a8a5c0b631bfae4b7c0cad`.

## Before the build

These choices change what the reader sees, not the score. They are settled before the build, outside this plan.

- **A team's displayed rating.** The team rating plus its current rotation's player part, on version 1's Elo scale, is one option. Another is the team rating alone.
- **How the site explains player values.** The About page says nothing carries over from last season, and "How it works" explains a rating as a fit to margins. Both change.
- **Where preseason totals come from each October,** and who enters them.
