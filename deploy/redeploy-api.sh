#!/usr/bin/env bash
# Rebuild and restart the API on the droplet (after git pull).
#
#   cd ~/klimate-kundli && bash deploy/redeploy-api.sh
#
# Optional shell alias (~/.bashrc on droplet):
#   alias kk-deploy='cd ~/klimate-kundli && bash deploy/redeploy-api.sh'

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "==> $APP_DIR"
npm ci --ignore-scripts
npm rebuild better-sqlite3
npm run build

echo "==> restart klimate-kundli"
systemctl restart klimate-kundli
sleep 1
curl -sf "http://127.0.0.1:8787/health"
echo ""
echo "OK — local health passed"
