"""Per-day learning activity (answers, correct answers, sessions), the data behind the progress page's activity graph."""
from __future__ import annotations

from datetime import datetime, timezone

from .store import get_store

COLL = "activity_days"


def today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def bump(uid: str, _event: bool = True, **fields: float) -> None:
    """Adds to today's counters for this learner. Never raises: activity is a nicety, not part of answering a question."""
    day = today()
    id = f"{uid}:{day}"

    def go(c):
        cur = dict(c or {"id": id, "uid": uid, "day": day, "events": 0, "answered": 0, "correct": 0, "sessions": 0})
        for k, v in fields.items():
            cur[k] = cur.get(k, 0) + v
        if _event:
            cur["events"] = cur.get("events", 0) + 1
        return cur

    try:
        get_store().update(COLL, id, go)
    except Exception:  # noqa: BLE001
        pass


def days(uid: str, count: int = 371) -> list[dict]:
    rows = sorted(get_store().find(COLL, where={"uid": uid}, limit=2000), key=lambda r: r["day"], reverse=True)[:count]
    return [{"day": r["day"], "events": r.get("events", 0), "answered": r.get("answered", 0), "correct": r.get("correct", 0),
             "sessions": r.get("sessions", 0), "minutes": round(r.get("minutes", 0), 1)} for r in rows]
