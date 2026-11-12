## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Checking a change

A full `npm run build` writes about 15,000 pages and takes over 40 minutes. Don't run it to check a change; the deploy runs it on every push to `main`.

- **One page in the dev server:** start `astro dev --background`, then fetch or open the page.
- **One page in a real build, about 15 seconds:** build a scratch copy that holds only the pages you changed. This catches data that loads in the dev server and not in a bundle.

  ```
  git worktree add --detach <scratch> HEAD
  ln -s "$PWD/node_modules" <scratch>/node_modules
  cd <scratch>
  rm -rf 'src/pages/[...season]' src/pages/players src/pages/share src/pages/lines src/pages/seasons.astro
  npx astro build
  ```

  Keep any of those directories that holds a page you changed. Read `dist/<page>/index.html`, then run `git worktree remove --force <scratch>`.
- **Tests:** `node --test <file>` for the file you changed, and `npm test` (about three minutes) once before the pull request.
- **Deploys:** each push to `main` starts a deploy of about 20 minutes, and deploys queue. Land related changes in one pull request.

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
