"""Email verification, password reset and change, data export and account deletion."""
from __future__ import annotations

import time
from datetime import datetime, timezone

from .auth import revoke_sessions
from .config import env
from .crypto import hash_password, random_token, sha256, verify_password
from .errors import ApiError, not_found
from .integrations import emit
from .mail import send_mail
from .mailtpl import T
from .store import get_store

TTL = {"verify": 24 * 3600_000, "reset": 3600_000}


class _Bad(Exception):
    pass


def issue(uid: str, kind: str) -> str:
    """Random single-use token; only its hash is stored, so a database leak does not leak working links."""
    token = random_token(32)
    id = sha256(token)
    get_store().put("tokens", id, {"id": id, "uid": uid, "kind": kind, "exp": time.time() * 1000 + TTL[kind], "used": False})
    return token


def consume(token: str, kind: str) -> str:
    out: dict = {}

    def fn(c):
        if not c or c["kind"] != kind or c["used"] or c["exp"] < time.time() * 1000:
            raise _Bad()
        out["uid"] = c["uid"]
        return {**c, "used": True}

    try:
        get_store().update("tokens", sha256(token), fn)
    except _Bad:
        raise ApiError(400, "bad_token", "That link is invalid or has expired. Ask for a new one.") from None
    return out["uid"]


def _user(uid: str) -> dict:
    u = get_store().get("users", uid)
    if not u:
        raise not_found("Your account")
    return u


def send_verification(u: dict) -> None:
    if u.get("emailVerified"):
        return
    send_mail(u["email"], "verify", T.verify(u["name"], issue(u["id"], "verify")))


def verify_email(token: str) -> dict:
    uid = consume(token, "verify")
    get_store().update("users", uid, lambda c: {**c, "emailVerified": True} if c else c)
    return _user(uid)


def request_password_reset(email: str) -> None:
    """Always looks the same from outside, so the form cannot be used to find out who has an account."""
    st = get_store()
    idx = st.get("emails", email)
    u = st.get("users", idx["uid"]) if idx else None
    if u:
        send_mail(u["email"], "reset", T.reset(u["name"], issue(u["id"], "reset")))


def reset_password(token: str, password: str) -> None:
    uid = consume(token, "reset")
    h = hash_password(password)
    u = get_store().update("users", uid, lambda c: {**c, "hash": h, "emailVerified": True} if c else c)
    revoke_sessions(uid)
    if u:
        send_mail(u["email"], "pwchanged", T.password_changed(u["name"]))


def change_password(u: dict, current: str, new: str, keep_session: str | None) -> None:
    if not verify_password(current, u["hash"]):
        raise ApiError(403, "bad_credentials", "Your current password is not right.")
    h = hash_password(new)
    get_store().update("users", u["id"], lambda c: {**c, "hash": h} if c else c)
    revoke_sessions(u["id"], keep_session)
    send_mail(u["email"], "pwchanged", T.password_changed(u["name"]))


def export_data(u: dict) -> dict:
    """Everything we hold about the person, as a JSON file they can keep. Password hashes are left out."""
    st = get_store()
    q = lambda col, n: st.find(col, where={"uid": u["id"]}, limit=n)  # noqa: E731
    library, courses, jobs, feedback, sessions, tickets, orders = (
        q("library", 3000), q("courses", 200), q("jobs", 500), q("feedback", 500), q("learnsessions", 1000), q("tickets", 200), q("orders", 200))
    profile = {k: v for k, v in u.items() if k not in ("hash", "appliedOrders")}
    return {
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "profile": profile,
        "courses": [{"id": c["id"], "created": c["created"], "source": c.get("source"), "course": c["course"]} for c in courses],
        "runs": [{"id": j["id"], "courseId": j.get("courseId"), "status": j["status"], "created": j["created"], "finished": j.get("finished"),
                  "options": dict(j.get("opts") or {}), "usage": j.get("usage")} for j in jobs],
        "library": [{"id": l["id"], "kind": l["kind"], "title": l["title"], "tags": l.get("tags"), "source": l.get("source"),
                     "version": l.get("version"), "draft": l.get("draft"), "updated": l.get("updated")} for l in library],
        "feedback": feedback,
        "sessions": sessions,
        "tickets": tickets,
        "payments": [{"id": o["id"], "plan": o.get("plan"), "billing": o.get("billing"), "amountPaise": o.get("amountPaise"),
                      "currency": o.get("currency"), "status": o.get("status"), "created": o.get("created"), "paidAt": o.get("paidAt")} for o in orders],
    }


def delete_account(u: dict, password: str) -> dict:
    """Permanently deletes the account and what hangs off it. Feedback and tickets stay but are detached from the person;
    payment records stay (tax law) without a way to identify the person beyond the opaque id."""
    if not verify_password(password, u["hash"]):
        raise ApiError(403, "bad_credentials", "That password is not right.")
    st = get_store()
    uid = u["id"]
    for j in st.find("jobs", where={"uid": uid}, limit=2000):
        for k in (j.get("artifacts") or {}).values():
            st.delete_blob(k)
        for t in (j.get("topics") or {}).values():
            if t.get("imageBlob"):
                st.delete_blob(t["imageBlob"])
        st.delete("jobs", j["id"])
    for c in st.find("courses", where={"uid": uid}, limit=500):
        st.delete("courses", c["id"])
    for l in st.find("library", where={"uid": uid}, limit=5000):
        for b in (l.get("imageBlob"), l.get("fileBlob")):
            if b:
                st.delete_blob(b)
        st.delete("library", l["id"])
    for s in st.find("learnsessions", where={"uid": uid}, limit=5000):
        st.delete("learnsessions", s["id"])
    from . import community
    community.erase_user_content(uid)
    for f in st.find("feedback", where={"uid": uid}, limit=5000):
        st.put("feedback", f["id"], {**f, "uid": "deleted"})
    for t in st.find("tickets", where={"uid": uid}, limit=1000):
        st.put("tickets", t["id"], {**t, "uid": None, "email": None, "contact": None})
    for t in st.find("tokens", where={"uid": uid}, limit=100):
        st.delete("tokens", t["id"])
    for col in ("assets", "asset_versions", "progress", "chat", "entitlements", "follows"):
        for d in st.find(col, where={"uid": uid}, limit=10000):
            st.delete(col, d["id"])
    for sku in ("unit_notes", "monthly_notes", "chatbot"):
        st.delete("entitlements", f"{uid}:{sku}")
    st.delete("usercreds", uid)  # their own AI key goes with the account
    for f in st.find("follows", where={"to": uid}, limit=20000):
        st.delete("follows", f["id"])
    handle = (u.get("profile") or {}).get("handle")
    if handle:
        st.delete("handles", handle)
    st.delete("blocks", uid)
    st.delete("strikes", uid)
    revoke_sessions(uid)
    st.delete("emails", u["email"])
    from .antifraud import canonical_email
    st.delete("email_canon", canonical_email(u["email"]))
    if u.get("phoneHash"):
        st.delete("phones", u["phoneHash"])
    st.delete("otp", uid)
    st.delete("users", uid)
    send_mail(u["email"], "deleted", T.account_deleted(u["name"]))
    emit("account.deleted", {"userId": uid})
    return {"ok": True, "support": env().mail.support}
