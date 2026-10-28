# Duplicated code: site audit, October 28, 2026

The rule: one component or function per thing the site shows or works out, so a fix lands everywhere at once. This audit lists where the code breaks that rule, ranked by how likely the copies are to drift apart and cause a "fixed it here but not there" bug. Each entry names every copy, says whether a reason to keep the copies holds, and names what they should become.

An independent review produced the audit, and I spot-checked findings 1 and 2 against the code. Line numbers are from the working tree on October 28 and will move.

## Already fixed today

These copies were made or found during the game page work and are now one thing each:

- **Rating chart.** The home, team and game pages draw one `RatingChart`, on one scale, at one height (`lib/chart.ts` `seasonPlot`, `ratingScale`). The game page's copy is gone.
- **Upset badge.** It is now a single `UpsetBadge` component, replacing four copies.
- **Team page fixtures.** The team page's Coming up prices its games with `fixture()` and shows them with `FixtureList`, as the games page does, so a 50–50 game bolds the same side on both.
- **Shared styles.** The row hover (`.row-link`), the link over a whole tile or row (`.cover`) and the upset winner's gain (`.paid`) each live once, in `global.css`.

## Findings

### 2. Rating lines are drawn four times (high, drift already visible)

The points through each team's ratings are built in four places:

- `chart.ts` `seasonPlot`
- `LeagueTable.astro:67`
- `share/[image].png.ts:81`
- `about.astro:37`

The dotted trail after a team's run ends is worked out three times: RatingChart, LeagueTable and the share image. The "is there enough to chart" check is written four times.

**Visible drift:**

- The About page draws its lines through unrounded ratings. Everywhere else draws through the displayed, rounded ones.
- The About page draws the other teams' lines 1px wide, which the main chart's own comment says shimmers.
- The share image spaces its dots differently.

**Fix:** move into `chart.ts`:

- `linePoints(series, x, y)`
- `runEnd(model)` and `runPath(points, end)`
- `charted(model)`

Let `seasonPlot` take a width and height so the share image and the About page use it.

### 3. Chart line CSS is copied between RatingChart and LeagueTable (high)

These rules are near-identical in both components:

- line, run, grid and marker strokes
- the "1.5px, not 1" comment
- the dotted-trail dash
- the hover tint and the 0.4 dimming
- date-label placement
- the mark label's offset

The dash `1 3.5` appears four times and the opacity `0.55` four times.

**Visible drift:** date labels are 12px in one and 11px in the other. The home page shows one or the other depending on screen width.

**Keep separate?** For the layout, yes: the league table's lines must end on its rows. For the line layer and its styles, no.

**Fix:** a `SeasonLines` component for the polylines and runs. Move the line styles into `global.css` under `[data-chart]`, with tokens for the dash, the opacity and the dim.

### 4. Rating ranges and tick steps are worked out three times (medium-high)

- **Ranges.** `facts.ts` `ratingRange` and `chart.ts` `seasonRange` both find the season's lowest and highest rating.
- **Tick steps.** There are three lists of steps: `chart.ts` `ratingTicks`, LeagueTable and the About page.

**Fix:** one range function with a rounding option, and LeagueTable filtering `ratingTicks` the way `ratingScale` does.

### 5. "tied 9th" is written in three places, and ties are detected in four (medium-high)

- **Wording.** `teams.ts` `place()`, `GameHeader.astro` and the chart readout script (`highlight.ts`).
- **Tie detection.** `teams.ts`, `game.ts`, `chart.ts` and `readout.ts`.

**Fix:** a `placeLabel(rank, tied)` in `format.ts`, and possibly `ranksOf` returning ties.

### 6. Team game rows: Previous 5 and the team game log (medium-high)

These are copied between the two:

- the win row's ink
- the upset badge's hover title
- the upset rule `us.won && upset(...)`
- the at/vs wording

**Fix:**

- Add `upset` to `TeamGame` (`teams.ts`), so `game.ts`'s `Earlier` type goes away.
- Move `.row-link.won` into `global.css`.
- Give `UpsetBadge` a `chance` prop that writes its own title.
- Add an at/vs helper in `format.ts`.

