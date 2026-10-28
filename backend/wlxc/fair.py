"""Fair use: one learner's heavy work (AI lessons, exams, notes) can never queue behind, or crowd out, another's.

Each account may run only a few heavy requests at the same moment (its plan's `concurrent` limit), and the server as a whole
caps how many run at once so a rush is answered with a clear "busy, try again" instead of slowing everybody down.
The counters are per server process; with several workers each one enforces the limits for itself."""
from __future__ import annotations

import threading
from contextlib import contextmanager

from .config import env
from .errors import ApiError

_lock = threading.Lock()
_mine: dict[str, int] = {}
_total = 0


@contextmanager
def slot(uid: str, per_user: int):
    global _total
    cap = env().fair_global_heavy
    with _lock:
        if _mine.get(uid, 0) >= per_user:
            raise ApiError(429, "busy", "You already have work in progress. Wait for it to finish, then try again.", {"kind": "concurrent"})
        if _total >= cap:
            raise ApiError(503, "server_busy", "Lots of learners are studying right now. Please try again in a few seconds.", {}, {"retry-after": "5"})
        _mine[uid] = _mine.get(uid, 0) + 1
        _total += 1
    try:
        yield
    finally:
        with _lock:
            _total -= 1
            left = _mine.get(uid, 1) - 1
            if left <= 0:
                _mine.pop(uid, None)
            else:
                _mine[uid] = left


def snapshot() -> dict:
    with _lock:
        return {"running": _total, "users": len(_mine), "cap": env().fair_global_heavy}
