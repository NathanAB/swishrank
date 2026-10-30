# SwishRank

Elo ratings for the 30 NBA teams: https://swishrank.com/

Teams sit around 1000, and only the gap between two ratings matters. Every team starts each season from a seed set by sportsbooks' preseason win totals. Each morning the ratings are fitted again to every game so far by least squares, like SRS or Massey ratings: margins count with diminishing returns, home court is worth a fixed edge measured over past seasons, a team on the second night of a back-to-back gives up a fixed edge, and each team is pulled toward its seed, less as the season goes on. Every player has a value too, pulled toward his box-score record over past seasons, and a team's rating counts its usual rotation, the players from its last 10 games. [docs/model.md](docs/model.md) and [docs/model-v2.md](docs/model-v2.md) hold the pre-registered backtests that chose every setting. The site has the league table with every team's rating by day drawn into it and each team's move over the past week, under a line on the week's biggest moves, for the whole league or one conference (`/east/`, `/west/`), a games page with every result and the week ahead's win chances, a page per game with both teams' ratings and last five games, a page per team, and the same views for last season.

## How it updates

A GitHub Action ([deploy.yml](.github/workflows/deploy.yml)) runs once a day at 08:17 UTC, once the last West Coast game is in, started by the Cloudflare Worker in [cron/](cron/), with GitHub's own schedule at 12:17 UTC as a backup. It pulls the season's games from ESPN's public scoreboard, commits them to `src/data/games/` when they change, rebuilds the site and deploys it to Cloudflare. It also runs on every push to `main`.

## Run it locally

```sh
npm install
npm run fetch   # pull the current season from ESPN
npm test        # the model, its settings against docs/model-v2.md's choice, and page logic
npm run backtest  # rerun the backtest and rewrite docs/model.md's results
npm run backtest:v2  # the same for version 2 and docs/model-v2.md
npm run dev     # http://localhost:4321/
```

`npm run fetch 2025-26` re-pulls a finished season.

## Where things live

- `src/lib/elo.ts` is the rating model. Everything else reads from what it computes.
- `scripts/backtest.ts` scores the model against the old Elo (`scripts/elo538.ts`) on past seasons.
- `src/data/seasons.json` lists the seasons. The one without an `end` date is the current season and lives at the site root; older seasons live under their id, such as `/2025-26/`.
- `scripts/fetch-season.mjs` turns ESPN's scoreboard into `src/data/games/<season>.json`.
- `src/pages/` holds the routes, and `src/components/` the table, chart and game lists they share.
- `src/pages/share/` draws each season's and each team's link-preview picture at build time; `src/lib/meta.ts` holds the site's name and each page's title and description.

## Each new season

1. Give the finished season an `end` date in `src/data/seasons.json` and add the new season with its opening-night `start` date at the top.
2. Before opening night, enter each team's preseason win total in `src/data/preseason/<season>.json`. Without it, a team starts from 0.7 times its rating at the end of the season before.
3. Run `npm run fetch` and push.
4. GitHub pauses scheduled workflows in a public repo after 60 days without activity, which can happen over the summer. If the morning refresh has stopped, turn it back on with `gh workflow enable deploy.yml`.
