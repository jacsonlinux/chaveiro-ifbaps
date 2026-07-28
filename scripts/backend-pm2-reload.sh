#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

cd "$BACKEND_DIR"
npm run build
pm2 startOrReload ecosystem.config.cjs --only keychain-ifbaps-backend --update-env

for attempt in 1 2 3 4 5; do
  if KEYCHAIN_BACKEND_HEALTH_QUIET=true "$ROOT_DIR/scripts/backend-healthcheck.sh"; then
    exit 0
  fi
  sleep "$attempt"
done

echo "Backend healthcheck failed after PM2 reload." >&2
exit 1
