## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

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
