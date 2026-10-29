# Duplicated code: site audit, October 28, 2026

The rule: one component or function per thing the site shows or works out, so a fix lands everywhere at once. This audit lists where the code still breaks that rule after the game page work, ranked by how likely the copies are to drift apart. Each entry names the copies and what they should become.

Two independent reviews checked an earlier draft of this audit against the code. Their corrections are folded in.

## Fixed

- **Rating lines.** Every drawing of a season's ratings is one plot at its own size (`lib/chart.ts` `seasonPlot`): the home, team and game pages' `RatingChart`, the league table, the share images and How it works. Each line is drawn once, solid through its games and dotted after (`runAndTrail`). The league table's scale is flush, so its top and bottom ratings sit level with its first and last rows.
- **Chart line styles.** Widths, the dotted dash, the faded opacity and the dim are in `global.css`, under `[data-chart]` and as `--line-dash`, `--line-faded` and `--line-dim`. The share image reads the faded opacity from there too.
- **Rating range and ticks.** The charts, the league table and the share images take a season's range from `facts.ts` `ratingRange`, and every drawing's ticks from `chart.ts` `ratingTicks`.
- **Rows of a team's games.** The game page's Previous games is one `TeamGames` list, with its hover styles inside it. The team page's history (`components/history/History.astro`) copies its columns and hover styles, since each of its rows is a button that opens the day's walk rather than a link.
- **Game tiles.** A game still to play is one `FixtureTile`, as a final is one `ResultTile`, on the games page.
- **Upset badge.** One `UpsetBadge`, replacing four copies. Whether a team's win was an upset is worked out once per game, in `teams.ts` `teamGames` and `game.ts` `gameView`.
- **Places and ties.** "tied 9th" is `format.ts` `placeLabel`, and a tie is `teams.ts` `tied`. The chart readout's rank format is written and read in `readout.ts`.
- **Matchups.** "Pacers at Thunder" is `format.ts` `matchup`, and "at" or "vs" is `between`, in titles, tiles, labels, URLs and descriptions.
- **A game's stage.** "Finals game 5" is `teams.ts` `stage()`, on the games page's day headings, the game page and the team log.
- **Records and form.** A list's wins and losses is `teams.ts` `recordOf`, and five games of form is `RECENT`.
- **Fixtures.** The team page prices its next games with `fixture()` and groups them with `fixtureDays`, which `nextDays` also uses.
- **Empty states and notes.** A list or chart with nothing in it is one `Empty`, "No games yet." unless the page says otherwise. Small print under a table or a game is one global `.note`.
- **Page titles.** One h1 style, in `global.css`.

## Still to do

### 1. One team, three colour rules (decision)

The chance bars (`tint.ts` `pairStyles`, RGB distance), the home chart (`lineColor`, contrast-lifted HSL) and the game and team pages (`gamePaint` and `teamPaint`, OKLab) each pick a team's colour their own way. A team's page and its game pages now agree; its tile and its home-chart line can differ from both. The sRGB conversion is also written twice in `tint.ts`.

### 2. Ink emphasis, team-name hovers and prose links (medium)

"In ink, weight 500" is defined three times under two names (`.fav` twice, `.win`). The team-name link hover is written twice. Body-text links have three variants, one without a hover.

**Fix:** global `.ink`, `a.nm:hover` and prose-link rules.

### 3. Table chrome and whole-row links (medium)

The header cell, row rule and last-row rules are repeated in LeagueTable and `seasons.astro`, with header rows 18px and 32px tall. `seasons.astro` makes its own stretched-link rows rather than using the one the game tiles use.

### 4. Cards, tabs and breakpoints (medium)

- `PreviousGames` re-implements Panel's card to get its team-colour edges. An edge option on Panel would end that.
- The selected-tab style (the site nav and the games-page month switch) is written twice, as is the 8px control radius.
- 640px appears in 11 media queries, and 1023/1024px media queries are in four files. CSS `@custom-media` would name them once, but browsers don't support it yet without a build step.
- 11px, and most of the game and team pages' large type (40, 48, 64px), have no token.

### 5. How it works' own copies (medium)

- Step 5 (`explain/Matchup.astro`) draws its game's names row with a copy of `FixtureTile`'s styles, and its script redraws `ChanceBar` by reaching into its markup.
- Step 4 (`explain/DayOff.astro`) draws its two games itself, side by side, rather than as `ResultTile`s.
- Step 1 (`explain/SeasonFan.astro`) repeats the chart readout in `scripts/highlight.ts`, and has drifted from it: its readout keeps 24px from a fingertip, the original 12px.

**Fix:** a client-side update for `FixtureTile` and `ChanceBar`, a side-by-side `ResultTile`, and one readout both charts use.

### 6. Low

- Visually hidden text is styled twice.
- The logo's path is in both `Base.astro` and `public/favicon.svg`.
- "No games yet" is still written by hand in two places that are not empty states: a team's line in `PreviousGames`, and the seasons table's leader cell, as a label without a full stop.

## Checked and clean

- **Formatting.** Dates and numbers are formatted only in `format.ts`.
- **URLs.** Every URL goes through `routes.ts`, and every page path comes from `season.ts`.
- **Upset rule.** The rule lives only in `facts.ts`.
- **Share image colours.** The share image reads its colours from `global.css`.
- **Old-model baseline.** `scripts/elo538.ts` copies the win-chance formula on purpose, as a frozen baseline.
