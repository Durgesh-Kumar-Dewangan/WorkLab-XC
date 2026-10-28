"""Daily usage counters. The day rolls over at local midnight (IST by default)."""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from .config import env
from .errors import ApiError
from .store import get_store

LIMIT_TEXT = {
    "jobs": lambda n: f"You have used today's {n} generation runs. They reset at midnight (IST), or upgrade for more.",
    "images": lambda n: f"You have used today's {n} images. They reset at midnight (IST).",
    "sessions": lambda n: f"You have started today's {n} learning sessions. They reset at midnight (IST), or upgrade for more.",
    "chat": lambda n: f"You have used today's {n} chat messages. They reset at midnight (IST).",
    "answers": lambda n: f"You have used today's {n} full-answer generations. They reset at midnight (IST).",
    "exam": lambda n: f"You have used today's {n} exam papers. They reset at midnight (IST), or upgrade for more.",
    "gen": lambda n: f"You have used today's {n} fresh topic generations. Saved topics are still free to open.",
}


def day_key(now_ms: float | None = None) -> str:
    ms = (time.time() * 1000 if now_ms is None else now_ms) + env().quota_tz_offset_min * 60_000
    return datetime.fromtimestamp(ms / 1000, timezone.utc).strftime("%Y-%m-%d")


class _Over(Exception):
    pass


def consume(uid: str, kind: str, amount: int, limit: float) -> None:
    """Atomically adds `amount` to today's counter, or raises 429 without changing it when that would exceed `limit`."""

    from . import byok

    if byok.covers(uid, kind):
        tally(uid, kind, amount)  # their own key pays for it: counted for the reports, never limited
        return

    def fn(c):
        n = (c or {}).get("n", 0) + amount
        if n > limit:
            raise _Over()
        return {"n": n}

    try:
        get_store().update("usage", f"{uid}:{kind}:{day_key()}", fn)
        tally(uid, kind, amount)
    except _Over:
        raise ApiError(429, "quota_exceeded", LIMIT_TEXT[kind](limit), {"kind": kind, "limit": limit}) from None


def tally(uid: str, kind: str, amount: int) -> None:
    """Adds to the learner's lifetime and monthly totals (what the admin reports show). Never raises: reporting must not break a request."""
    try:
        ym = month_key()

        def fn(c):
            c = c or {"id": uid, "uid": uid, "all": {}, "months": {}}
            allk = {**c["all"], kind: max(0, c["all"].get(kind, 0) + amount)}
            mon = {**c["months"].get(ym, {}), kind: max(0, c["months"].get(ym, {}).get(kind, 0) + amount)}
            months = {**c["months"], ym: mon}
            if len(months) > 36:
                months.pop(min(months))
            return {**c, "all": allk, "months": months}

        get_store().update("usage_totals", uid, fn)
    except Exception:  # noqa: BLE001
        pass


def used(uid: str, kind: str) -> int:
    d = get_store().get("usage", f"{uid}:{kind}:{day_key()}")
    return d["n"] if d else 0


def refund(uid: str, kind: str, amount: int) -> None:
    """Gives back quota when a run produced nothing, so provider outages never cost a user their day."""
    get_store().update("usage", f"{uid}:{kind}:{day_key()}", lambda c: {"n": max(0, (c or {}).get("n", 0) - amount)})
    tally(uid, kind, -amount)


def month_key(now_ms: float | None = None) -> str:
    return day_key(now_ms)[:7]


def classroom_month(uid: str) -> list[str]:
    d = get_store().get("usage", f"{uid}:classroom:{month_key()}")
    return list((d or {}).get("topics", []))


def classroom_enter(uid: str, topic: str, limit: int) -> int:
    """Records that the learner opened this topic in the 3D classroom this month. Opening the same topic again is free;
    a new topic beyond `limit` is refused (429) and the month's list stays as it was."""

    from . import byok

    if byok.covers(uid, "classroom"):
        return len(classroom_month(uid))

    def fn(c):
        topics = list((c or {}).get("topics", []))
        if topic in topics:
            return {"topics": topics}
        if len(topics) >= limit:
            raise _Over()
        return {"topics": topics + [topic]}

    try:
        get_store().update("usage", f"{uid}:classroom:{month_key()}", fn)
    except _Over:
        word = "session" if limit == 1 else "sessions"
        raise ApiError(429, "classroom_limit", f"You have used this month's {limit} free 3D classroom {word}. It renews next month, or Beta gives unlimited classroom sessions.",
                       {"kind": "classroom", "limit": limit}) from None
    return len(classroom_month(uid))


def month_used(uid: str, kind: str) -> int:
    d = get_store().get("usage", f"{uid}:{kind}:{month_key()}")
    return d["n"] if d else 0


def consume_month(uid: str, kind: str, limit: int) -> bool:
    """Spends one of this month's free uses. Returns False (and changes nothing) when they are all used."""
    from . import byok

    if byok.covers(uid, kind):
        return True

    def fn(c):
        n = (c or {}).get("n", 0) + 1
        if n > limit:
            raise _Over()
        return {"n": n}

    try:
        get_store().update("usage", f"{uid}:{kind}:{month_key()}", fn)
        return True
    except _Over:
        return False


def refund_month(uid: str, kind: str) -> None:
    get_store().update("usage", f"{uid}:{kind}:{month_key()}", lambda c: {"n": max(0, (c or {}).get("n", 0) - 1)})
