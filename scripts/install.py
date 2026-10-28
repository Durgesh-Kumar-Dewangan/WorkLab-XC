#!/usr/bin/env python3
"""One-step local setup for WorkLab XC (Linux, macOS, Windows). Standard library only.

    python scripts/install.py [--admin-email you@example.com] [--no-venv] [--skip-npm]

What it does: checks Python >= 3.10 and Node >= 20, creates backend/.venv and installs the Python packages, runs `npm install`,
and writes a ready-to-run `.env` (fresh random secrets, SQLite database in ./data) if you do not have one yet.
It never overwrites an existing `.env`."""
from __future__ import annotations

import argparse
import os
import re
import platform
import secrets
import shutil
import socket
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACK = ROOT / "backend"


def say(msg: str):
    print(f"\n==> {msg}", flush=True)


def run(cmd: list[str], cwd: Path | None = None, check: bool = True) -> int:
    print("   $ " + " ".join(cmd), flush=True)
    r = subprocess.run(cmd, cwd=cwd)
    if check and r.returncode:
        sys.exit(f"\nFAILED: {' '.join(cmd)} (exit {r.returncode})")
    return r.returncode


def venv_python() -> Path:
    return BACK / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def node_version() -> tuple[int, ...] | None:
    exe = shutil.which("node")
    if not exe:
        return None
    try:
        out = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=15).stdout.strip().lstrip("v")
        return tuple(int(x) for x in out.split(".")[:3])
    except Exception:  # noqa: BLE001
        return None


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) != 0


def preflight(need_node: bool) -> bool:
    """Checks the machine against the system requirements and prints a short report. Returns False when something blocks the install."""
    say("System requirements")
    ok = True
    print(f"   System       {platform.system()} {platform.release()} ({platform.machine()})")
    free_gb = shutil.disk_usage(ROOT).free / 1e9
    print(f"   Disk space   {free_gb:.1f} GB free (needs about 2 GB)   {'ok' if free_gb >= 2 else 'TOO LOW'}")
    ok &= free_gb >= 2
    try:
        urllib.request.urlopen("https://pypi.org/simple/pip/", timeout=8).close()
        print("   Internet     reachable (pypi.org)   ok")
    except Exception:  # noqa: BLE001
        print("   Internet     cannot reach pypi.org   NEEDED to download packages")
        ok = False
    for name, port in (("Web port", 3000), ("API port", 8000)):
        print(f"   {name:<12} {port} is {'free' if port_free(port) else 'IN USE (stop the other program, or start with --web-port / --api-port)'}")
    print("   Browser      any current Chrome, Edge, Firefox or Safari with WebGL (needed for the 3D classroom)")
    return bool(ok)


