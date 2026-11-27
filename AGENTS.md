## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Checking a change

A full `npm run build` writes about 15,000 pages and takes over 40 minutes. Don't run it to check a change; the deploy runs it on every push to `main`.

- **One page in the dev server:** start `astro dev --background`, then fetch or open the page.
- **One page in a real build, about a minute:** build a scratch copy that holds only the pages you changed. This catches data that loads in the dev server and not in a bundle.

  ```
  git worktree add --detach <scratch> HEAD
  ln -s "$(cd "$(git rev-parse --git-common-dir)/.." && pwd)/node_modules" <scratch>/node_modules
  cd <scratch>
  rm -rf 'src/pages/[...season]' src/pages/players src/pages/share src/pages/lines src/pages/seasons.astro
  npx astro build
  ```

  Keep any of those directories that holds a page you changed. Read `dist/<page>/index.html`, then run `git worktree remove --force <scratch>`.
- **Tests:** `node --test <file>` for the file you changed, and `npm test` (about three minutes) once before the pull request. The deploy waits on `npm test`, so a test on real data must stay green as the season in progress gains games: bound a finished season, or assert a count that only grows.
- **Types:** the repo has no type-check command. `astro check` isn't installed and waits on an install prompt until it times out, so don't run it; the scratch build is the type gate. A scratch build that keeps `src/pages/[...season]/teams/` takes over 4 minutes, so run it in the background.
- **Deploys:** each push to `main` starts a deploy of about 9 minutes, and each score refresh one of 2 to 4, nearly all of it `npm run build`. Deploys queue. Land related changes in one pull request.
- **Pull requests:** no workflow runs on a pull request, so `gh pr checks` reports none and a CI watch only times out. The local `npm test` is the gate before merge; the deploy reruns it on `main`.

## Scoring a model change

A change to the model is a candidate: one file in `scripts/candidates/` whose default export is a `Candidate` (`scripts/past-seasons.ts`; `scripts/candidates/v4.ts` is the example). `docs/adr/0002` is the rule it is judged by.

- **One candidate, printed only:** `npm run backtest:v5 -- <file name without .ts>`.
- **Every candidate, and the results part of `docs/model-v5.md` rewritten:** `npm run backtest:v5`. Version 4 alone takes about a minute, and the candidates that run version 5's search (`v5`, `v5-roster`, `v5-daily`) about 12 more. `v5-daily` is the site's: `V5` in `src/lib/v5.ts` must match what it chooses.
- **A candidate against a second baseline:** export `against`, a list of candidate file names, from its file (`scripts/candidates/v5-roster.ts` is the example).
- **After a change to roster-based lineups (`src/lib/roster-lineups.ts`):** `npm run roster-check`, about 30 seconds. It prints the learned rates and the lineup measures to hold beside the port's column in `docs/model-v5.md` (The lineups' port against the prototype).

## Changing the site's model

`SITE` in `src/lib/site.ts` names the version the site runs. A script that means the site's model builds its inputs with `siteInputs` (`src/lib/inputs.ts`), then calls `compute`. A script that means a frozen version reads that version's record, such as `V4` in `src/lib/v4.ts`, and prices with its SIGMA.

After a change to `SITE`, or to anything the site's ratings read:

- Rebuild every finished season's title race with `npm run odds -- --all` (about 20 seconds a season) and commit `src/data/odds/`. No workflow rebuilds these files and no test compares them with the model.
- Reread `src/pages/about.astro` and the fine print of `src/pages/record.astro` against the new settings, then update the string that `src/lib/model-copy.test.ts` pins.

## Play-by-play record

`scripts/stints/<season>.json` is written by code, never by hand. After a change to the rebuild in `src/lib/stints.ts`, run `npm run stints -- --cache <dir>` and commit the files it rewrites with the change. It takes 2 to 14 minutes from ESPN, and under 2 minutes once `<dir>` holds the summaries. The format is in `src/lib/stints.ts` (`Stint`).

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Text

Never force text to wrap. Text runs the full width of its container. Don't shorten lines with `max-width` on paragraphs, headings or captions (in `ch`, `em`, `px` or `%`), don't use `text-wrap: balance` or `text-wrap: pretty`, and don't put manual line breaks (`<br>`) inside sentences. This holds for every page, component, chart label and prototype, at every screen size.
