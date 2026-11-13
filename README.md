# SwishRank

Elo ratings for the 30 NBA teams: https://swishrank.com/

Teams sit around 1000, and only the gap between two ratings matters. Every team starts each season from a seed set by sportsbooks' preseason win totals. Each morning the teams that played the day before are fitted again to all their games so far by least squares, like SRS or Massey ratings, each game counting the opponent as it stood before that game, so a team's rating moves only on its own game days and only for its own results: margins count with diminishing returns, home court is worth an edge measured each season over the three seasons before, a team on the second night of a back-to-back gives up a fixed edge, and each team is pulled toward its seed, less as the season goes on. Every player has a value too, pulled toward his box-score record over past seasons, a rookie's more loosely so his results move him sooner, and a team's rating counts its usual rotation, the players from its last 10 games, less those the morning's injury report lists as out for weeks. A game's chances read the NBA's official injury report, the latest saved before its tip-off: they leave out the players it lists as out or doubtful, count a questionable player at half his minutes, bring back a listed player who missed his team's last game, and count the minutes of the players left out a little below the rest of the lineup; a team the report does not cover keeps the players of its last game less those ESPN's morning report lists as out. [docs/model.md](docs/model.md), [docs/model-v2.md](docs/model-v2.md), [docs/model-v3.md](docs/model-v3.md) and [docs/model-v4.md](docs/model-v4.md) hold the pre-registered backtests that chose every setting. The site runs version 4 since 2026-11-02. A new version goes on the site when it beats the current one on past seasons its settings never saw: every setting is chosen from earlier seasons only, then scored on later ones, season by season, and the 95% interval of the log loss difference must lie clear of zero. A part too small to show in log loss goes in when a direct measure of it against what happened improves on unseen seasons and log loss is no worse ([docs/adr/0002-versions-are-judged-on-past-seasons.md](docs/adr/0002-versions-are-judged-on-past-seasons.md)). Versions 2 to 4 were each to be confirmed on a season still to be played. Since 2026-11-13 those confirmations are a running record: their backtests keep logging the new games, and no result there keeps or switches the site's model. The site has the league table with every team's rating by day drawn into it and each team's move over the past week, under a line on the week's biggest moves, for the whole league or one conference (`/east/`, `/west/`), a games page with every result and the week ahead's win chances, a page per game with both teams' ratings and last five games, a page per team, and the same views for last season. Version 4 ([docs/model-v4.md](docs/model-v4.md)) prices each game from the NBA's official injury report, saved every half hour until tip-off, reading every status on it, counts a missing player's minutes below the rest of his team's lineup, and starts a top-three draft pick's rookie rating from the level top-three picks have played at instead of replacement level. Each morning the rest of the season is also played out 20,000 times from the day's ratings ([docs/projections.md](docs/projections.md)): the Odds tab (`/odds/`) has every team's projected record, how its season ends (a top-6 seed, the play-in or the lottery) and its chances of the playoffs and the title, each team's page has its projections, and each season's home has its title race, day by day.

## How it updates

A GitHub Action ([deploy.yml](.github/workflows/deploy.yml)) runs once a day at 08:17 UTC, once the last West Coast game is in, started by the Cloudflare Worker in [cron/](cron/), with GitHub's own schedule at 12:17 UTC as a backup. It pulls the season's games from ESPN's public scoreboard, commits them to `src/data/games/` when they change, rebuilds the site and deploys it to Cloudflare. It also runs on every push to `main`, and after each NBA injury report that [nba-report.yml](.github/workflows/nba-report.yml) saves, as often as every half hour on game days, so each game's chances read the latest report.

GitHub delays and drops scheduled runs too, so the same Worker starts [nba-report.yml](.github/workflows/nba-report.yml): every half hour through each game day it checks ESPN's scoreboard for a game still to tip off, and if there is one it starts the workflow. A few runs on GitHub's own schedule are its backup. To change the Worker, run `npx wrangler deploy` in `cron/`.

## Run it locally

```sh
npm install
npm run fetch   # pull the current season from ESPN
npm test        # the model, its settings against docs/model-v2.md's to docs/model-v4.md's, and page logic
npm run backtest  # rerun the backtest and rewrite docs/model.md's results
npm run backtest:v2  # the same for version 2 and docs/model-v2.md
npm run backtest:v3  # version 3 against version 2, and docs/model-v3.md's confirmation log
npm run backtest:v4  # version 4 against version 3, and docs/model-v4.md's confirmation log
npm run backtest:projections  # the odds' drift, chosen and scored on past seasons, for docs/projections.md
npm run odds -- 2026-27  # a finished season's title race, for src/data/odds/
npm run dev     # http://localhost:4321/
```

`npm run fetch 2025-26` re-pulls a finished season.

## Where things live

- `src/lib/elo.ts` is the rating model. Everything else reads from what it computes.
- `scripts/backtest.ts` scores the model against the old Elo (`scripts/elo538.ts`) on past seasons.
- `src/lib/home.ts`, `src/lib/report-lineup.ts` and `src/lib/rookies.ts` hold version 3, which version 4 builds on and `scripts/backtest-v3.ts` scores against version 2, frozen as `V2` in `scripts/evaluate.ts`. `src/lib/v3.ts` freezes version 3's settings.
- `src/lib/v4.ts`, `src/lib/nba-report.ts` and `src/lib/draft.ts` hold version 4, the site's model, which `src/lib/inputs.ts` feeds to `src/lib/elo.ts` and `scripts/backtest-v4.ts` scores against version 3. `.github/workflows/nba-report.yml`, started by the Worker in `cron/` every half hour while a game is still to tip off, runs `scripts/fetch-nba-report.ts`, saving the NBA's injury report onto the games still to come in `src/data/nba-reports/<season>.json`, and starts the deploy when it saves one; `scripts/nba-report-history.ts` built the seasons before 2026-27 from the league's archive.
- `src/data/seasons.json` lists the seasons. The one without an `end` date is the current season and lives at the site root; older seasons live under their id, such as `/2025-26/`.
- `scripts/fetch-season.mjs` turns ESPN's scoreboard into `src/data/games/<season>.json`.
- `src/pages/` holds the routes, and `src/components/` the table, chart and game lists they share.
- `src/lib/project.ts` plays out the rest of a season; `src/lib/season-odds.ts` runs it for the pages, with the schedule past the games file's two weeks from `src/data/schedule/` and each finished season's title race from `src/data/odds/`.
- `src/lib/heatmap.ts` lays out each team page's players: compute()'s `players` split of every shown rating, as a treemap from `src/lib/treemap.ts`.
- `src/pages/share/` draws each season's and each team's link-preview picture at build time; `src/lib/meta.ts` holds the site's name and each page's title and description.

## Each new season

1. Give the finished season an `end` date in `src/data/seasons.json` and add the new season with its opening-night `start` date at the top.
2. Before opening night, enter each team's preseason win total in `src/data/preseason/<season>.json`. Without it, a team starts from 0.7 times its rating at the end of the season before.
3. Run `npm run odds -- <finished season>` to keep the finished season's title race in `src/data/odds/`; a test fails until it is there.
4. Run `npm run fetch` and push.
5. GitHub pauses scheduled workflows in a public repo after 60 days without activity, which can happen over the summer. If the morning refresh has stopped, turn it back on with `gh workflow enable deploy.yml`, and the injury report's with `gh workflow enable nba-report.yml`.
