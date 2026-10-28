"""A separate worker process for hosts where web requests must stay short: `python -m wlxc.worker`.
Run the web app with WORKER_MODE=external and this process alongside it."""
from __future__ import annotations

import signal
import time

from . import maintenance
from .config import session_secret
from .web import log

_stop = False


def _quit(*_):
    global _stop
    _stop = True


def main(interval: float = 5.0) -> None:
    session_secret()
    signal.signal(signal.SIGTERM, _quit)
    signal.signal(signal.SIGINT, _quit)
    log("info", "wlxc.worker_started")
    while not _stop:
        try:
            maintenance.tick()
        except Exception as e:  # noqa: BLE001
            log("error", "worker.tick_failed", err=str(e)[:300])
        for _ in range(int(interval * 10)):
            if _stop:
                break
            time.sleep(0.1)
    log("info", "wlxc.worker_stopped")


if __name__ == "__main__":
    main()
