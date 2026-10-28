# SwishRank

Season-only Elo ratings for the 30 NBA teams: https://swishrank.com/

Every team starts each season at 1000, the league average, and nothing carries over from last year. Each morning the ratings are fitted again to every game so far by least squares, like SRS or Massey ratings: margins count with diminishing returns, home court is worth a fixed edge measured over past seasons, and each team is pulled toward average until its games say otherwise. [docs/model.md](docs/model.md) holds the pre-registered backtest that chose every setting. The site has the league table with every team's rating by day drawn into it, for the whole league or one conference (`/east/`, `/west/`), a games page with every result and the week ahead's win chances, a page per game with both teams' ratings and last five games, a page per team, and the same views for last season.

## How it updates

A GitHub Action ([deploy.yml](.github/workflows/deploy.yml)) runs three times a day: at 05:17 UTC (just after midnight Eastern in winter) once most games have ended, at 10:17 UTC once the last West Coast game is in, and at 15:17 UTC as a retry. It pulls the season's games from ESPN's public scoreboard, commits them to `src/data/games/` when they change, rebuilds the site and deploys it to Cloudflare. It also runs on every push to `main`.

## Run it locally

```sh
npm install
npm run fetch   # pull the current season from ESPN
npm test        # the model, its guard against the old Elo, and page logic
npm run backtest  # rerun the backtest and rewrite docs/model.md's results
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
2. Run `npm run fetch` and push.
3. GitHub pauses scheduled workflows in a public repo after 60 days without activity, which can happen over the summer. If the morning refresh has stopped, turn it back on with `gh workflow enable deploy.yml`.
