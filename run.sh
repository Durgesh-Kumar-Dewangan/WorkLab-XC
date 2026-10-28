#!/usr/bin/env bash
# Start everything (Linux / macOS):  bash run.sh [--prod] [--api-only] [--open]
cd "$(dirname "$0")"
[ -f .env ] || bash ./install.sh || exit 1
exec python3 scripts/run.py "$@"
