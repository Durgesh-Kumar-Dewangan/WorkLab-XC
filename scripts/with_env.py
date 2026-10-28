#!/usr/bin/env python3
"""Run any command with the settings from .env loaded:   python scripts/with_env.py -m wlxc.backup create
Runs inside backend/ with the project's Python environment, e.g. backups or the worker."""
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run  # noqa: E402

if len(sys.argv) < 2:
    sys.exit(__doc__)
env = run.load_env()
env["PYTHONPATH"] = str(run.BACK)
sys.exit(subprocess.run([run.py(), *sys.argv[1:]], cwd=run.BACK, env=env).returncode)
