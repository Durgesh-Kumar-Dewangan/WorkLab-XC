#!/usr/bin/env bash
# Linux / macOS installer. Normally started by INSTALL-Mac.command or INSTALL-Linux.sh (double-click).
set -euo pipefail
cd "$(dirname "$0")"
ADMIN="${1:-}"
if [ -z "$ADMIN" ] && [ -t 0 ]; then read -r -p "Your email address (becomes the administrator; press Enter to skip): " ADMIN || true; fi

need_py=1; need_node=1
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null && need_py=0
command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] && need_node=0

if [ "$need_py" = 1 ] || [ "$need_node" = 1 ]; then
  echo "Installing missing tools (you may be asked for your password) ..."
  if [ "$(uname)" = "Darwin" ]; then
    if ! command -v brew >/dev/null 2>&1; then
      echo "Installing Homebrew (the standard Mac package manager) ..."
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$($b shellenv)"; done
    fi
    [ "$need_py" = 1 ] && brew install python@3.12
    if [ "$need_node" = 1 ]; then brew install node@22; brew link --overwrite --force node@22 || true; fi
    export PATH="$(brew --prefix)/opt/python@3.12/libexec/bin:$(brew --prefix)/opt/node@22/bin:$PATH"
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    [ "$need_py" = 1 ] && sudo apt-get install -y python3 python3-venv python3-pip
    if [ "$need_node" = 1 ]; then
      sudo apt-get install -y curl ca-certificates
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
      sudo apt-get install -y nodejs
    fi
  elif command -v dnf >/dev/null 2>&1; then
    [ "$need_py" = 1 ] && sudo dnf install -y python3 python3-pip
    [ "$need_node" = 1 ] && sudo dnf install -y nodejs
  else
    echo "Please install Python 3.10+ and Node.js 20+ (python.org, nodejs.org), then run this again."; exit 1
  fi
fi
python3 scripts/install.py ${ADMIN:+--admin-email "$ADMIN"}