### 7. "X at Y" wording is written about eight times (medium)

It appears in the game page title, the tiles' labels and names, the fixture tiles, the About page and `meta.ts`.

**Fix:** one `matchup()` helper.

### 8. The About page hand-copies the fixture tile (medium)

`about.astro:289` copies `FixtureList`'s tile markup and CSS. That's why the About example has no link to its game.

**Fix:** a `FixtureTile` component, as `ResultTile` already is.

### 9. Ink emphasis, team-name link hovers and prose links (medium)

"In ink, weight 500" is defined five times under different names: `.fav` three times, `.ink` and `.win`. The team-name link hover is defined three times. Links in body text have three variants, and one has no hover.

**Fix:** global `.ink`, `a.nm:hover` and prose-link rules.

### 10. Table chrome is written three times (medium)

The header cell, row rule and last-row rules are repeated in three files: LeagueTable, `seasons.astro` and the team page.

**Visible drift:** the header row is 18px tall in one and 32px in the others.

**Fix:** a shared table class in `global.css`.

### 11. Phone two-line rows (medium)

The hidden-on-desktop second line (`.sub`) is defined in LeagueTable and the team page. They use different line heights, and 13px isn't a token.

**Fix:** global `.sub` and `.opt` rules and a font-size token.

### 12. Whole-row links: three treatments (medium)

The three are:

- the shared `.row-link`
- LeagueTable's focus ring
- `seasons.astro`'s own stretched link

**Keep separate?** The league table's rowspan cell justifies its own ring. The seasons page has no reason to differ.

### 13. Headings, tab navs, control radius (medium)

- **Page heading.** The h1 style is written three times: Base, Panel and GameHeader.
- **Card heading.** It's written twice.
- **Selected tab.** The tab style (the site nav and the games-page month switch) is identical in two places.
- **Control radius.** The 8px control radius is written twice.
- **Card chrome.** Previous 5 re-implements Panel's card to get team-colour edges.

**Fix:**

- Global heading and tab rules.
- A `--radius-control` token.
- An edge option on Panel.

### 14. Empty states and notes (medium-low)

- **Empty-state class.** The `.empty` style is in three places.
- **"No games yet" copy.** It's written four ways, one without a full stop.
- **Notes under tables.** These have two spacings.

**Fix:** an `Empty` component with one copy string, and a global `.note`.

### 15. Facts written twice (medium-low)

- **Chart label maths.** It hard-codes the 640px breakpoint and the page padding minimums from `global.css`.
- **640px.** It appears in 13 media queries. The standard fix is `@custom-media`.
- **11px.** It appears five times with no token.
- **Visually-hidden text.** It's written twice.
- **Logo.** The path is in both `Base.astro` and `public/favicon.svg`.

### 16. Two wordings for a game's stage (medium-low)

The games page day headings split ESPN's raw note ("NBA Finals · Game 5"). The game page and team log use `stage()` ("Finals game 5").

**Fix:** use `stage()` everywhere.

### 17. Two rules for telling two teams' colours apart (decision)

- **Chance bars.** `pairStyles` measures distance in RGB.
- **Game page.** `gameColours` measures it in OKLab.

One matchup can show different colours on its tile and on its game page. That may be fine for a thin bar against a filled block, but it should be a decision rather than an accident. The sRGB conversion is also written twice inside `tint.ts`.

### 18. Low

- **Short names.** They're read two different ways.

## Checked and clean

- **Formatting.** Dates and numbers are formatted only in `format.ts`.
- **URLs.** Every URL goes through `routes.ts`.
- **Times and badges.** `LocalTime` and `UpsetBadge` are each the only one of their kind.
- **Chart readout.** It's shared by both charts.
- **Upset rule.** The rule itself lives only in `facts.ts`.
- **Share image colours.** The share image reads its colours from `global.css`.
- **Page paths.** All page paths come from `season.ts`.
- **Old-model baseline.** `scripts/elo538.ts` copies the win-chance formula on purpose, as a frozen baseline.
