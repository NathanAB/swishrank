# Version 5 research prototypes

Throwaway code from the November 2026 model review and the version 5 planning (issue #65). Nothing here is read by the
site, and none of it is meant to merge: it is the primary source the version 5 tickets point at. Paths inside the
scripts point at a scratch directory that no longer exists; treat them as worked examples, not as tools.

- `dump.ts`: every final game as version 4 priced it, split into its parts, with each side's lineup and who played.
- `rules.ts`, `decay.ts`, `more.ts`, `luck-rules.ts`: run the model for named variants and write each game's expected margin. `elo-decay.ts` is a copy of `src/lib/elo.ts` with a time-decay knob.
- `pbp/`: the on-court rating prototype. `espn.py` fetches each game's ESPN summary, `stints.py` rebuilds who was on the floor, `apm.py` fits the walk-forward rating, `apm-rules.ts` feeds it to the model, `score_pbp.py` scores on results only.
- `analysis/c1.py`, `analysis/c2.py`: the roster-based lineup prototype, with each player's chance of playing by report status and games missed, and minutes redistributed when players sit.
- `analysis/score.py`: paired differences against version 4 with weekly block-bootstrap intervals. Its distance-to-Vegas columns were ruled out as a judge (docs/adr/0001); read the outcome columns.
- `analysis/a*.py`, `analysis/b1.py`: the review's diagnostics.
- `luck/`: luck-adjusted margins, which did not help.
