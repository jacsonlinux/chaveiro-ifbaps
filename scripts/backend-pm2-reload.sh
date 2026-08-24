#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

cd "$BACKEND_DIR"
npm run build
pm2 startOrReload ecosystem.config.cjs --only chaveiro-ifbaps-backend --update-env
pm2 startOrReload ecosystem.config.cjs --only chaveiro-ifbaps-sync-worker --update-env

for attempt in 1 2 3 4 5; do
  if KEYCHAIN_BACKEND_HEALTH_QUIET=true "$ROOT_DIR/scripts/backend-healthcheck.sh"; then
    break
  fi
  sleep "$attempt"
done

if ! pm2 describe chaveiro-ifbaps-sync-worker | grep -q "status.*online"; then
  echo "Sync worker is not online." >&2
  exit 1
fi

if ! KEYCHAIN_BACKEND_HEALTH_QUIET=true "$ROOT_DIR/scripts/backend-healthcheck.sh"; then
  echo "Backend healthcheck failed after PM2 reload." >&2
  exit 1
fi
