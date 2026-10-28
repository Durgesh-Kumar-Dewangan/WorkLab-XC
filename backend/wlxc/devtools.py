"""The developer console's back end: find and fix one learner's problem without ever seeing more of them than the problem needs.

The rules, in the order they protect people:
 1. People are known by a support reference (WLX-XXXXXX) that they can read out from Settings. Nobody browses a list of names.
 2. Metadata only. A developer sees plan, counts, statuses, error codes and times. Never a name, a full email, a lesson, a chat, a note, an
    upload, a password, an IP address or a payment instrument.
 3. To look at one learner a developer opens a case with a written reason. It lasts 30 minutes, ends when they close it, and every look and every
    fix is written to the audit trail.
 4. The learner can read that trail themselves (Settings, "Who looked at my account").
 5. Fixes are a short, safe list. Nothing here edits content or reads it.
 6. Error records are scrubbed of emails, tokens and long numbers before they are stored."""
from __future__ import annotations

import base64
import hashlib
import re
import time

from . import abuse
from .auth import is_admin
from .config import env
from .crypto import uuid
from .errors import ApiError, forbidden, not_found
from .store import get_store

CASE_MS = 30 * 60_000
MIN_REASON = 10
STATES = ("open", "investigating", "resolved", "ignored")

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
_TOKEN = re.compile(r"\b[A-Za-z0-9_\-]{28,}\b")
_NUMS = re.compile(r"\b\d{6,}\b")
_ID = re.compile(r"^(u_|c-|ord_|ss_|sub_|j_|job_)?[A-Za-z0-9_-]{12,}$|^\d+$")


def _now() -> float:
    return time.time() * 1000


# ------------------------------------------------------------------ who may use it
def is_dev(u: dict | None) -> bool:
    return bool(u) and (is_admin(u) or u.get("role") == "developer" or u["email"].lower() in env().dev_emails)


def require_dev(u: dict | None) -> dict:
    if not is_dev(u):
        raise forbidden()
    return u  # type: ignore[return-value]


# ------------------------------------------------------------------ references and masking
def ref_of(uid: str) -> str:
    """A short reference that stands for one account. It cannot be turned back into a name, and the learner can read theirs in Settings."""
    r = "WLX-" + base64.b32encode(hashlib.sha256(("ref:" + uid).encode()).digest())[:6].decode()
    get_store().insert("refs", r, {"id": r, "uid": uid})
    return r


def uid_of(ref: str) -> str:
    hit = get_store().get("refs", (ref or "").strip().upper()[:12])
    if not hit:
        raise not_found("That reference")
    return hit["uid"]


def mask_email(e: str) -> str:
    name, _, dom = (e or "").partition("@")
    return (name[:1] + "***@" + dom) if dom else "***"


def scrub(text: str, n: int = 200) -> str:
    """Takes out anything that identifies a person or acts as a key, before a message is kept."""
    t = _EMAIL.sub("[email]", text or "")
    t = _TOKEN.sub("[token]", t)
    t = _NUMS.sub("[number]", t)
    return " ".join(t.split())[:n]


def template(path: str) -> str:
    """/api/courses/c-abc-123/public becomes /api/courses/{id}/public, so one fault is one record, not one per learner."""
    return "/".join("{id}" if _ID.match(s) else s for s in (path or "").split("/"))[:120]


# ------------------------------------------------------------------ problems, as they happen
def record_issue(user: dict | None, method: str, path: str, status: int, code: str, message: str, rid: str, source: str = "server") -> None:
    """Remembers a server fault (or a fault the app reported) against the learner it happened to, without any of their data."""
    st = get_store()
    route = f"{method} {template(path)}"
    fp = hashlib.sha256(f"{source}|{route}|{status}|{code}".encode()).hexdigest()[:12]
    uid = user["id"] if user else ""
    now = _now()

    def fn(c):
        c = c or {"id": f"is_{fp}", "fp": fp, "route": route, "status": status, "code": code, "source": source, "message": scrub(message), "first": now, "state": "open",
                  "count": 0, "learners": {}, "notes": [], "lastRid": ""}
        learners = dict(c["learners"])
        if uid:
            h = hashlib.sha256(uid.encode()).hexdigest()[:10]
            learners[h] = {"uid": uid, "last": now, "n": learners.get(h, {}).get("n", 0) + 1}
            if len(learners) > 50:
                learners.pop(min(learners, key=lambda k: learners[k]["last"]))
        state = "open" if c["state"] == "resolved" else c["state"]  # it came back
        return {**c, "count": c["count"] + 1, "last": now, "lastRid": rid, "learners": learners, "state": state}

    st.update("issues", f"is_{fp}", fn)


