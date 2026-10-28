"""Learning sessions and the feedback gate."""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from . import integrations as integ
from .auth import effective_plan
from .config import env
from .crypto import uuid
from .errors import ApiError, forbidden, not_found
from .mail import T, send_mail, to_team
from .plans import LIMITS
from .store import get_store
from .usage import consume, refund

FEEDBACK_TAGS = ["content", "speed", "design", "bug", "pricing", "other"]
IST = timezone(timedelta(hours=5, minutes=30))


def start_session(user: dict, course_id: str | None = None, topic_id: str | None = None) -> dict:
    """Starts a learning session. If the person has not rated their previous session(s) the server refuses
    (403 feedback_required) until they do, so the prompt cannot be skipped by closing a dialog or calling the API directly."""
    store = get_store()
    id = f"s_{uuid()}"
    grace = env().feedback_grace_sessions
    limits = LIMITS[effective_plan(user)]
    # Daily allowance first (atomic); handed back if any later rule refuses the start. Plans with a waiting
    # period are governed by that rule alone, so the message names the wait.
    consume(user["id"], "sessions", 1, 1_000_000 if limits["sessionGapHours"] else limits["sessionsPerDay"])

    def go(c):
        if not c:
            raise not_found("Your account")
        gap = limits["sessionGapHours"] * 3600_000
        if gap and c.get("lastSessionAt") and time.time() * 1000 - c["lastSessionAt"] < gap:
            retry_at = c["lastSessionAt"] + gap
            when = datetime.fromtimestamp(retry_at / 1000, IST).strftime("%Y-%m-%d %H:%M")
            raise ApiError(429, "session_limit",
                           f"The free plan includes one learning session every {limits['sessionGapHours'] // 24} days. Your next one opens {when} IST. Upgrade for {LIMITS['learner']['sessionsPerDay']} topics a day.",
                           {"retryAt": retry_at, "upgrade": True})
        if c["unrated"] > grace:
            raise ApiError(403, "feedback_required", "Tell us how your last session went before starting a new one. It takes ten seconds.",
                           {"sessionId": c.get("lastSession"), "tags": FEEDBACK_TAGS})
        return {**c, "unrated": c["unrated"] + 1, "lastSession": id, "lastSessionAt": time.time() * 1000, "sessions": c["sessions"] + 1}

    try:
        store.update("users", user["id"], go)
    except BaseException:
        refund(user["id"], "sessions", 1)
        raise
    s = {"id": id, "uid": user["id"], "started": time.time() * 1000, "courseId": course_id, "topicId": topic_id, "feedbackId": None}
    store.put("learnsessions", id, s)
    return s


def submit_feedback(user: dict, rating: int, session_id: str | None = None, comment: str = "", tags: list | None = None, page: str | None = None) -> dict:
    """Ratings from a classroom session (answers the gate) or general feedback from the Feedback page."""
    store = get_store()
    s = None
    if session_id:
        s = store.get("learnsessions", session_id)
        if not s:
            raise not_found("That session")
        if s["uid"] != user["id"]:
            raise forbidden()
        if s.get("feedbackId"):
            return {"feedback": store.get("feedback", s["feedbackId"]), "duplicate": True, "whatsapp": None}
    f = {"id": f"f_{uuid()}", "uid": user["id"], "kind": "session" if s else "general", "sessionId": s["id"] if s else "",
         "page": page[:120] if page else None, "rating": rating, "comment": (comment or "")[:2000],
         "tags": [t for t in (tags or []) if t in FEEDBACK_TAGS], "created": time.time() * 1000}
    store.put("feedback", f["id"], f)
    if s:
        store.update("learnsessions", s["id"], lambda c: {**c, "feedbackId": f["id"]} if c else c)
        store.update("users", user["id"], lambda c: {**c, "unrated": 0} if c else c)
    integ.emit("feedback.received", {"feedbackId": f["id"], "rating": f["rating"], "tags": f["tags"], "comment": f["comment"],
                                      "email": user["email"], "sessionId": f["sessionId"], "kind": f["kind"]})
    send_mail(user["email"], "feedback-thanks", T.feedback_thanks(user["name"], f["rating"]))
    # The team hears about low ratings and anything with a written comment.
    if f["rating"] <= 2 or f["comment"]:
        to_team("feedback-team", T.feedback_to_team(user["email"], f["rating"], f["comment"], f["tags"], f["page"]))
    # A low rating is a chance to fix things personally.
    wa = integ.support_link(f"fb-{f['id'][2:8]}", f"I rated WorkLab XC {f['rating']}/5. {f['comment']}"[:160]) if f["rating"] <= 2 else None
    return {"feedback": f, "duplicate": False, "whatsapp": wa}


def my_feedback(user: dict) -> list:
    rows = get_store().find("feedback", where={"uid": user["id"]}, order_by="created", desc=True, limit=50)
    return [{k: f[k] for k in ("id", "kind", "rating", "comment", "tags", "created")} for f in rows]
