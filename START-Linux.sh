#!/usr/bin/env bash
cd "$(dirname "$0")"
[ -f .env ] || bash ./install.sh
[ -f .env ] || { read -r -p "Install did not finish. Press Enter to close." _; exit 1; }
echo "Starting WorkLab XC. Your browser opens when it is ready (first start can take a minute or two). Close this window to stop."
python3 scripts/run.py --open
read -r -p "WorkLab XC stopped. Press Enter to close." _
