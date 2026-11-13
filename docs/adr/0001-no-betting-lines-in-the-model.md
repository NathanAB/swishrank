# No betting lines in the model

The model is built and judged on game results alone. No sportsbook or prediction-market number trains it, tunes it, chooses between versions, or goes into a prediction, because the site's claim is an independent forecast and a model taught by the market can at best copy it. Vegas and Polymarket stay on the backtest's tables as comparisons, each scored against the same results as the model.

One exception: each team's preseason seed comes from sportsbooks' win totals. The season's first games are the hardest to predict and nothing else on file does that job yet. A seed built from the model's own player ratings replaces it once one scores at least as well.

## Considered options

Decided on 2026-11-13, with these measured on 2018-19 to 2025-26, each fitted on earlier seasons only:

- A correction trained on past closing lines, with no line read at prediction time: -0.0012 log loss [-0.0024, +0.0001]. Rejected.
- The same with each team's earlier lines as an input: -0.0030. Rejected.
- Choosing settings by distance to the market's chance instead of by results: intervals 4 to 8 times tighter, but the settings that moved closest to the market showed no gain on results. Rejected.

## What others do

FiveThirtyEight's NBA forecast was built from its own player ratings and depth charts (https://fivethirtyeight.com/features/how-were-improving-our-nba-forecast-for-2022-23). Neil Paine's current forecast offers a mode that blends its Elo with FanDuel's odds (https://neilpaine.substack.com/p/2025-26-nba-elo-forecast-and-player). This repo follows the first practice and departs from the second, giving up the measured gains above.
