# The rating model, version 5

Version 5 is the model the site runs since November 2026 (`SITE` in `src/lib/site.ts`). It differs from version 4 (`docs/model-v4.md`) in two things, and everything else is version 4's.

- **What a player value is pulled toward.** Version 4 pulls each player value toward his box rating. Version 5 pulls it toward his on-court rating too: his rating from the scoreline while he is on the floor, adjusted for the teammates and opponents out there with him (`GLOSSARY.md`).
- **How a game's lineup is built.** Version 4 starts from the players of the team's previous game. Version 5 builds the lineup from the team's recent roster, each player at his chance of playing (Roster-based lineups, below).

The model's own preseason seed was the third part of the plan (issue 65). It tied with sportsbooks' win totals and leaned worse, so the win totals stay (Every idea tried and Left for later, below).

Version 5 is judged by `docs/adr/0002-versions-are-judged-on-past-seasons.md`: every new setting is chosen from the seasons before the one scored, and log loss on real results decides. No betting number trains, tunes or chooses anything (`docs/adr/0001-no-betting-lines-in-the-model.md`). `npm run backtest:v5` writes the Results below.

## The on-court rating

`src/lib/on-court.ts` fits it from the play-by-play record in `scripts/stints/` (`src/lib/stints.ts`).

- **A stint.** Ten players' time on the floor together, with each side's points and three-point shots. A stint counts when the record names five players a side and it lasted more than 0 seconds.
- **What is fitted.** One number for each player and one for the home side. A stint's expected margin per 100 possessions is the home five's numbers added up, less the away five's, plus the home term. The fit is least squares over every stint so far. A stint weighs its possessions, at a fixed pace of 100 a side per 48 minutes, times 0.5^(days since / half-life).
- **Three-point luck.** Each side's points lose 3 for every three it made beyond the league's rate, which is the makes over the attempts of the record's earlier seasons. The record's first season keeps its points as scored.
- **The pull.** Each player is pulled toward the box prior, a multiple of his box rating, with `ridge` possessions of weight. His prior follows his box rating from his first stint of a season on, and until then it stays where the season before left it.
- **When.** A season is refitted after every game day. A refit on a day reads that day's stints and everything before it. The games of the days after it read the refit. Until 14 November 2026 the site refitted after every 7th game day, and once more after a season's last game day when the next season began. The search for the settings still does (Refitted every game day, below).
- **Into the model.** A player's prior centre in the model's fit is 0.08 times his box rating in version 4. In version 5 it is 0.08 times his box rating plus `weight` times the part of his on-court rating his box rating does not explain, which is his on-court rating less the box prior times his box rating. `modelInputs` in `src/lib/inputs.ts` builds it when given version 5's settings.
- **A player with no play-by-play on record** has no such part, and keeps version 4's centre exactly. **A season with no record on file** adds no stints, and its players keep what the earlier seasons left them.
- **Walking forward.** A day's on-court rating reads only games played on or before that day. `src/lib/on-court.test.ts` and `scripts/candidates/candidates.test.ts` change every later game and require every earlier rating and chance to stay exactly as it was.

ESPN's play-by-play misses some substitutions in 2017-18 to 2019-20, and 2021-22's three-point attempts are read from play text. Those seasons are used as they are (Limits of the test, below).

## How the settings are chosen

`scripts/candidates/v5.ts` chooses version 5's settings for a season from the seasons before it, and from nothing else:

- the ridge, from 1,500, 3,000 and 6,000 possessions;
- the half-life, from 365, 730 and 1,460 days;
- the box prior, from 0, 0.5 and 1;
- the weight, from 0 to 0.30 in steps of 0.02, where 0 is version 4's player values;
- SIGMA and the early widening, by maximum likelihood, for each combination of the four.

The combination with the lowest log loss on those seasons is the one the next season is scored with: 432 combinations a season. The ranges come from the research, which saw every season. That is the only way a later season reaches an earlier season's settings.

The model's fit is linear in the players' prior centres, and a game's expected margin is linear in the fit. So each ridge, half-life and box prior is fitted once, at weight 0.1, and the expected margins at any other weight lie on the line through that fit's and version 4's. A test in `scripts/candidates/candidates.test.ts` checks this against a real fit at each weight.

`V5` in `src/lib/v5.ts` holds the settings chosen from every finished season on file, 2015-16 to 2025-26, which are the ones the site runs: ridge 1,500, half-life 365 days, box prior 0.5, weight 0.12, SIGMA 3.194 and early widening 1.21. The search refits the on-court rating after every 7th game day, and the site refits it after every game day with the same settings (Refitted every game day, below). `npm run backtest:v5` fails when `V5` differs from what `scripts/candidates/v5-daily.ts`, the site's candidate, chooses.

The choice among the best is close to a coin toss. On those eleven seasons the chosen combination scores 0.60433, the next eleven lie within 0.00011 of it, and every one of the twelve has box prior 0.5, a ridge of 1,500 or 3,000 and a weight of 0.10 to 0.16. The best combination with weight 0 scores 0.60671. These are the scores the settings were chosen on, so they say which settings fit, and the Results below say what the on-court rating is worth.

## Every idea tried

`docs/adr/0002-versions-are-judged-on-past-seasons.md` asks a write-up to report every idea that was tried, with its numbers, and to say how many there were. About 390 variants were scored in the research for version 5. The same past seasons judged every one of them, so the best results are somewhat inflated, and the three marked below are likely flukes or do not count.

Each figure is a log loss difference against version 4 on real results. Negative is better. The intervals are 95%, from the weekly block bootstrap. "Earlier" is 2015-16 to 2022-23, the seasons the research chose its settings on. "Unseen" is 2023-24 to 2025-26. The research figures come from the prototype (branch `prototype/model-v5`, `scripts/research/`), not from the scoreboard, and where this record has no figure for an idea the table says so.

### What went into version 5

These three are scoreboard figures: every setting chosen from the seasons before the one scored, 2019-20 to 2025-26 pooled (Results, below).

| Part | Result |
| --- | --- |
| On-court rating beside the box rating | -0.0024 [-0.0037, -0.0010] |
| Roster-based lineups, against version 5 with version 4's lineups | value error 0.276 to 0.248, log loss -0.0007 [-0.0018, +0.0003]. In by the lineup rule. |
| Both together | -0.0031 [-0.0046, -0.0016] |

