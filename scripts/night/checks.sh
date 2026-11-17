#!/bin/sh
# Nightly checks. Writes reports/night/<date>.md and exits non-zero if anything fails.
# Changes no source file and runs no git write command.
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
cd "$(dirname "$0")/../.." || exit 2
day=$(date +%Y-%m-%d)
out="reports/night/$day.md"
mkdir -p reports/night
status=0
{
  echo "# Night checks, $day"
  echo
  echo "Commit: $(git rev-parse --short HEAD 2>/dev/null) · uncommitted files: $(git status --porcelain | wc -l | tr -d ' ')"
  for step in typecheck test build; do
    echo
    echo "## pnpm $step"
    echo '```'
    if pnpm -s "$step" > /tmp/hindsight-night.log 2>&1; then
      tail -n 8 /tmp/hindsight-night.log
      echo '```'
      echo "Result: pass"
    else
      tail -n 40 /tmp/hindsight-night.log
      echo '```'
      echo "Result: FAIL"
      status=1
    fi
  done
} > "$out"
result=$([ $status -eq 0 ] && echo pass || echo FAIL)
[ -x planning/say.sh ] && planning/say.sh kiro-crew all "$([ $status -eq 0 ] && echo note || echo blocked)" "Night checks: $result. Report: $out"
echo "night checks: $result -> $out"
exit $status
