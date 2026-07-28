#!/usr/bin/env bash
set -euo pipefail

HEALTH_URL="${KEYCHAIN_BACKEND_HEALTH_URL:-http://localhost:3010/health}"

if [ "${KEYCHAIN_BACKEND_HEALTH_QUIET:-false}" = "true" ]; then
  HEALTH_JSON="$(curl -fsS "$HEALTH_URL" 2>/dev/null)"
else
  HEALTH_JSON="$(curl -fsS "$HEALTH_URL")"
fi

printf "%s" "$HEALTH_JSON" | node -e '
let input = "";
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const health = JSON.parse(input);
  const config = health.config ?? {};
  const summary = {
    status: health.status,
    service: health.service,
    port: config.port,
    authMode: config.auth?.mode,
    authSessionStore: config.authSessionStore?.name,
    reservationProvider: config.reservationProvider,
    reservationStore: config.reservationStore?.name,
    keyCatalogStore: config.keyCatalogStore?.name,
    keyMovementStore: config.keyMovementStore?.name,
    keyOccurrenceStore: config.keyOccurrenceStore?.name,
    userStore: config.userStore?.name,
  };
  console.log(JSON.stringify(summary, null, 2));
});
'