def list_issues(state: str = "") -> list[dict]:
    rows = get_store().find("issues", where={"state": state} if state in STATES else None, order_by="last", desc=True, limit=200)
    return [{"id": r["id"], "route": r["route"], "status": r["status"], "code": r["code"], "source": r["source"], "message": r["message"], "state": r["state"],
             "count": r["count"], "learners": len(r["learners"]), "first": r["first"], "last": r["last"], "lastRid": r.get("lastRid", ""), "notes": r.get("notes", [])[-5:],
             # a few references to open a case with; no names, no emails
             "samples": [ref_of(v["uid"]) for v in sorted(r["learners"].values(), key=lambda v: -v["last"])[:3]]} for r in rows]


def set_issue(dev: dict, issue_id: str, state: str, note: str = "") -> dict:
    if state not in STATES:
        raise ApiError(400, "bad_state", "That is not a state an issue can be in.")
    st = get_store()
    now = _now()
    out = st.update("issues", issue_id, lambda c: {**c, "state": state, "notes": [*c.get("notes", []), {"at": now, "state": state, "note": scrub(note, 300)}][-30:]} if c else c)
    if not out:
        raise not_found("That issue")
    abuse.audit(dev["id"], "dev.issue_state", issue_id, {"state": state})
    return {"id": issue_id, "state": state}


# ------------------------------------------------------------------ cases: the only way to look at one learner
def open_case(dev: dict, ref: str, reason: str) -> dict:
    reason = " ".join((reason or "").split())
    if len(reason) < MIN_REASON:
        raise ApiError(422, "reason_required", f"Say why you need to look at this account, in at least {MIN_REASON} characters (a ticket code or a sentence).")
    uid = uid_of(ref)
    if uid == dev["id"]:
        raise ApiError(400, "own_account", "Use your own account's pages to look at yourself.")
    cid = f"case_{uuid()[:12]}"
    now = _now()
    case = {"id": cid, "dev": dev["id"], "uid": uid, "ref": ref.upper(), "reason": reason[:300], "opened": now, "until": now + CASE_MS, "closed": False, "actions": []}
    get_store().put("cases", cid, case)
    abuse.audit(dev["id"], "dev.case_open", uid, {"case": cid, "reason": case["reason"]})
    return {"id": cid, "ref": case["ref"], "until": case["until"]}


def _case(dev: dict, cid: str) -> dict:
    c = get_store().get("cases", cid)
    if not c or c["dev"] != dev["id"]:
        raise not_found("That case")
    if c["closed"] or c["until"] < _now():
        raise ApiError(403, "case_ended", "This case has ended. Open a new one to keep working on this account.")
    return c


def close_case(dev: dict, cid: str) -> dict:
    c = get_store().get("cases", cid)
    if not c or c["dev"] != dev["id"]:
        raise not_found("That case")
    get_store().update("cases", cid, lambda x: {**x, "closed": True} if x else x)
    abuse.audit(dev["id"], "dev.case_close", c["uid"], {"case": cid})
    return {"ok": True}


def learner_view(dev: dict, cid: str) -> dict:
    """What a developer may see about one learner during a case: how the account is doing, never what the learner made or said."""
    from . import activity, usage
    from .addons import entitlements_of
    from .auth import plan_of as effective_plan
    c = _case(dev, cid)
    st = get_store()
    u = st.get("users", c["uid"])
    if not u:
        raise not_found("That account")
    abuse.audit(dev["id"], "dev.view", c["uid"], {"case": cid})
    uid = u["id"]
    jobs = st.find("jobs", where={"uid": uid}, order_by="created", desc=True, limit=10)
    orders = st.find("orders", where={"uid": uid}, order_by="created", desc=True, limit=10)
    issues = [i for i in st.find("issues", limit=300) if any(v["uid"] == uid for v in i["learners"].values())]
    blk = abuse.active_block(uid)
    return {
        "ref": c["ref"], "case": {"id": cid, "reason": c["reason"], "until": c["until"]},
        "account": {"plan": effective_plan(u), "planUntil": u.get("planUntil"), "created": u.get("created"), "lastSeen": u.get("lastSeen"), "emailVerified": bool(u.get("emailVerified")),
                    "emailHint": mask_email(u["email"]), "country": (u.get("geo") or {}).get("country", ""), "role": u.get("role", "user"), "sessions": u.get("sessions", 0)},
        "usageToday": {k: usage.used(uid, k) for k in ("sessions", "gen", "exam", "chat", "jobs", "images")},
        "entitlements": [{"sku": e["sku"], "quantity": e.get("quantity"), "validUntil": e.get("validUntil")} for e in entitlements_of(uid)],
        "block": {"reason": blk["reason"], "until": blk["until"]} if blk else None,
        "jobs": [{"id": j["id"], "status": j.get("status"), "topics": len(j.get("topicIds") or []), "created": j.get("created"), "error": scrub(str(j.get("error") or ""), 120)} for j in jobs],
        "orders": [{"id": o["id"], "status": o["status"], "amountMinor": o["amountPaise"], "currency": o["currency"], "gateway": o.get("gateway", "razorpay"), "country": o.get("country", ""),
                    "created": o["created"], "activated": bool(o.get("activated"))} for o in orders],
        "issues": [{"id": i["id"], "route": i["route"], "status": i["status"], "code": i["code"], "message": i["message"], "state": i["state"], "last": i["last"]} for i in issues[:15]],
        "activity": activity.days(uid, 30),
        "actions": [{"at": a["at"], "action": a["action"]} for a in c["actions"]],
        "hidden": ["name", "full email", "lessons", "chats", "notes", "uploads", "passwords", "IP address", "payment instruments"],
    }


