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

**Player value**:
The single number the model settles on for a player, which his team's rating and each game's chance count for his minutes.
_Avoid_: Player rating, impact
