# SwishRank

Ratings and game chances for NBA teams, built from game results and what each player does and causes on the floor.

## Language

### Players

**Box rating**:
A player's rating from his own box-score lines: what he personally scored, rebounded, passed, stole, blocked and gave away.
_Avoid_: Game Score rating, stats rating

**On-court rating**:
A player's rating from the scoreline while he is on the floor, adjusted for the teammates and opponents out there with him.
_Avoid_: Plus-minus (the raw figure, which credits a player for his teammates), APM, RAPM

**Stint**:
A stretch of a game in which the same ten players are on the floor, with each side's points and three-point shots in it. The on-court rating is fitted from every game's stints.
_Avoid_: Shift (one player's time on the floor), lineup (the players a game is predicted with)

**Player value**:
The single number the model settles on for a player, which his team's rating and each game's chance count for his minutes.
_Avoid_: Player rating, impact
