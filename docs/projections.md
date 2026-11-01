# Season projections: an exploration

`src/lib/project.ts` plays out the rest of a season many times from the site's ratings: every standings game drawn from the chances the site already shows (rating gap, home edge, back-to-back), the conference tables seeded with the league's first tiebreakers (division leader, head-to-head, division and conference record, then a draw), the play-in from 2020-21 on, four best-of-seven rounds with games 1, 2, 5 and 7 at the higher seed, and the draft lottery for the 14 teams left out. `scripts/project.ts` runs it on the current season for the prototypes; `scripts/backtest-projections.ts` (`npm run backtest:projections`) scores it on the finished seasons and wrote the results below.

The site shows these odds since 2026-11-01: the Odds tab, each team's projections and each season's title race (`src/lib/season-odds.ts`). They play out 20,000 seasons from the day's ratings, with players out for weeks counted back on their listed return dates (`src/lib/returns.ts`), against the schedule ESPN has (`src/data/schedule/`) and stand-in games for anything it lacks (`src/lib/schedule.ts`), such as the two games each team plays after the NBA Cup's group stage. The settings below came from an exploration, not a pre-registration; they have not been confirmed on a season they were not chosen on, as docs/model-v3.md does for the model.

## Drift

A rating is an estimate, and teams change over a season. Each simulated season shifts every team by a draw with standard deviation `tau` Elo points, plus a walk that grows with the days ahead (`walk` points per square root of 100 days, one shape per team scaled by the square root of the days ahead). Both carry into the team's playoff games in proportion `playoff`.

They were chosen on the tuning seasons, 2015-16 to 2022-23: `tau` and `walk` by the mean ranked probability score of each team's final wins, then `playoff` by the mean log loss of reaching each playoff round (second round, conference finals, Finals, title). The checkpoints are 14, 30, 60, 90, 120 and 150 days after each season's first game, 2,000 runs each, against the real schedule still to play. 2019-20 counts for wins only, since its bubble format had a play-in of its own.

Chosen: `tau` 60, `walk` 20, `playoff` 0.5. The grid is flat near the optimum (RPS 2.433 to 2.436 for `tau` 40 to 60 with any `walk` up to 60), and `playoff` 0 and 0.5 tie on the round log loss (0.803). On the earlier exploratory run, the exploration seasons preferred `playoff` 1 (round log loss 0.922 against 0.928 at 0.5), so that setting is open. Carrying no drift at all scores best for the champion alone on both sets (1.60 and 1.58 against 1.66 and 1.67), on seven and three champions.

## Findings

