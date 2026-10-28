# Duplicated code: site audit, October 28, 2026

The rule: one component or function per thing the site shows or works out, so a fix lands everywhere at once. This audit lists where the code still breaks that rule after the game page work, ranked by how likely the copies are to drift apart. Each entry names the copies and what they should become.

Two independent reviews checked an earlier draft of this audit against the code. Their corrections are folded in.

## Fixed in the game page work

- **Rating chart.** The home, team and game pages draw one `RatingChart` on one plot (`lib/chart.ts` `seasonPlot`). Each line is drawn once, solid through its games and dotted after (`runAndTrail`, which the league table uses too).
- **Rating range.** The charts, the league table and the share images take a season's range from `facts.ts` `ratingRange`.
- **Rows of a team's games.** The game page's Previous games and the team page's game log are one `TeamGames` list, with its hover styles inside it.
- **Upset badge.** One `UpsetBadge`, replacing four copies. Whether a team's win was an upset is worked out once per game, in `teams.ts` `teamGames` and `game.ts` `gameView`.
- **Places and ties.** "tied 9th" is `format.ts` `placeLabel`, and a tie is `teams.ts` `tied`. The chart readout's rank format is written and read in `readout.ts`.
- **Matchups.** "Pacers at Thunder" is `format.ts` `matchup`, and "at" or "vs" is `between`, in titles, tiles, labels, URLs and descriptions.
- **Records and form.** A list's wins and losses is `teams.ts` `recordOf`, and five games of form is `RECENT`.
- **Fixtures.** The team page prices its next games with `fixture()` and groups them with `fixtureDays`, which `nextDays` also uses.
- **Page titles.** One h1 style, in `global.css`.

## Still to do

### 1. Rating lines are drawn three ways (high)

`seasonPlot` draws the rating charts. The league table (`LeagueTable.astro`), the share image (`share/[image].png.ts`) and How it works (`about.astro`) each build their own points, and the share image works out its own dotted trail.

**Visible drift:** How it works draws through unrounded ratings, and its other teams' lines are 1px wide, which the chart's own comment says shimmers.

**Fix:** let `seasonPlot` take a width and height, and use it in all three.

### 2. Chart line styles are copied between RatingChart and LeagueTable (high)

The stroke widths, the "1.5px, not 1" rule, the dotted dash (`1 3.5`), the faded opacity (`0.55`), the 0.4 dimming and the date labels are written in both. Date labels are 12px in one and 11px in the other.

**Fix:** move the line styles into `global.css` under `[data-chart]`, with tokens for the dash, the opacity and the dim.

### 3. Tick steps are listed three times (medium)

`chart.ts` `ratingTicks`, `LeagueTable.astro` and `about.astro` each list their own rating steps.

**Fix:** LeagueTable and How it works filter `ratingTicks`, as `ratingScale` does.

### 4. One team, three colour rules (decision)

The chance bars (`tint.ts` `pairStyles`, RGB distance), the home chart (`lineColor`, contrast-lifted HSL) and the game and team pages (`gamePaint` and `teamPaint`, OKLab) each pick a team's colour their own way. A team's page and its game pages now agree; its tile and its home-chart line can differ from both. The sRGB conversion is also written twice in `tint.ts`.

### 5. How it works hand-copies the fixture tile (medium)

`about.astro` copies `FixtureList`'s tile markup and CSS, which is why its example links to no game.

**Fix:** a `FixtureTile` component, as `ResultTile` already is.

### 6. Ink emphasis, team-name hovers and prose links (medium)

"In ink, weight 500" is defined four times under two names (`.fav` three times, `.win`). The team-name link hover is written three times. Body-text links have three variants, one without a hover.

**Fix:** global `.ink`, `a.nm:hover` and prose-link rules.

### 7. Table chrome and whole-row links (medium)

The header cell, row rule and last-row rules are repeated in LeagueTable and `seasons.astro`, with header rows 18px and 32px tall. `seasons.astro` makes its own stretched-link rows rather than using the one the game tiles use.

### 8. Cards, tabs and breakpoints (medium)

- `PreviousGames` re-implements Panel's card to get its team-colour edges. An edge option on Panel would end that.
- The selected-tab style (the site nav and the games-page month switch) is written twice, as is the 8px control radius.
- 640px appears in 11 media queries, and 1023/1024px media queries are in four files. CSS `@custom-media` would name them once, but browsers don't support it yet without a build step.
- 11px, and most of the game and team pages' large type (40, 48, 64px), have no token.

### 9. Empty states and notes (medium-low)

The `.empty` style is written in three places. "No games yet" is a sentence with a full stop in four places and a label without one on the seasons page. Notes under tables have two spacings.

**Fix:** an `Empty` component with one copy string, and a global `.note`.

### 10. Two wordings for a game's stage (medium-low)

The games page's day headings split ESPN's raw note ("NBA Finals · Game 5"). The game page and the team log use `stage()` ("Finals game 5").

**Fix:** use `stage()` everywhere.

### 11. Low

- Visually hidden text is styled twice.
- The logo's path is in both `Base.astro` and `public/favicon.svg`.

## Checked and clean

- **Formatting.** Dates and numbers are formatted only in `format.ts`.
- **URLs.** Every URL goes through `routes.ts`, and every page path comes from `season.ts`.
- **Upset rule.** The rule lives only in `facts.ts`.
- **Share image colours.** The share image reads its colours from `global.css`.
- **Old-model baseline.** `scripts/elo538.ts` copies the win-chance formula on purpose, as a frozen baseline.