### On-court rating: about 160 variants

| Variant | Earlier | Unseen | Outcome |
| --- | --- | --- | --- |
| First form: ridge 8,000, half-life 365 days, box prior 0.5, weight 0.12 | -0.0009 [-0.0017, -0.0002] | -0.0020 [-0.0033, -0.0007] | A gain on both sets |
| Longer memory, with three-point luck taken out of stints | -0.0017 [-0.0027, -0.0006] | -0.0037 [-0.0057, -0.0015] | A gain on both sets. The form that was built. |
| The on-court rating in place of the box rating | no figure on record | no figure on record | A tie or worse |
| Garbage time taken out of the rating or of the team fit | no figure on record | no figure on record | Flat |
| Free-throw luck taken out | no figure on record | no figure on record | Flat |
| A game's own spread of outcomes, from pace or three-point rate | no figure on record | no figure on record | Flat |
| A rookie hold of 10 to 160 | no figure on record | no figure on record | Flat |
| A playoff weight, a floor on possessions, a daily refit | no figure on record | no figure on record | Flat |
| A daily refit, as the site's candidate (Refitted every game day, below) | not scored | -0.0000 [-0.0002, +0.0001] against the weekly refit | A tie. The site runs it since 14 November 2026. |
| Stints as the season fit's own rows | no figure on record | no figure on record | Flat |
| Lineup chemistry | no figure on record | no figure on record | No unit effect that lasts |

### Lineups

| Variant | Unseen | Outcome |
| --- | --- | --- |
| Roster-based lineups on the 5 PM reports | -0.0000 [-0.0015, +0.0014] | A tie |
| Roster-based lineups on the pre-tip reports | -0.0017 [-0.0039, +0.0004] | Not clear of zero. Built, and judged by the lineup rule. |
| Roster-based lineups without the fill term | +0.0009 to +0.0022 | Worse |
| A traded player spotted on his new team's report | no figure on record | No change that could be measured |
| The starting five as one more thing a rate looks up | -0.0009 [-0.0022, +0.0003] | It helps the lineup measure. Not built (Left for later, below). |

The research ran the roster rule in three forms: the chance of playing alone, with minutes moved toward the bench, and with moved players taken off their old team's roster. It scored each at fills of 0, -0.15, -0.3 and -0.45. The build tried three more things. The fills -0.6 and -0.75 joined the choice, because the fill chosen from every finished season sat at the end of the list, and neither is chosen in any season. A report now adds a player only once he has played this season, which the walk-forward check forced and which cost +0.0001 [-0.0000, +0.0003] in log loss on 2023-24 to 2025-26 on the research copy. The starting five was tested and not built.

### Version 4's settings: about 45 variants, and 17 more that weigh recent games

These chose nothing. They test whether version 4's own settings were already near their best.

- **Scored:** the team pull, the seed's fade, the margin power, the player weight and hold, the box rating's half-life, the fill size, the minutes window, the Questionable share and the back-to-back size.
- **Result:** none moved log loss by more than 0.0004 either way on both sets, with one exception. A margin power of 0.4 was worse, by +0.0009 on the earlier seasons and +0.0026 on the unseen ones.
- **Recent games weighted more**, 17 variants: no gain. A 30-day half-life was worse by +0.0017 to +0.0030.

### Luck-adjusted margins in the team fit: 19 variants

- At full strength: worse, by +0.0021 to +0.0074.
- At half strength: a tie, -0.0003 to -0.0009 on the unseen seasons, with intervals across zero.

### The preseason seed and the early season: 42 variants

| Variant | Earlier | Unseen | Outcome |
| --- | --- | --- | --- |
| The model's own seed, from opening rosters, last season's ratings, an age curve and preseason form, in place of the win totals | +0.0004 [-0.0008, +0.0016] | +0.0006 [-0.0013, +0.0026] | A tie that leans worse. The win totals stay (`docs/adr/0001-no-betting-lines-in-the-model.md`). |
| Last season's team part alone as the seed | +0.0015 | +0.0019 | Worse |
| Preseason game results added to the win-total seed | -0.0006 [-0.0010, -0.0002] | -0.0002 [-0.0008, +0.0003] | **Possible fluke.** A gain only on the seasons it was tuned on. |
| A real lineup for a team's first game | no figure on record | no figure on record | A tie overall. It leans toward a gain in each team's first ten games. |
| Roster continuity scaling the seed's pull | no figure on record | no figure on record | A tie |
| No early widening | no figure on record | no figure on record | A tie |

### Data the model had never read: 67 features screened, 9 run singly, 8 combinations

| Feature | Unseen | Outcome |
| --- | --- | --- |
| Referee crews, travel and time zones, a home edge by team, attendance, tip time and weekday, age, height, experience, return from absence, a new coach, team style and style matchups, playoff series state, a game's own spread of outcomes | no figure on record | No signal |
| Nothing at stake for a team | -0.0003 [-0.0010, +0.0003] | A tie, with the same sign on both sets |
| Heavy minutes in the last seven days | -0.0003 [-0.0008, +0.0002] | A tie, with the same sign on both sets |
| Surprise starters as an adjustment | -0.0005 [-0.0013, +0.0002] | A tie, with the same sign on both sets |
| National TV | +0.0012 [+0.0002, +0.0023] | Worse |
| All 15 features that looked good on the earlier seasons, together | +0.0011 [-0.0013, +0.0035], after -0.0042 on the earlier seasons | **A fluke of selection.** The gain is gone on seasons the selection did not see. |
| Five features picked partly by looking at the unseen seasons | -0.0013 [-0.0023, -0.0003] | **Does not count.** The pick saw the test. |

### Ruled out by the rule against betting lines

`docs/adr/0001-no-betting-lines-in-the-model.md` rules these out. They were measured before the rule was written, on 2018-19 to 2025-26.

- A correction trained on past closing lines: -0.0012 [-0.0024, +0.0001].
- The same correction with each team's earlier lines as an input: -0.0030.
- The model blended with the market: no gain over the market.
- Settings chosen by distance to the market's chance: the distance tracked results with a slope of 0.78, but it credited faster reaction to recent results, and results did not bear that out.
- Box-score weights, a home edge by team and player corrections learned from lines: nothing.

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