# ------------------------------------------------------------------ fixes
ACTIONS = {
    "reset_usage": "Give back today's allowance (for a learner who hit a limit because of our fault)",
    "resend_verification": "Send the email-verification message again",
    "unblock": "Lift an automatic block",
    "recheck_payment": "Check a payment that did not switch the plan on, with the payment provider",
    "clear_stuck_jobs": "End runs that are stuck so the learner can start again",
}


def act(dev: dict, cid: str, action: str, note: str = "", target: str = "") -> dict:
    if action not in ACTIONS:
        raise ApiError(400, "bad_action", "That is not something the console can do.")
    from . import accounts, billing, usage
    c = _case(dev, cid)
    st = get_store()
    uid = c["uid"]
    u = st.get("users", uid)
    if not u:
        raise not_found("That account")
    result = "done"
    if action == "reset_usage":
        for k in ("sessions", "gen", "exam", "chat", "jobs", "images"):
            st.put("usage", f"{uid}:{k}:{usage.day_key()}", {"n": 0})
    elif action == "resend_verification":
        if u.get("emailVerified"):
            raise ApiError(409, "already_verified", "This email is already confirmed.")
        accounts.send_verification(u)
    elif action == "unblock":
        if not abuse.active_block(uid):
            raise ApiError(409, "not_blocked", "This account is not blocked.")
        abuse.unblock_user(uid, dev["id"])
    elif action == "recheck_payment":
        o = st.get("orders", target) if target else None
        if not o or o["uid"] != uid or o["status"] == "paid" or not o.get("linkId"):
            raise ApiError(409, "nothing_to_check", "Pick an unpaid order of this learner that has a payment link.")
        if o.get("gateway") == "paypal":
            r = billing.settle_paypal(o["id"], o["linkId"], None)
        else:
            r = billing.settle_from_link(o["linkId"], o["id"], None)
        result = "paid" if r.get("paid") else "not paid yet"
    elif action == "clear_stuck_jobs":
        n = 0
        for j in st.find("jobs", where={"uid": uid}, limit=30):
            if j.get("status") in ("queued", "running") and _now() - (j.get("created") or 0) > 10 * 60_000:
                st.update("jobs", j["id"], lambda x: {**x, "status": "failed", "error": "ended by support"} if x else x)
                n += 1
        result = f"{n} ended"
    entry = {"at": _now(), "action": action}
    st.update("cases", cid, lambda x: {**x, "actions": [*x["actions"], entry]} if x else x)
    abuse.audit(dev["id"], f"dev.{action}", uid, {"case": cid, "note": scrub(note, 200), "result": result})
    return {"ok": True, "result": result}


# ------------------------------------------------------------------ what the learner can see
def access_log(user: dict) -> list[dict]:
    """The learner's own trail: every time support or a developer opened a case on their account, when, why and what was done. No names."""
    rows = [a for a in get_store().find("audit", where={"target": user["id"]}, order_by="created", desc=True, limit=200) if a["action"].startswith(("dev.", "admin.user_view"))]
    out = []
    for a in rows:
        label = {"dev.case_open": "Support opened a case on your account", "dev.view": "Support looked at your account's status", "dev.case_close": "Support closed the case",
                 "dev.reset_usage": "Support gave back today's allowance", "dev.resend_verification": "Support re-sent your verification email", "dev.unblock": "Support lifted a block",
                 "dev.recheck_payment": "Support re-checked a payment", "dev.clear_stuck_jobs": "Support ended stuck runs", "admin.user_view": "The WorkLab XC team reviewed your account details"}.get(a["action"], "Support worked on your account")
        out.append({"at": a["created"], "what": label, "why": (a.get("detail") or {}).get("reason", "")})
    return out
