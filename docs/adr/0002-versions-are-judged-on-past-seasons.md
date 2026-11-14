# Versions are judged on past seasons, with no wait for future games

Versions 2 to 4 were each to be confirmed by a season still to be played, which held a finished improvement back for months and, at one season's size, could not tell a 0.002 gain from luck. From version 5 a version goes on the site when it beats the current one on past seasons its settings never saw: every setting is chosen from earlier seasons only, then scored on later ones, season by season, on real results, and the 95% interval of the difference must lie clear of zero. A part too small to show in log loss goes in when a direct measure of it against what happened improves on unseen seasons and log loss is no worse; a lineup's predicted minutes against the minutes played is the first such measure.

Decided on 2026-11-13. Versions 2, 3 and 4's pending confirmations stop being gates the same day: their tables keep logging new games as a record, and no result there switches the site back.

## Consequences

- The same past seasons judge every later idea, so the more ideas are tried, the likelier one passes by luck. Every version's write-up says how many were tried, and reports each of them with its numbers, the likely flukes marked as such.
- The backtests' checks that a pre-registered plan's text is unchanged no longer decide anything for versions after 4.

## What others do

Scoring each period with a model fitted only on earlier periods is the standard test for forecasts, known as evaluation on a rolling forecasting origin (https://otexts.com/fpp3/tscv.html). This follows it, and departs from this repo's own earlier practice of a held-back future season.
