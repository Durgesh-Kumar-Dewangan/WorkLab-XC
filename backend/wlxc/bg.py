"""Run work after the response has been sent. Tests set SYNC to run it inline."""
from __future__ import annotations

import contextvars
import json
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Callable

from .config import env

SYNC = False
_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="wlxc-bg")
_pending: list = []
_plock = threading.Lock()


def _safe(fn: Callable[[], object]):
    def run():
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"level": "error", "msg": "background.failed", "err": str(e)}), file=sys.stderr)

    return run


def detach(fn: Callable[[], object]) -> None:
    """Small side effects (email, notifications): always run, never raise."""
    if SYNC:
        _safe(fn)()
        return
    f = _pool.submit(contextvars.copy_context().run, _safe(fn))  # keeps who it is for, so their own AI key follows the work
    with _plock:
        _pending.append(f)


def background(fn: Callable[[], object]) -> None:
    """Long work (generation). With WORKER_MODE=external a separate worker process picks jobs up instead."""
    if env().worker_mode == "external":
        return
    detach(fn)


def drain(timeout: float = 30) -> None:
    with _plock:
        items, _pending[:] = list(_pending), []
    for f in items:
        f.result(timeout=timeout)