## Refitted every game day

Version 5 went on the site refitting the on-court rating after every 7th game day. Since 14 November 2026 the site refits it after every game day: `refitEvery` in `V5` (`src/lib/v5.ts`). Every other setting is the one chosen with the weekly refit.

- **On past seasons it ties the weekly refit.** `scripts/candidates/v5-daily.ts` takes the settings `v5-roster.ts` chooses for each season and refits daily. Against the weekly refit it ties in each of 2019-20 to 2025-26, by -0.0002 to +0.0002 a season, and over all 8,919 games by -0.0000 [-0.0002, +0.0001]. Against version 4 it scores -0.0031 [-0.0047, -0.0016], as the weekly refit does. It goes in because it is no worse and it removes the weekly step a reader sees (`docs/adr/0002-versions-are-judged-on-past-seasons.md`). It is the second daily refit tried, after the research's (Every idea tried, above), so two of the ideas counted there are this one.
- **The settings were not chosen again.** The search still refits weekly, because a daily search would fit its 27 rules with 7 times as many refits. Fitted again on every finished season with the daily refit and roster-based lineups in, SIGMA and the early widening come out at 3.166 and 1.21, against 3.162 and 1.20 with the weekly refit, so the 3.194 and 1.21 on file stay. On those 14,168 games, at the settings on file, the daily refit scores 0.60378 against the weekly 0.60371. Those settings were chosen on the same games with the weekly refit, so this in-sample gap of 0.00007 favours the weekly refit by construction. The unseen seasons above are the judge.
- **What a reader sees.** A refit never moved a team's rating on a day it did not play, at either cadence: the history books it on the team's next game day. Daily, it comes with most of a team's games in smaller pieces, where weekly it came in a lump about once a week. In 2025-26, the on-court line moves a team-game by half a point or more on 2,007 of 2,644 team-games, against 859, and by 10 points or more on 11, against 35. The largest is 25.1 points, DAL on 22 October 2025, against 27.7. This season to 13 November it reaches 5 points on 72 of 366 team-games, against 38, because a refit early in a season, on few stints, moves more. The largest is 17.0, MEM on 21 October, against 19.3, LAC on 2 November. A refit now reads the team's own game of that day, so the line leans with the result: its correlation with the rest of the day's move is 0.28 in 2025-26, against 0.06. A game day's whole move grows a little, from 8.23 to 8.74 points in root mean square. The largest move this season on a day a team did not play is the same at both cadences: GS, 43 points down on 12 November, when the next morning's report listed Stephen Curry as out until 12 December.
- **What it costs.** Measured on a developer's Mac on 14 November 2026, two alternating runs each, with other jobs running. The model's inputs for all 12 seasons take 48.7 and 49.9 seconds, against 9.0 and 10.0 with the weekly refit: 2,306 refits against 335, on one core. The conjugate-gradient solves are 49.9 of 53.1 seconds in a profiled run, at about 33 iterations a refit either way. Fitting a season after that is unchanged, 0.01 seconds for this season and 0.17 for 2025-26. The scratch build of `AGENTS.md` takes 73 and 59 seconds, against 17 and 15. A deploy pays the 40 seconds once a build. On 14 November its build step took 165 to 416 seconds, so a score refresh of 2 to 4 minutes should grow by about a minute; the deploy after merge measures it. The fix, if it matters, is a cache: a finished season's refits never change, so a build that keeps the walk's state after the last finished season (in `SWISHRANK_CACHE`, as the team histories are kept) refits only the season in progress, at most about 170 game days.

## What it costs

Measured on a developer's Mac on 2026-11-13, twice each.

