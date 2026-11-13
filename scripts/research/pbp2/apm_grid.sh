#!/bin/zsh
# Runs apm2.py for each config given as "tag|key=value key=value", skipping tags already written.
# scripts/research/pbp2/apm_grid.sh <S> <stintsDir> "tag|args" ...
S=$1; SD=$2; shift 2
for spec in "$@"; do
  tag=${spec%%|*}; args=${spec#*|}
  [[ -f $S/pbp2/apm/$tag.json ]] && continue
  $S/pbp2/venv/bin/python scripts/research/pbp2/apm2.py $SD $S/pbp/box.json $S/pbp2/apm/$tag.json ${=args} | tail -1
done
