#!/bin/zsh
# Rerun the seed research end to end. S = scratchpad holding venv/, df3.pkl, pbp/apm.json, newdata/athletes.json.
# zsh scripts/research/seed/run.sh <S>
set -e
S=$1; R=scripts/research/seed; PY=$S/venv/bin/python
mkdir -p $S/seed
python3 $R/preseason_fetch.py $S/seed/pre                      # ESPN preseason games + box scores (cached)
node $R/seed-rules.ts dump $S/seed/dump.json $S/pbp/apm.json     # ratings, team parts, first games
$PY $R/rosters.py $S                                             # opening rosters
cp $S/newdata/athletes.json $S/seed/athletes-copy.json; $PY $R/age.py $S   # birth dates -> ages, age curve
A='"apm":{"kind":"resid","b":0.12}'; B='"b":0.12,"hold":0,"pre":1,"age":1'
$PY $R/seed.py $S spec $S/seed/final.json "json:{\"v4\":{},\"apm12\":{$A},
 \"last07\":{\"seed\":{\"alpha\":0,\"beta\":0.7}},
 \"own_c\":{\"seed\":{\"alpha\":0.9,\"beta\":0,$B,\"gamma\":0.1}},
 \"own_d\":{\"seed\":{\"alpha\":0.9,\"beta\":0.3,$B,\"gamma\":0.1}},
 \"first_lineup\":{\"firsts\":true},
 \"winpm_g0.1\":{\"seed\":{\"alpha\":0,\"beta\":0,\"win\":1,\"gamma\":0.1}},
 \"apm12_winpm_g0.1_first\":{$A,\"firsts\":true,\"seed\":{\"alpha\":0,\"beta\":0,\"win\":1,\"gamma\":0.1}},
 \"apm12_ownApam_first\":{$A,\"firsts\":true,\"seed\":{\"alpha\":0.9,\"beta\":0.3,$B,\"gamma\":0.1}}}"
node $R/seed-rules.ts run $S/seed/final.json $S/seed/final-out.json $S/pbp/apm.json
$PY $R/score_seed.py $S $S/seed/final-out.json v4 --nowiden v4
$PY $R/score_seed.py $S $S/seed/final-out.json apm12