def write_env(admin_email: str):
    target, example = ROOT / ".env", ROOT / ".env.example"
    if target.exists():
        print("   .env already exists - left untouched.")
        return
    values = {
        "APP_URL": "http://localhost:3000",
        "API_ORIGIN": "http://127.0.0.1:8000",
        "SESSION_SECRET": secrets.token_urlsafe(48),
        "CRON_SECRET": secrets.token_urlsafe(48),
        "SQLITE_PATH": str(ROOT / "data" / "wlxc.db"),
        "WORKER_MODE": "inline",
        "WEB_CONCURRENCY": "1",
        "INPROCESS_TICK_SEC": "30",
        "REQUIRE_CONSENT": "1",
        "WLXC_ENV": "development",
    }
    if admin_email:
        values["ADMIN_EMAILS"] = admin_email
    lines, seen = [], set()
    for line in example.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^([A-Z][A-Z0-9_]*)=", line)
        if m and m.group(1) in values:
            lines.append(f"{m.group(1)}={values[m.group(1)]}")
            seen.add(m.group(1))
        else:
            lines.append(line)
    lines += ["", "# --- added by install.py ---"] + [f"{k}={v}" for k, v in values.items() if k not in seen]
    target.write_text("\n".join(lines) + "\n", encoding="utf-8")
    (ROOT / "data").mkdir(exist_ok=True)
    print("   wrote .env with new random secrets. Add your AI / email / payment keys to it (see SETUP.md).")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--admin-email", default="", help="this email becomes an administrator")
    ap.add_argument("--no-venv", action="store_true", help="install Python packages into the current environment")
    ap.add_argument("--skip-npm", action="store_true", help="skip the front-end install (API only)")
    ap.add_argument("--doctor", action="store_true", help="only check this computer against the system requirements")
    a = ap.parse_args()

    say("Checking tools")
    if sys.version_info < (3, 10):
        sys.exit(f"Python 3.10 or newer is required (you have {sys.version.split()[0]}). Run the installer wrapper (install.sh / install.ps1) or install Python from python.org.")
    print(f"   Python {sys.version.split()[0]}")
    nv = node_version()
    if not a.skip_npm:
        if not nv or nv[0] < 20:
            sys.exit(f"Node.js 20 or newer is required for the web app (found {'.'.join(map(str, nv)) if nv else 'none'}). Install it from nodejs.org, or re-run with --skip-npm for API only.")
        print(f"   Node {'.'.join(map(str, nv))}")

    if not preflight(not a.skip_npm):
        sys.exit("\nFix the item marked above, then run this again.")
    if a.doctor:
        return

    say("Python packages")
    if a.no_venv:
        py = sys.executable
    else:
        if not venv_python().exists():
            run([sys.executable, "-m", "venv", str(BACK / ".venv")])
        py = str(venv_python())
    run([py, "-m", "pip", "install", "--quiet", "--upgrade", "pip"], check=False)
    req = (BACK / "requirements.txt").read_text().splitlines()
    core = [l for l in req if l.strip() and not l.startswith("#") and not l.lower().startswith("psycopg")]
    tmp = BACK / ".requirements-core.txt"
    tmp.write_text("\n".join(core) + "\n")
    try:
        run([py, "-m", "pip", "install", "-r", str(tmp)])
    finally:
        tmp.unlink(missing_ok=True)
    if run([py, "-m", "pip", "install", "psycopg[binary,pool]>=3.2"], check=False):
        print("   (PostgreSQL driver not installed - fine for local use; SQLite needs nothing. Needed only when you set DATABASE_URL.)")

    say("Checking that the backend can start")
    chk = subprocess.run([py, "-c", "import wlxc.app"], cwd=BACK, env=dict(os.environ, PYTHONPATH=str(BACK), WLXC_QUIET_MAIL="1"), capture_output=True, text=True)
    if chk.returncode:
        err = (chk.stderr or "").strip().splitlines()
        print("\n".join(err[-6:]))
        sys.exit("\nFAILED: the backend could not be loaded after installing its packages (see the last line above).\n"
                 "If it says \"No module named X\", run:  " + py + " -m pip install X   and then run this installer again.")
    print("   ok")

    if not a.skip_npm:
        say("Web app packages (npm install - takes a few minutes the first time)")
        run([shutil.which("npm") or "npm", "install", "--no-audit", "--no-fund"], cwd=ROOT)

    say("Configuration file")
    write_env(a.admin_email)

    say("Self-test (backend)")
    env = dict(os.environ, PYTHONPATH=str(BACK), PYTHONWARNINGS="ignore")
    code = subprocess.run([py, "-m", "unittest", "discover", "-s", "tests", "-t", "."], cwd=BACK, env=env, capture_output=True, text=True)
    tail = (code.stderr or "").strip().splitlines()[-3:]
    print("   " + "\n   ".join(tail))
    if code.returncode:
        print("   Some self-tests failed - the app may still run. Last lines of the report:\n   " + "\n   ".join((code.stderr or "").strip().splitlines()[-12:]))

    say("Done")
    print("   Next:  python scripts/run.py     (then open http://localhost:3000)\n   Keys:  edit .env  (see SETUP.md)")


if __name__ == "__main__":
    main()