- **The model's inputs for all 12 seasons**, which a site build works out once: 1.0 second in version 4, 8.7 seconds with the on-court rating, which is 336 refits over 1,623 players.
- **Fitting one finished season** after that: 0.2 seconds in both.
- **A build of the site's four pages outside the seasons** (How it works, Track record, Injury report and the 404 page), which fits every season: 5.0 and 5.6 seconds on version 4, 13.8 and 13.9 seconds with the on-court rating on.
- **The same four-page build after the switch**, with the on-court rating and roster-based lineups both on: a median of 13.0 seconds over five runs (12.4 to 14.2), against 4.5 seconds (3.9 to 5.1) on version 4 the same afternoon. The runs alternated between the two, on an 8-core Mac with another job running.
- **Each team's history.** The on-court update's line costs one more fit for each team-day. A finished season's 30 histories take 17.0 seconds against 12.8 without the line, the median of three alternating runs (16.3 to 20.1 against 12.8 to 13.1), and the season in progress 0.4 seconds against 0.3. A deploy keeps the finished seasons' histories from one run to the next (`SWISHRANK_CACHE`), so a daily build pays the smaller figure. A build with none kept pays about 46 seconds more over the eleven finished seasons.
- **A build of 817 pages** with no histories kept (every page but the players page and the finished seasons' game pages): 2 minutes 14 seconds on version 4 and 3 minutes 17 seconds on version 5, one run each, the second with other jobs running.

Version 5 therefore adds about 8.5 seconds to every build, once, however many pages it writes, and about 46 seconds more to a build that works out every finished season's histories again. Nearly all of the 8.5 seconds is the on-court rating's refits, which run on one core. The full build of about 15,000 pages takes over 40 minutes and was not run for this measurement.

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

## The switch

The site runs version 5 since November 2026. `SITE` in `src/lib/site.ts` names the version, and three things read it: `PARAMS.sigma` and `EARLY.widen` in `src/lib/elo.ts`, and `siteInputs()` in `src/lib/inputs.ts`, which builds the inputs of every page and of every script that means the site's model.

- **The settings.** The ones chosen from every finished season: ridge 1,500, half-life 365 days, box prior 0.5, weight 0.12, SIGMA 3.194, early widening 1.21 and a fill of -0.45, with the on-court rating refitted after every game day since 14 November 2026. `npm run backtest:v5` fails when `V5` in `src/lib/v5.ts` differs from them.
- **Version 4 stays runnable.** `V4` in `src/lib/v4.ts` holds its SIGMA, 2.986, and its early widening, 1.14, beside its lineup rule, as `V3` holds version 3's. `modelInputs()` with no switches builds its inputs. `scripts/candidates/v4.ts` is the baseline every later version is scored against. The switch moved none of its numbers: the Results below, `npm run backtest:v4` and `npm run backtest:v3` print the same figures as before it.
- **A game page's chance is the scoreboard's.** For the same game and the same files, the site's model and the scoreboard's code (`priced()` in `scripts/candidates/v5.ts`, at `V5`'s settings) give the same chance to the last digit. This held for all 3,986 final games of 2020-21, 2023-24, 2025-26 and 2026-27 to 12 November, and 164 built game pages of 2026-27 print that chance to the percent. A test in `scripts/candidates/candidates.test.ts` holds it on 264 games of 2023-24. The scoreboard's own tables differ from the site's past chances for two reasons, both by design: a scored season's settings come from the seasons before it, and the scoreboard reads the pre-tip reports where the site's archive holds the 5 PM reports.

### What a reader sees change

Measured between two builds of the same data on 13 November 2026, version 4 and version 5.

- **This season's ratings spread wider.** Their standard deviation goes from 104 to 119. The Spurs go from 1190 to 1237 and the Magic from 969 to 1035. 21 teams change rank, the Magic by the most, from 21st to 15th. Early in a season a team's rating rests mostly on its seed and its players' values, and the on-court rating spreads those values wider. The larger SIGMA takes back 7% of the spread, not all of it. Before the season's first game the spread was 99 on version 4 and is 119 on version 5: the Thunder open at 1321 where they opened at 1209, and the Celtics at 1173 where they opened at 1089. The league's average rating, which nothing re-centres, is 1021 where it was 1003.
- **The wider spread is not overconfidence.** On every finished season, version 5 scores better than version 4 at every stage of a season: by 0.0034 in log loss where either side has played under 5 games, 0.0024 at 5 to 9, 0.0051 at 10 to 19, 0.0003 at 20 to 39 and 0.0038 after that. These figures read the pre-tip reports and `V5`'s settings, which saw these seasons.
- **This season's chances** move by 4.1 points on average and 14.8 at most. On the 174 games played, log loss goes from 0.5693 to 0.5513, and in the season's first two weeks from 0.5929 to 0.5836. That many games cannot tell the versions apart.
- **Finished seasons.** A team's final rating moves by 22 points on average and 72 at most, and 178 of 330 team-seasons change rank, by 5 places at most. A game's chance moves by 2.8 points on average.
- **Each team's players.** The same players at the same minutes, in all 459 slots of this season's team pages. The points a player adds to his team's rating spread wider: their standard deviation goes from 11.7 to 14.5. Victor Wembanyama goes from 56 to 92 and Franz Wagner from 18 to 57.
- **The odds.** They follow the ratings. The Magic's playoff chance goes from 35% to 58%, and the 76ers' title chance from 11.2% to 3.7%.
- **How it works.** Home court reads 43 points where it read 45, and a back-to-back 37 where it read 40, because a point of rating is a larger share of SIGMA.
- **Ratings now also move about once a week for a reason that is no game result.** At the switch the on-court rating was refitted after every 7th game day, and a team's rating took the refit on its next game day. Since 14 November 2026 it is refitted after every game day (Refitted every game day, above). Team by team, the largest such move this season is 19 points, the Clippers on 2 November, and 37 of 359 team-days carry one of 5 points or more. The history under each team and game shows it on its own line, "Scoreline with each player on the floor".
- **The finished seasons' title races** in `src/data/odds/` are rebuilt on version 5. They were already out of date: the 2015-16 file on record differed from a fresh version 4 rebuild in 6,274 of its 10,261 numbers, by up to 6.1 points, because no step rebuilds them when the model changes. `AGENTS.md` now names the command.

### The refreshes

Neither scheduled refresh needs a change. The morning run (`.github/workflows/deploy.yml`) already commits `scripts/stints/` with the scores, and the build reads it from disk. The injury-report run (`.github/workflows/nba-report.yml`) commits `src/data/nba-reports/` and starts a deploy, which builds from a full checkout. A game whose play-by-play ESPN does not have yet adds nothing to the on-court rating and holds nothing back. A report-triggered build reads the stints the morning run saved, so a day's games reach the on-court rating the next morning, as they reach the box rating.

## Limits of the test

- **The comparison favours version 4.** Version 4 keeps one set of settings in every scored season, and its plan chose them with these seasons in view. Version 5's settings for a season come from the seasons before it alone. The measured gain is therefore, if anything, understated on this count.
- **The count of ideas inflates the gain.** About 390 variants were judged on the same seasons (Every idea tried, above). The on-court rating's research settings were chosen on 2015-16 to 2022-23, and the three seasons after them gain 0.0035 to 0.0037 each on the scoreboard, so the gain is not only selection.
- **The check for reading later games runs on a sample of days.** `scripts/candidates/candidates.test.ts` changes every later score and removes every later box score, play-by-play record and report, then requires each earlier chance to stay as it was. It does so at four days of November 2023, in a 2023-24 season cut at 1 December, for each candidate, so it catches a leak only on the paths those games take.
- **The play-by-play record is weaker in 2017-18 to 2019-20.** ESPN's feed misses some substitutions there. Every player's rebuilt minutes are within two of his box-score minutes in 87.1%, 81.0% and 84.2% of those seasons' games, against 99.1% or more in every other finished season. About 0.2 scoring plays a game land in the wrong stint there, against under 0.02 elsewhere. The seasons are used as they are. Of the scored seasons, 2019-20 is one of the three, and every later season reads them as history at a weight that halves with each half-life.
- **2021-22's three-point attempts are read from play text.** ESPN's feed for that season does not mark a three-point attempt, so misses are read from each play's words. Makes equal the box score's exactly. Attempts come out 0.8% under it over the season, about half a shot a team a game, so the luck adjustment sees about 0.3 points a team a game too much shooting luck in that season.
- **Version 5's SIGMA and early widening were fitted with version 4's lineups.** The scoreboard candidate keeps them when it adds roster-based lineups and changes only the lineups and the fill, so the site runs the same pairing the scoreboard scored. Fitted again with roster-based lineups in, on every finished season, they come out at 3.162 and 1.20 against the 3.194 and 1.21 on file. Keeping the ones on file costs 0.00003 in log loss on those seasons, 0.60371 against 0.60368.

## Left for later

- **The starting five.** It helps the lineup measure on unseen seasons (Roster-based lineups, above) and would go in by the lineup rule. It counts only if the site can read the five before tip-off, and issue 70 records what ESPN's public data shows before a game starts. It waits for that.
- **The model's own preseason seed.** A seed from opening rosters, last season's ratings, an age curve and preseason form tied with sportsbooks' win totals and leaned worse, at +0.0004 [-0.0008, +0.0016] on the earlier seasons and +0.0006 [-0.0013, +0.0026] on the unseen ones. `docs/adr/0001-no-betting-lines-in-the-model.md` keeps the win totals until a seed of the model's own scores at least as well. They are the one betting number the model reads.
- **The seed and the early widening, chosen again with the on-court rating in.** Version 5 keeps version 4's seed scale and widens chances for a team's first five games only. Where the less experienced side has played 5 to 9 games, the SIGMA that fits version 5's chances best is 3.51 on 2015-16 to 2025-26, over 845 games, against the 3.194 on file. Version 4's is 3.09 against 2.986. Version 5 still scores better than version 4 on those games, by 0.0024, so this is a possible gain and not a defect.
- **Ideas seen and not tried:** lineup rates learned from 2015-16 to 2018-19 as well, and a roster carried over from last season for a team's first game.

## Results

<!-- results:start -->
Bootstrap: 2000 resamples of whole weeks, seed 20261025. Seasons scored from 2019-20 on, each with every setting chosen from the seasons before it. Candidates scored: 5, version 4's check against itself included.

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

Each season is scored with the candidate's settings chosen from the seasons before it; the pooled row takes every scored game. Version 4 is as the site ran it until the switch to version 5 (src/lib/inputs.ts modelInputs with no switches, src/lib/v4.ts V4) on the reports of Table 1, so its numbers differ from docs/model-v4.md's, which read the 5 PM reports. It keeps its own settings in every season, and its plan chose them with these seasons in view, so the comparison favours version 4.

| Season | Settings chosen from | Candidate's settings | Games | Version 4 log loss | Candidate log loss | Candidate minus version 4 [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2015-16 to 2018-19 | version 4's: SIGMA 2.986, early widening 1.14 | 1143 | 0.6144 | 0.6144 | +0.0000 [+0.0000, +0.0000] | tie |
| 2020-21 | 2015-16 to 2019-20 | version 4's: SIGMA 2.986, early widening 1.14 | 1171 | 0.6289 | 0.6289 | +0.0000 [+0.0000, +0.0000] | tie |
| 2021-22 | 2015-16 to 2020-21 | version 4's: SIGMA 2.986, early widening 1.14 | 1323 | 0.6169 | 0.6169 | +0.0000 [+0.0000, +0.0000] | tie |
| 2022-23 | 2015-16 to 2021-22 | version 4's: SIGMA 2.986, early widening 1.14 | 1320 | 0.6323 | 0.6323 | +0.0000 [+0.0000, +0.0000] | tie |
| 2023-24 | 2015-16 to 2022-23 | version 4's: SIGMA 2.986, early widening 1.14 | 1319 | 0.5935 | 0.5935 | +0.0000 [+0.0000, +0.0000] | tie |
| 2024-25 | 2015-16 to 2023-24 | version 4's: SIGMA 2.986, early widening 1.14 | 1321 | 0.5988 | 0.5988 | +0.0000 [+0.0000, +0.0000] | tie |
| 2025-26 | 2015-16 to 2024-25 | version 4's: SIGMA 2.986, early widening 1.14 | 1322 | 0.5849 | 0.5849 | +0.0000 [+0.0000, +0.0000] | tie |
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

Each season is scored with the candidate's settings chosen from the seasons before it; the pooled row takes every scored game. Version 4 is as the site ran it until the switch to version 5 (src/lib/inputs.ts modelInputs with no switches, src/lib/v4.ts V4) on the reports of Table 1, so its numbers differ from docs/model-v4.md's, which read the 5 PM reports. It keeps its own settings in every season, and its plan chose them with these seasons in view, so the comparison favours version 4.

| Season | Settings chosen from | Candidate's settings | Games | Version 4 log loss | Candidate log loss | Candidate minus version 4 [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2015-16 to 2018-19 | version 4's: SIGMA 2.986, early widening 1.14; roster lineups at fill -0.3 | 1143 | 0.6144 | 0.6144 | +0.0000 [+0.0000, +0.0000] | tie |
| 2020-21 | 2015-16 to 2019-20 | version 4's: SIGMA 2.986, early widening 1.14; roster lineups at fill -0.3 | 1171 | 0.6289 | 0.6292 | +0.0003 [-0.0018, +0.0025] | tie |
| 2021-22 | 2015-16 to 2020-21 | version 4's: SIGMA 2.986, early widening 1.14; roster lineups at fill -0.15 | 1323 | 0.6169 | 0.6174 | +0.0005 [-0.0019, +0.0029] | tie |
| 2022-23 | 2015-16 to 2021-22 | version 4's: SIGMA 2.986, early widening 1.14; roster lineups at fill -0.3 | 1320 | 0.6323 | 0.6312 | -0.0010 [-0.0036, +0.0017] | tie |
| 2023-24 | 2015-16 to 2022-23 | version 4's: SIGMA 2.986, early widening 1.14; roster lineups at fill -0.45 | 1319 | 0.5935 | 0.5912 | -0.0023 [-0.0045, -0.0001] | better |
| 2024-25 | 2015-16 to 2023-24 | version 4's: SIGMA 2.986, early widening 1.14; roster lineups at fill -0.45 | 1321 | 0.5988 | 0.5989 | +0.0001 [-0.0033, +0.0033] | tie |
| 2025-26 | 2015-16 to 2024-25 | version 4's: SIGMA 2.986, early widening 1.14; roster lineups at fill -0.45 | 1322 | 0.5849 | 0.5839 | -0.0011 [-0.0045, +0.0022] | tie |
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

Chosen from 2015-16 to 2025-26, the settings the season after them would run with: version 4's: SIGMA 2.986, early widening 1.14; roster lineups at fill -0.45.

### Version 5: log loss on real results

Each season is scored with the candidate's settings chosen from the seasons before it; the pooled row takes every scored game. Version 4 is as the site ran it until the switch to version 5 (src/lib/inputs.ts modelInputs with no switches, src/lib/v4.ts V4) on the reports of Table 1, so its numbers differ from docs/model-v4.md's, which read the 5 PM reports. It keeps its own settings in every season, and its plan chose them with these seasons in view, so the comparison favours version 4.

| Season | Settings chosen from | Candidate's settings | Games | Version 4 log loss | Candidate log loss | Candidate minus version 4 [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2015-16 to 2018-19 | on-court rating with ridge 1500, half-life 365 days and box prior 1, refitted every 7 game days, at weight 0.08; SIGMA 2.928, early widening 0.97 | 1143 | 0.6144 | 0.6137 | -0.0008 [-0.0038, +0.0020] | tie |
| 2020-21 | 2015-16 to 2019-20 | on-court rating with ridge 6000, half-life 1460 days and box prior 0.5, refitted every 7 game days, at weight 0.14; SIGMA 3.171, early widening 0.98 | 1171 | 0.6289 | 0.6317 | +0.0028 [-0.0002, +0.0063] | tie |
| 2021-22 | 2015-16 to 2020-21 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every 7 game days, at weight 0.10; SIGMA 3.164, early widening 1.08 | 1323 | 0.6169 | 0.6112 | -0.0057 [-0.0089, -0.0024] | better |
| 2022-23 | 2015-16 to 2021-22 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every 7 game days, at weight 0.12; SIGMA 3.202, early widening 1.15 | 1320 | 0.6323 | 0.6309 | -0.0013 [-0.0043, +0.0016] | tie |
| 2023-24 | 2015-16 to 2022-23 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every 7 game days, at weight 0.12; SIGMA 3.219, early widening 1.19 | 1319 | 0.5935 | 0.5898 | -0.0037 [-0.0072, +0.0001] | tie |
| 2024-25 | 2015-16 to 2023-24 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every 7 game days, at weight 0.14; SIGMA 3.227, early widening 1.21 | 1321 | 0.5988 | 0.5953 | -0.0035 [-0.0076, +0.0006] | tie |
| 2025-26 | 2015-16 to 2024-25 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every 7 game days, at weight 0.14; SIGMA 3.235, early widening 1.26 | 1322 | 0.5849 | 0.5815 | -0.0035 [-0.0070, +0.0005] | tie |
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

Chosen from 2015-16 to 2025-26, the settings the season after them would run with: on-court rating with ridge 1500, half-life 365 days and box prior 0.5, refitted every 7 game days, at weight 0.12; SIGMA 3.194, early widening 1.21.

### Version 5 with roster-based lineups, refitted every game day: log loss on real results

Each season is scored with the candidate's settings chosen from the seasons before it; the pooled row takes every scored game. Version 4 is as the site ran it until the switch to version 5 (src/lib/inputs.ts modelInputs with no switches, src/lib/v4.ts V4) on the reports of Table 1, so its numbers differ from docs/model-v4.md's, which read the 5 PM reports. It keeps its own settings in every season, and its plan chose them with these seasons in view, so the comparison favours version 4.

| Season | Settings chosen from | Candidate's settings | Games | Version 4 log loss | Candidate log loss | Candidate minus version 4 [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2015-16 to 2018-19 | on-court rating with ridge 1500, half-life 365 days and box prior 1, refitted every game day, at weight 0.08; SIGMA 2.928, early widening 0.97; roster lineups at fill -0.3 | 1143 | 0.6144 | 0.6135 | -0.0009 [-0.0040, +0.0021] | tie |
| 2020-21 | 2015-16 to 2019-20 | on-court rating with ridge 6000, half-life 1460 days and box prior 0.5, refitted every game day, at weight 0.14; SIGMA 3.171, early widening 0.98; roster lineups at fill -0.3 | 1171 | 0.6289 | 0.6312 | +0.0023 [-0.0010, +0.0058] | tie |
| 2021-22 | 2015-16 to 2020-21 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every game day, at weight 0.10; SIGMA 3.164, early widening 1.08; roster lineups at fill -0.15 | 1323 | 0.6169 | 0.6115 | -0.0053 [-0.0092, -0.0015] | better |
| 2022-23 | 2015-16 to 2021-22 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every game day, at weight 0.12; SIGMA 3.202, early widening 1.15; roster lineups at fill -0.3 | 1320 | 0.6323 | 0.6298 | -0.0024 [-0.0062, +0.0017] | tie |
| 2023-24 | 2015-16 to 2022-23 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every game day, at weight 0.12; SIGMA 3.219, early widening 1.19; roster lineups at fill -0.45 | 1319 | 0.5935 | 0.5877 | -0.0058 [-0.0097, -0.0015] | better |
| 2024-25 | 2015-16 to 2023-24 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every game day, at weight 0.14; SIGMA 3.227, early widening 1.21; roster lineups at fill -0.45 | 1321 | 0.5988 | 0.5949 | -0.0039 [-0.0079, -0.0001] | better |
| 2025-26 | 2015-16 to 2024-25 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every game day, at weight 0.14; SIGMA 3.235, early widening 1.26; roster lineups at fill -0.45 | 1322 | 0.5849 | 0.5800 | -0.0049 [-0.0098, +0.0001] | tie |
| Pooled |  |  | 8919 | 0.6095 | 0.6064 | -0.0031 [-0.0047, -0.0016] | better |

### Version 5 with roster-based lineups, refitted every game day beside Vegas and Polymarket

On the games each market has a chance for. The markets are reported, never used to choose a setting or to judge.

| Season | Market | Games | Market log loss | Version 4 log loss | Candidate log loss |
| --- | --- | --- | --- | --- | --- |
| 2019-20 | Vegas | 1143 | 0.6107 | 0.6144 | 0.6135 |
| 2020-21 | Vegas | 1171 | 0.6189 | 0.6289 | 0.6312 |
| 2021-22 | Vegas | 1323 | 0.6067 | 0.6169 | 0.6115 |
| 2022-23 | Vegas | 1320 | 0.6264 | 0.6323 | 0.6298 |
| 2023-24 | Vegas | 1319 | 0.5833 | 0.5935 | 0.5877 |
| 2024-25 | Vegas | 1321 | 0.5858 | 0.5988 | 0.5949 |
| 2024-25 | Polymarket | 1319 | 0.5858 | 0.5987 | 0.5946 |
| 2025-26 | Vegas | 1322 | 0.5767 | 0.5849 | 0.5800 |
| 2025-26 | Polymarket | 1321 | 0.5767 | 0.5849 | 0.5800 |
| Pooled | Vegas | 8919 | 0.6007 | 0.6095 | 0.6064 |
| Pooled | Polymarket | 2640 | 0.5813 | 0.5918 | 0.5873 |

### Version 5 with roster-based lineups, refitted every game day: lineup minutes against the minutes played

Over the team-games with a box score, played minutes scaled to 240 a side. Minutes misplaced is half the summed gap between each player's predicted and played minutes: the minutes of a team-game the lineup put on the wrong players. Value error is the root mean square of the sum over players of (predicted - played) / 48 times the player's value, at each version's own values, in margin units.

| Season | Team-games | Version 4 minutes misplaced | Candidate minutes misplaced | Candidate minus version 4 [95%] | Version 4 value error | Candidate value error |
| --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2286 | 36.26 | 36.26 | +0.00 [+0.00, +0.00] | 0.210 | 0.209 |
| 2020-21 | 2330 | 38.63 | 38.34 | -0.29 [-1.02, +0.48] | 0.238 | 0.283 |
| 2021-22 | 2646 | 38.05 | 37.25 | -0.80 [-1.95, +0.35] | 0.213 | 0.234 |
| 2022-23 | 2640 | 37.30 | 36.11 | -1.19 [-2.37, -0.16] | 0.224 | 0.243 |
| 2023-24 | 2638 | 36.07 | 35.20 | -0.88 [-1.65, -0.16] | 0.232 | 0.244 |
| 2024-25 | 2642 | 37.61 | 35.59 | -2.02 [-2.97, -1.06] | 0.240 | 0.258 |
| 2025-26 | 2636 | 38.65 | 35.97 | -2.68 [-3.68, -1.82] | 0.239 | 0.259 |
| Pooled | 17818 | 37.52 | 36.36 | -1.16 [-1.54, -0.81] | 0.228 | 0.248 |

### Version 5 with roster-based lineups, refitted every game day against version 5 with roster-based lineups: log loss on real results

Each season is scored with the candidate's settings chosen from the seasons before it; the pooled row takes every scored game. The baseline is version 5 with roster-based lineups (scripts/candidates/v5-roster.ts), its settings chosen from the same seasons.

| Season | Settings chosen from | Candidate's settings | Games | Version 5 with roster-based lineups log loss | Candidate log loss | Candidate minus version 5 with roster-based lineups [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2015-16 to 2018-19 | on-court rating with ridge 1500, half-life 365 days and box prior 1, refitted every game day, at weight 0.08; SIGMA 2.928, early widening 0.97; roster lineups at fill -0.3 | 1143 | 0.6137 | 0.6135 | -0.0001 [-0.0007, +0.0005] | tie |
| 2020-21 | 2015-16 to 2019-20 | on-court rating with ridge 6000, half-life 1460 days and box prior 0.5, refitted every game day, at weight 0.14; SIGMA 3.171, early widening 0.98; roster lineups at fill -0.3 | 1171 | 0.6312 | 0.6312 | +0.0000 [-0.0004, +0.0004] | tie |
| 2021-22 | 2015-16 to 2020-21 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every game day, at weight 0.10; SIGMA 3.164, early widening 1.08; roster lineups at fill -0.15 | 1323 | 0.6117 | 0.6115 | -0.0002 [-0.0006, +0.0003] | tie |
| 2022-23 | 2015-16 to 2021-22 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every game day, at weight 0.12; SIGMA 3.202, early widening 1.15; roster lineups at fill -0.3 | 1320 | 0.6299 | 0.6298 | -0.0000 [-0.0005, +0.0004] | tie |
| 2023-24 | 2015-16 to 2022-23 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every game day, at weight 0.12; SIGMA 3.219, early widening 1.19; roster lineups at fill -0.45 | 1319 | 0.5875 | 0.5877 | +0.0002 [-0.0002, +0.0006] | tie |
| 2024-25 | 2015-16 to 2023-24 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every game day, at weight 0.14; SIGMA 3.227, early widening 1.21; roster lineups at fill -0.45 | 1321 | 0.5950 | 0.5949 | -0.0001 [-0.0005, +0.0003] | tie |
| 2025-26 | 2015-16 to 2024-25 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every game day, at weight 0.14; SIGMA 3.235, early widening 1.26; roster lineups at fill -0.45 | 1322 | 0.5801 | 0.5800 | -0.0001 [-0.0006, +0.0005] | tie |
| Pooled |  |  | 8919 | 0.6065 | 0.6064 | -0.0000 [-0.0002, +0.0001] | tie |

### Version 5 with roster-based lineups, refitted every game day against version 5 with roster-based lineups: lineup minutes against the minutes played

Over the team-games with a box score, played minutes scaled to 240 a side. Minutes misplaced is half the summed gap between each player's predicted and played minutes: the minutes of a team-game the lineup put on the wrong players. Value error is the root mean square of the sum over players of (predicted - played) / 48 times the player's value, at each version's own values, in margin units.

| Season | Team-games | Version 5 with roster-based lineups minutes misplaced | Candidate minutes misplaced | Candidate minus version 5 with roster-based lineups [95%] | Version 5 with roster-based lineups value error | Candidate value error |
| --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2286 | 36.26 | 36.26 | +0.00 [+0.00, +0.00] | 0.210 | 0.209 |
| 2020-21 | 2330 | 38.34 | 38.34 | +0.00 [+0.00, +0.00] | 0.283 | 0.283 |
| 2021-22 | 2646 | 37.25 | 37.25 | +0.00 [+0.00, +0.00] | 0.234 | 0.234 |
| 2022-23 | 2640 | 36.11 | 36.11 | +0.00 [+0.00, +0.00] | 0.243 | 0.243 |
| 2023-24 | 2638 | 35.20 | 35.20 | +0.00 [+0.00, +0.00] | 0.243 | 0.244 |
| 2024-25 | 2642 | 35.59 | 35.59 | +0.00 [+0.00, +0.00] | 0.258 | 0.258 |
| 2025-26 | 2636 | 35.97 | 35.97 | +0.00 [+0.00, +0.00] | 0.259 | 0.259 |
| Pooled | 17818 | 36.36 | 36.36 | +0.00 [+0.00, +0.00] | 0.248 | 0.248 |

### Version 5 with roster-based lineups, refitted every game day: settings from every finished season

Chosen from 2015-16 to 2025-26, the settings the season after them would run with: on-court rating with ridge 1500, half-life 365 days and box prior 0.5, refitted every game day, at weight 0.12; SIGMA 3.194, early widening 1.21; roster lineups at fill -0.45. They are the settings on file for the site.

### Version 5 with roster-based lineups: log loss on real results

Each season is scored with the candidate's settings chosen from the seasons before it; the pooled row takes every scored game. Version 4 is as the site ran it until the switch to version 5 (src/lib/inputs.ts modelInputs with no switches, src/lib/v4.ts V4) on the reports of Table 1, so its numbers differ from docs/model-v4.md's, which read the 5 PM reports. It keeps its own settings in every season, and its plan chose them with these seasons in view, so the comparison favours version 4.

| Season | Settings chosen from | Candidate's settings | Games | Version 4 log loss | Candidate log loss | Candidate minus version 4 [95%] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2019-20 | 2015-16 to 2018-19 | on-court rating with ridge 1500, half-life 365 days and box prior 1, refitted every 7 game days, at weight 0.08; SIGMA 2.928, early widening 0.97; roster lineups at fill -0.3 | 1143 | 0.6144 | 0.6137 | -0.0008 [-0.0038, +0.0020] | tie |
| 2020-21 | 2015-16 to 2019-20 | on-court rating with ridge 6000, half-life 1460 days and box prior 0.5, refitted every 7 game days, at weight 0.14; SIGMA 3.171, early widening 0.98; roster lineups at fill -0.3 | 1171 | 0.6289 | 0.6312 | +0.0023 [-0.0011, +0.0059] | tie |
| 2021-22 | 2015-16 to 2020-21 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every 7 game days, at weight 0.10; SIGMA 3.164, early widening 1.08; roster lineups at fill -0.15 | 1323 | 0.6169 | 0.6117 | -0.0052 [-0.0089, -0.0014] | better |
| 2022-23 | 2015-16 to 2021-22 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every 7 game days, at weight 0.12; SIGMA 3.202, early widening 1.15; roster lineups at fill -0.3 | 1320 | 0.6323 | 0.6299 | -0.0024 [-0.0063, +0.0017] | tie |
| 2023-24 | 2015-16 to 2022-23 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every 7 game days, at weight 0.12; SIGMA 3.219, early widening 1.19; roster lineups at fill -0.45 | 1319 | 0.5935 | 0.5875 | -0.0060 [-0.0100, -0.0016] | better |
| 2024-25 | 2015-16 to 2023-24 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every 7 game days, at weight 0.14; SIGMA 3.227, early widening 1.21; roster lineups at fill -0.45 | 1321 | 0.5988 | 0.5950 | -0.0038 [-0.0079, +0.0000] | tie |
| 2025-26 | 2015-16 to 2024-25 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every 7 game days, at weight 0.14; SIGMA 3.235, early widening 1.26; roster lineups at fill -0.45 | 1322 | 0.5849 | 0.5801 | -0.0048 [-0.0098, -0.0000] | better |
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
| 2019-20 | 2015-16 to 2018-19 | on-court rating with ridge 1500, half-life 365 days and box prior 1, refitted every 7 game days, at weight 0.08; SIGMA 2.928, early widening 0.97; roster lineups at fill -0.3 | 1143 | 0.6137 | 0.6137 | +0.0000 [+0.0000, +0.0000] | tie |
| 2020-21 | 2015-16 to 2019-20 | on-court rating with ridge 6000, half-life 1460 days and box prior 0.5, refitted every 7 game days, at weight 0.14; SIGMA 3.171, early widening 0.98; roster lineups at fill -0.3 | 1171 | 0.6317 | 0.6312 | -0.0005 [-0.0029, +0.0020] | tie |
| 2021-22 | 2015-16 to 2020-21 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every 7 game days, at weight 0.10; SIGMA 3.164, early widening 1.08; roster lineups at fill -0.15 | 1323 | 0.6112 | 0.6117 | +0.0005 [-0.0017, +0.0028] | tie |
| 2022-23 | 2015-16 to 2021-22 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every 7 game days, at weight 0.12; SIGMA 3.202, early widening 1.15; roster lineups at fill -0.3 | 1320 | 0.6309 | 0.6299 | -0.0011 [-0.0036, +0.0015] | tie |
| 2023-24 | 2015-16 to 2022-23 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every 7 game days, at weight 0.12; SIGMA 3.219, early widening 1.19; roster lineups at fill -0.45 | 1319 | 0.5898 | 0.5875 | -0.0023 [-0.0046, -0.0002] | better |
| 2024-25 | 2015-16 to 2023-24 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every 7 game days, at weight 0.14; SIGMA 3.227, early widening 1.21; roster lineups at fill -0.45 | 1321 | 0.5953 | 0.5950 | -0.0003 [-0.0039, +0.0029] | tie |
| 2025-26 | 2015-16 to 2024-25 | on-court rating with ridge 3000, half-life 730 days and box prior 0.5, refitted every 7 game days, at weight 0.14; SIGMA 3.235, early widening 1.26; roster lineups at fill -0.45 | 1322 | 0.5815 | 0.5801 | -0.0014 [-0.0051, +0.0021] | tie |
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

Chosen from 2015-16 to 2025-26, the settings the season after them would run with: on-court rating with ridge 1500, half-life 365 days and box prior 0.5, refitted every 7 game days, at weight 0.12; SIGMA 3.194, early widening 1.21; roster lineups at fill -0.45.
<!-- results:end -->
