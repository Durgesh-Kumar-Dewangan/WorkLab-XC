"""Blocking: by an administrator, or automatically after repeated over-limit requests."""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from .config import env
from .crypto import uuid
from .errors import ApiError
from .store import get_store
from .web import log

LIMIT_CODES = {"quota_exceeded", "session_limit", "rate_limited"}
ESCALATION_MIN = [15, 60, 1440]
HOUR = 3600_000
IST = timezone(timedelta(hours=5, minutes=30))


def _ms() -> float:
    return time.time() * 1000


def active_block(uid: str) -> dict | None:
    b = get_store().get("blocks", uid)
    if not b:
        return None
    return None if b["until"] is not None and b["until"] <= _ms() else b


def assert_not_blocked(user: dict) -> None:
    b = active_block(user["id"])
    if not b:
        return
    if b["until"]:
        when = datetime.fromtimestamp(b["until"] / 1000, IST).strftime("%Y-%m-%d %H:%M")
        msg = f"Your account is paused until {when} IST. {b['reason']}"
    else:
        msg = f"Your account is blocked. {b['reason']} Write to {env().mail.support} if you think this is a mistake."
    raise ApiError(403, "account_blocked", msg, {"until": b["until"], "appeal": env().mail.support})


def audit(actor: str, action: str, target: str, detail: dict | None = None) -> None:
    id = f"au_{uuid()}"
    get_store().put("audit", id, {"id": id, "actor": actor, "action": action, "target": target, "detail": detail or {}, "created": _ms()})


def block_user(uid: str, reason: str, by: str, minutes: float | None = None, actor: str | None = None) -> dict:
    b = {"uid": uid, "reason": reason[:300], "until": _ms() + minutes * 60_000 if minutes else None, "by": by, "created": _ms()}
    get_store().put("blocks", uid, b)
    audit(actor or "system", "block", uid, {"reason": b["reason"], "until": b["until"], "by": by})
    return b


def unblock_user(uid: str, actor: str) -> None:
    st = get_store()
    st.delete("blocks", uid)
    st.delete("strikes", uid)
    audit(actor, "unblock", uid)


def note_limit_hit(uid: str) -> None:
    """Called whenever a signed-in person gets a limit error. Enough hits in an hour blocks them for longer each time."""
    try:
        st = get_store()
        hour = int(_ms() // HOUR)
        hits = st.update("abuse_hits", f"{uid}:{hour}", lambda c: {"n": (c or {}).get("n", 0) + 1})
        if (hits or {}).get("n", 0) < env().abuse.auto_block_hits:
            return
        st.delete("abuse_hits", f"{uid}:{hour}")
        strikes = st.update("strikes", uid, lambda c: {"n": (c or {}).get("n", 0) + 1})["n"]
        minutes = ESCALATION_MIN[min(strikes, len(ESCALATION_MIN)) - 1]
        block_user(uid, "Too many requests over your limit.", "auto", minutes)
        log("warn", "abuse.auto_block", uid=uid, strikes=strikes, minutes=minutes)
    except Exception as e:  # noqa: BLE001
        log("warn", "abuse.note_failed", err=str(e)[:160])