- Drift is what makes the ranges honest. Without it the 80% ranges of final wins catch 70% of teams on the tuning seasons and 65% on the exploration seasons; with it, 85% and 79%. The mean projection barely moves.
- The in-season ratings beat the preseason seeds alone and beat pace (each team's win share so far, carried on, as a binomial) at every checkpoint, on both sets of seasons.
- Playoff chances are calibrated: in every tenth from 10% to 90% the share that made it is within 7 points of the mean chance given (about 100 teams a band).

## Results

### Grid on the tuning seasons (2015-16 to 2022-23), 2000 runs each

| | Wins RPS | Wins RMSE | In 80% range | Playoffs log loss | Playoffs Brier | Top 6 log loss | Rounds log loss | Champion log loss |
|---|---|---|---|---|---|---|---|---|
| tau 0, walk 0 | 2.531 | 4.73 | 70% | 0.340 | 0.110 | 0.380 | 0.814 | 1.60 |
| tau 0, walk 20 | 2.513 | 4.73 | 71% | 0.336 | 0.109 | 0.375 | 0.810 | 1.61 |
| tau 0, walk 40 | 2.479 | 4.73 | 75% | 0.324 | 0.107 | 0.358 | 0.810 | 1.65 |
| tau 0, walk 60 | 2.451 | 4.73 | 78% | 0.316 | 0.105 | 0.341 | 0.813 | 1.72 |
| tau 20, walk 0 | 2.508 | 4.74 | 72% | 0.332 | 0.109 | 0.371 | 0.811 | 1.63 |
| tau 20, walk 20 | 2.493 | 4.73 | 73% | 0.327 | 0.108 | 0.364 | 0.808 | 1.64 |
| tau 20, walk 40 | 2.468 | 4.73 | 76% | 0.320 | 0.107 | 0.352 | 0.810 | 1.67 |
| tau 20, walk 60 | 2.444 | 4.73 | 80% | 0.315 | 0.105 | 0.338 | 0.816 | 1.73 |
| tau 40, walk 0 | 2.462 | 4.74 | 78% | 0.320 | 0.106 | 0.348 | 0.808 | 1.66 |
| tau 40, walk 20 | 2.455 | 4.73 | 79% | 0.318 | 0.106 | 0.347 | 0.809 | 1.68 |
| tau 40, walk 40 | 2.442 | 4.73 | 81% | 0.315 | 0.105 | 0.339 | 0.812 | 1.70 |
| tau 40, walk 60 | 2.435 | 4.73 | 84% | 0.313 | 0.104 | 0.333 | 0.819 | 1.77 |
| tau 60, walk 0 | 2.436 | 4.73 | 84% | 0.314 | 0.105 | 0.334 | 0.814 | 1.71 |
| tau 60, walk 20 | 2.433 | 4.73 | 85% | 0.314 | 0.105 | 0.334 | 0.814 | 1.73 |
| tau 60, walk 40 | 2.433 | 4.73 | 86% | 0.314 | 0.104 | 0.332 | 0.820 | 1.77 |
| tau 60, walk 60 | 2.436 | 4.73 | 88% | 0.315 | 0.104 | 0.330 | 0.833 | 1.84 |
| tau 80, walk 0 | 2.443 | 4.73 | 90% | 0.317 | 0.105 | 0.330 | 0.831 | 1.81 |
| tau 80, walk 20 | 2.445 | 4.73 | 90% | 0.317 | 0.104 | 0.329 | 0.832 | 1.83 |
| tau 80, walk 40 | 2.453 | 4.74 | 90% | 0.319 | 0.105 | 0.331 | 0.841 | 1.85 |
| tau 80, walk 60 | 2.460 | 4.73 | 92% | 0.320 | 0.105 | 0.330 | 0.846 | 1.89 |

Chosen: tau 60, walk 20.

### How much drift the playoffs carry, tuning seasons

| | Wins RPS | Wins RMSE | In 80% range | Playoffs log loss | Playoffs Brier | Top 6 log loss | Rounds log loss | Champion log loss |
|---|---|---|---|---|---|---|---|---|
| carry 0 | 2.435 | 4.73 | 85% | 0.316 | 0.105 | 0.334 | 0.803 | 1.61 |
| carry 0.5 | 2.434 | 4.73 | 85% | 0.314 | 0.104 | 0.333 | 0.803 | 1.66 |
| carry 1 | 2.433 | 4.73 | 85% | 0.314 | 0.105 | 0.334 | 0.814 | 1.73 |

Chosen: tau 60, walk 20, playoff carry 0.5.

### Tuning seasons

| | Wins RPS | Wins RMSE | In 80% range | Playoffs log loss | Playoffs Brier | Top 6 log loss | Rounds log loss | Champion log loss |
|---|---|---|---|---|---|---|---|---|
| Model, drift 60/20/0.5 | 2.434 | 4.73 | 85% | 0.314 | 0.104 | 0.333 | 0.803 | 1.66 |
| Model, no drift | 2.531 | 4.73 | 70% | 0.340 | 0.110 | 0.380 | 0.814 | 1.60 |
| Preseason seeds, same drift | 2.814 | 5.40 | 78% | 0.327 | 0.108 | 0.384 | 0.883 | 1.79 |
| Pace | 3.487 | 6.57 | 61% | – | – | – | – | – |

By checkpoint, wins RPS / playoffs log loss:

| Days in | Model, drift 60/20/0.5 | Model, no drift | Preseason seeds, same drift | Pace |
|---|---|---|---|---|
| 14 | 3.91 / 0.445 | 4.16 / 0.509 | 4.24 / 0.451 | 7.26 / – |
| 30 | 3.41 / 0.426 | 3.55 / 0.479 | 3.90 / 0.433 | 4.91 / – |
| 60 | 2.84 / 0.362 | 2.95 / 0.384 | 3.34 / 0.386 | 3.70 / – |
| 90 | 2.24 / 0.313 | 2.30 / 0.331 | 2.67 / 0.329 | 2.56 / – |
| 120 | 1.42 / 0.209 | 1.44 / 0.206 | 1.82 / 0.231 | 1.63 / – |
| 150 | 0.78 / 0.131 | 0.78 / 0.130 | 0.92 / 0.134 | 0.86 / – |

### Exploration seasons (2023-24 to 2025-26)

| | Wins RPS | Wins RMSE | In 80% range | Playoffs log loss | Playoffs Brier | Top 6 log loss | Rounds log loss | Champion log loss |
|---|---|---|---|---|---|---|---|---|
| Model, drift 60/20/0.5 | 2.808 | 5.39 | 79% | 0.276 | 0.089 | 0.337 | 0.928 | 1.67 |
| Model, no drift | 2.948 | 5.38 | 65% | 0.292 | 0.091 | 0.397 | 0.944 | 1.58 |
| Preseason seeds, same drift | 3.480 | 6.38 | 67% | 0.345 | 0.115 | 0.366 | 1.053 | 1.98 |
| Pace | 3.499 | 6.41 | 62% | – | – | – | – | – |

By checkpoint, wins RPS / playoffs log loss:

| Days in | Model, drift 60/20/0.5 | Model, no drift | Preseason seeds, same drift | Pace |
|---|---|---|---|---|
| 14 | 4.78 / 0.479 | 5.20 / 0.595 | 5.17 / 0.510 | 6.86 / – |
| 30 | 3.60 / 0.316 | 3.77 / 0.310 | 4.58 / 0.439 | 4.60 / – |
| 60 | 3.11 / 0.304 | 3.23 / 0.313 | 3.93 / 0.383 | 3.62 / – |
| 90 | 2.57 / 0.234 | 2.68 / 0.225 | 3.39 / 0.315 | 2.88 / – |
| 120 | 1.88 / 0.174 | 1.92 / 0.160 | 2.57 / 0.259 | 2.01 / – |
| 150 | 0.90 / 0.148 | 0.89 / 0.147 | 1.25 / 0.163 | 1.03 / – |

### Playoff chances against what happened, every finished season but 2019-20

| Chance | Teams | Mean chance | Made it |
|---|---|---|---|
| 0–10% | 444 | 1.7% | 0.7% |
| 10–20% | 103 | 14.9% | 20.4% |
| 20–30% | 93 | 25.0% | 26.9% |
| 30–40% | 87 | 35.5% | 31.0% |
| 40–50% | 83 | 45.4% | 51.8% |
| 50–60% | 83 | 54.9% | 54.2% |
| 60–70% | 109 | 65.2% | 62.4% |
| 70–80% | 142 | 75.1% | 70.4% |
| 80–90% | 155 | 85.1% | 87.1% |
| 90–100% | 501 | 97.8% | 98.4% |

