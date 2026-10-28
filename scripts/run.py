#!/usr/bin/env python3
"""Start WorkLab XC: the Python API (port 8000) and the web app (port 3000) together. Ctrl-C stops both.

    python scripts/run.py                 development mode (auto-reload)
    python scripts/run.py --prod          production build + start (slower to start, faster to run)
    python scripts/run.py --api-only      just the API
    python scripts/run.py --check         start, run the staging checks against it, stop (exit code 0 = all passed)
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACK = ROOT / "backend"
procs: list[subprocess.Popen] = []


def load_env() -> dict:
    env = dict(os.environ)
    f = ROOT / ".env"
    if not f.exists():
        sys.exit("No .env yet. Run:  python scripts/install.py")
    for raw in f.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip()
        if v[:1] in "\"'" and v[-1:] == v[:1] and len(v) > 1:
            v = v[1:-1]
        else:
            v = re.split(r"(?:^|\s)#", v, maxsplit=1)[0].strip()  # "KEY=   # note" is an empty value
        if k not in os.environ:  # a variable set in the shell wins over .env
            env[k] = v
    return env


def py() -> str:
    v = BACK / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    return str(v) if v.exists() else sys.executable


def backend_loads(env: dict, code: str = "import wlxc.app") -> tuple[bool, str]:
    r = subprocess.run([py(), "-c", code], cwd=BACK, env=dict(env, WLXC_QUIET_MAIL="1"), capture_output=True, text=True)
    return r.returncode == 0, (r.stderr or "").strip().splitlines()[-1] if r.returncode else ""


def ensure_backend(env: dict, code: str = "import wlxc.app") -> None:
    """If a Python package is missing (for example after an update), install the requirements and try once more."""
    ok, err = backend_loads(env, code)
    if ok:
        return
    print(f"The backend could not load ({err}). Installing the Python packages ...")
    core = [l for l in (BACK / "requirements.txt").read_text().splitlines() if l.strip() and not l.startswith("#") and not l.lower().startswith("psycopg")]
    tmp = BACK / ".requirements-core.txt"
    tmp.write_text("\n".join(core) + "\n")
    try:
        subprocess.run([py(), "-m", "pip", "install", "-r", str(tmp)])
    finally:
        tmp.unlink(missing_ok=True)
    ok, err = backend_loads(env, code)
    if not ok:
        sys.exit(f"The backend still cannot load: {err}\nInstall that package by hand:  {py()} -m pip install <name>")


def stop(*_):
    for p in procs:
        if p.poll() is None:
            try:
                p.terminate()
            except Exception:  # noqa: BLE001
                pass
    for p in procs:
        try:
            p.wait(timeout=8)
        except Exception:  # noqa: BLE001
            p.kill()


def wait_for(url: str, seconds: int) -> bool:
    end = time.time() + seconds
    while time.time() < end:
        if any(p.poll() is not None for p in procs):
            return False
        try:
            with urllib.request.urlopen(url, timeout=3) as r:
                if r.status < 500:
                    return True
        except Exception:  # noqa: BLE001
            time.sleep(1)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prod", action="store_true")
    ap.add_argument("--api-only", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--open", action="store_true", help="open the site in your browser once it is up")
    ap.add_argument("--api-port", type=int, default=8000)
    ap.add_argument("--web-port", type=int, default=3000)
    a = ap.parse_args()
    env = load_env()
    import socket
    for label, port in [("API", a.api_port)] + ([] if a.api_only else [("web app", a.web_port)]):
        with socket.socket() as s:
            s.settimeout(0.5)
            if s.connect_ex(("127.0.0.1", port)) == 0:
                sys.exit(f"Port {port} ({label}) is already in use. Close the other copy of WorkLab XC, or choose another port: --api-port / --web-port.")
    env.setdefault("PYTHONUNBUFFERED", "1")
    env["PYTHONPATH"] = str(BACK)
    env["API_ORIGIN"] = f"http://127.0.0.1:{a.api_port}"
    if env.get("WLXC_ENV") != "production":
        env["WLXC_ENV"] = "development"
    signal.signal(signal.SIGINT, lambda *x: (stop(), sys.exit(0)))
    signal.signal(signal.SIGTERM, lambda *x: (stop(), sys.exit(0)))

    ensure_backend(env)
    api_cmd = [py(), "-m", "uvicorn", "wlxc.app:app", "--host", "127.0.0.1", "--port", str(a.api_port)]
    if not a.prod and not a.check:
        env.pop("WEB_CONCURRENCY", None)  # uvicorn ignores workers when reloading
        api_cmd += ["--reload", "--reload-dir", str(BACK / "wlxc")]
    print(f"Starting API on http://127.0.0.1:{a.api_port} ...")
    procs.append(subprocess.Popen(api_cmd, cwd=BACK, env=env))
    if not wait_for(f"http://127.0.0.1:{a.api_port}/api/health", 40):
        stop()
        sys.exit("The API did not start. Read the messages above (a missing .env value is the usual cause).")
    print("API is healthy.")

    if not a.api_only:
        npm = shutil.which("npm")
        if not npm:
            stop()
            sys.exit("npm not found - install Node.js 20+, or use --api-only.")
        if not (ROOT / "node_modules" / "next").exists():
            print("Web packages are not installed yet - installing (a few minutes) ...")
            if subprocess.run([npm, "install", "--no-audit", "--no-fund"], cwd=ROOT).returncode:
                stop()
                sys.exit("npm install failed - check your internet connection and read the messages above.")
        env["PORT"] = str(a.web_port)
        if a.prod or a.check:
            print("Building the web app (first time takes a few minutes) ...")
            if subprocess.run([npm, "run", "build"], cwd=ROOT, env=env).returncode:
                stop()
                sys.exit("Web build failed - the messages above say which file and line.")
            web = [npm, "run", "start", "--", "-p", str(a.web_port)]
        else:
            web = [npm, "run", "dev", "--", "-p", str(a.web_port)]
        print(f"Starting web app on http://localhost:{a.web_port} ...")
        procs.append(subprocess.Popen(web, cwd=ROOT, env=env))
        if not wait_for(f"http://127.0.0.1:{a.web_port}/", 180):
            stop()
            sys.exit("The web app did not come up.")

    base = f"http://127.0.0.1:{a.web_port if not a.api_only else a.api_port}"
    if a.check:
        cmd = [py(), str(BACK / "scripts" / "staging_check.py"), base, "--cron-secret", env.get("CRON_SECRET", "")] + (["--api-only"] if a.api_only else [])
        code = subprocess.run(cmd, env=env).returncode
        stop()
        sys.exit(code)

    shown = base.replace("127.0.0.1", "localhost")
    print(f"\nWorkLab XC is running.  Open {shown}\nPress Ctrl-C (or close this window) to stop.\n")
    if a.open:
        try:
            webbrowser.open(shown)
        except Exception:  # noqa: BLE001
            pass
    try:
        while all(p.poll() is None for p in procs):
            time.sleep(1)
    finally:
        stop()
    sys.exit(1)


if __name__ == "__main__":
    main()
