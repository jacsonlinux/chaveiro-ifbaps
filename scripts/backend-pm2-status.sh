#!/usr/bin/env bash
set -euo pipefail

pm2 describe chaveiro-ifbaps-backend
"$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backend-healthcheck.sh"
