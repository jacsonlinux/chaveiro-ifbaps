#!/usr/bin/env bash
set -euo pipefail

pm2 describe keychain-ifbaps-backend
"$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backend-healthcheck.sh"
