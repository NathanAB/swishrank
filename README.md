# NBA Elo Ratings

Season-only Elo ratings for the 30 NBA teams: https://nathanab.github.io/nba-elo/

Every team starts each season at 1500 and nothing carries over from last year. After each game the winner takes points from the loser, using FiveThirtyEight's NBA formula (K = 20, 100 points for home court, a margin-of-victory multiplier). The site has the league table, results, the week's fixtures with win chances, a page per team, and the same views for last season.

## How it updates

A GitHub Action ([deploy.yml](.github/workflows/deploy.yml)) runs every morning at 10:00 UTC. It pulls the season's games from ESPN's public scoreboard, commits them to `src/data/games/` when they change, rebuilds the site and deploys it to GitHub Pages. It also runs on every push to `main`.

## Run it locally

```sh
npm install
npm run fetch   # pull the current season from ESPN
npm test        # Elo math and page logic
npm run dev     # http://localhost:4321/nba-elo/
```

`npm run fetch 2025-26` re-pulls a finished season.

## Where things live

- `src/lib/elo.ts` is the rating model. Everything else reads from what it computes.
- `src/data/seasons.json` lists the seasons. The one without an `end` date is the current season and lives at the site root; older seasons live under their id, such as `/2025-26/`.
- `scripts/fetch-season.mjs` turns ESPN's scoreboard into `src/data/games/<season>.json`.
- `src/pages/` holds the routes, and `src/components/` the table, chart and game lists they share.

## Each new season

1. Give the finished season an `end` date in `src/data/seasons.json` and add the new season with its opening-night `start` date at the top.
2. Run `npm run fetch` and push.
3. GitHub pauses scheduled workflows in a public repo after 60 days without activity, which can happen over the summer. If the morning refresh has stopped, turn it back on with `gh workflow enable deploy.yml`.
