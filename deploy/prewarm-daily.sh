#!/usr/bin/env bash
# Resume the Open-Meteo cache prewarm.
#
# Safe to run repeatedly and on a schedule: prewarm.ts skips every city already in
# the cache, and halts itself cleanly when Open-Meteo's daily quota trips. The quota
# refills at 00:00 UTC, which is what the paired .timer is scheduled against.
#
# The lock matters because a single run can last ~20h (30 min/city), so it can still
# be going when the next day's timer fires.
set -uo pipefail

APP_DIR=/root/klimate-kundli
LOCK=/run/klimate-kundli-prewarm.lock
LOG=/root/prewarm-$(date -u +%F).log

exec 9>"$LOCK"
if ! flock -n 9; then
  echo "{\"t\":\"$(date -u +%FT%TZ)\",\"msg\":\"prewarm_skipped_locked\",\"note\":\"a run is already in progress\"}" | tee -a "$LOG"
  exit 0
fi

cd "$APP_DIR" || { echo "prewarm: $APP_DIR missing"; exit 1; }
npm run prewarm 2>&1 | tee -a "$LOG"
