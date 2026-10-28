"""Accounts, sessions and cookies."""
from __future__ import annotations

import time
from datetime import datetime, timezone
from urllib.parse import quote, unquote

from .config import env
from .crypto import DUMMY_HASH, hash_password, random_token, sha256, uuid, verify_password
from .errors import ApiError
from .plans import LIMITS  # noqa: F401
from .store import get_store
from .web import Req

COOKIE = "wlxc_sid"
TTL_MS = 30 * 24 * 3600_000


def now_ms() -> int:
    return int(time.time() * 1000)


def plan_of(u: dict, now: float | None = None) -> str:
    """The plan a person actually has (what they pay for)."""
    now = now_ms() if now is None else now
    return u["plan"] if u["plan"] != "prototype" and u.get("planUntil") and u["planUntil"] > now else "prototype"


def effective_plan(u: dict, now: float | None = None) -> str:
    """The plan whose limits apply. Someone who connected their own AI key gets every feature, since the cost is theirs."""
    return "classroom" if u.get("byok") else plan_of(u, now)


def is_admin(u: dict) -> bool:
    return u.get("role") == "admin" or u["email"] in env().admin_emails


def _phone_required(u: dict) -> bool:
    from .antifraud import phone_required_for
    return phone_required_for(u)


def public_user(u: dict) -> dict:
    return {"id": u["id"], "email": u["email"], "name": u["name"], "plan": plan_of(u), "planUntil": u.get("planUntil"), "byok": bool(u.get("byok")),
            "emailVerified": bool(u.get("emailVerified")), "admin": is_admin(u),
            "phoneVerified": bool(u.get("phoneVerified")), "phoneRequired": _phone_required(u)}


def register(name: str, email: str, password: str, consent: dict | None = None) -> dict:
    store = get_store()
    id = f"u_{uuid()}"
    # The email index doc is what guarantees uniqueness, even with concurrent sign-ups.
    from .antifraud import canonical_email  # late import: antifraud uses this module

    if not store.insert("emails", email, {"uid": id}):
        raise ApiError(409, "email_taken", "An account with this email already exists. Sign in instead.")
    # The same mailbox written another way (a.b@gmail.com, ab+x@gmail.com) is the same person.
    if not store.insert("email_canon", canonical_email(email), {"uid": id}):
        store.delete("emails", email)
        raise ApiError(409, "email_taken", "An account with this email already exists. Sign in instead.")
    user = {"id": id, "email": email, "name": name, "hash": hash_password(password), "plan": "prototype", "planUntil": None, "role": "user",
            "emailVerified": False, "created": now_ms(), "sessions": 0, "unrated": 0, "lastSession": None, "appliedOrders": []}
    if consent:
        user["consent"] = consent
    store.put("users", id, user)
    return user


def login(email: str, password: str) -> dict:
    store = get_store()
    idx = store.get("emails", email)
    user = store.get("users", idx["uid"]) if idx else None
    ok = verify_password(password, user["hash"] if user else DUMMY_HASH)
    if not user or not ok:
        raise ApiError(401, "bad_credentials", "That email and password do not match.")
    now = now_ms()
    store.update("users", user["id"], lambda c: {**c, "lastLogin": now} if c else c)
    return {**user, "lastLogin": now}


def create_session(uid: str) -> tuple[str, int]:
    token = random_token()
    expires = now_ms() + TTL_MS
    id = sha256(token)
    get_store().put("auth", id, {"id": id, "uid": uid, "exp": expires, "created": now_ms()})
    return token, expires


def destroy_session(token: str | None) -> None:
    if token:
        get_store().delete("auth", sha256(token))


def read_cookie(req: Req, name: str = COOKIE) -> str | None:
    h = req.header("cookie")
    if not h:
        return None
    for part in h.split(";"):
        i = part.find("=")
        if i > 0 and part[:i].strip() == name:
            return unquote(part[i + 1:].strip())
    return None


def _secure() -> str:
    return "; Secure" if env().app_url.startswith("https") else ""


def set_cookie(token: str, expires_ms: int) -> str:
    exp = datetime.fromtimestamp(expires_ms / 1000, timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")
    return f"{COOKIE}={quote(token, safe='')}; Path=/; HttpOnly; SameSite=Lax; Expires={exp}{_secure()}"


def clear_cookie() -> str:
    return f"{COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{_secure()}"


def user_from_request(req: Req) -> dict | None:
    token = read_cookie(req)
    if not token:
        return None
    store = get_store()
    s = store.get("auth", sha256(token))
    if not s or s["exp"] < now_ms():
        return None
    return store.get("users", s["uid"])


def session_id_from_request(req: Req) -> str | None:
    t = read_cookie(req)
    return sha256(t) if t else None


def revoke_sessions(uid: str, keep_id: str | None = None) -> None:
    store = get_store()
    for s in store.find("auth", where={"uid": uid}, limit=500):
        if s["id"] != keep_id:
            store.delete("auth", s["id"])
