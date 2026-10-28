"""Support chat and arranged support sessions, with the team reached through WhatsApp but neither side seeing the other's number.

A learner writes in the app. The team gets the message on WhatsApp (or in the admin screen) labelled only with a short code such as
C-AB12CD, the plan, and the text: no name, email, phone number or user id. The team answers by sending "C-AB12CD your reply" on
WhatsApp (or from the admin screen); the reply appears in the learner's chat. The learner never sees a phone number and the team
never receives one, so nobody's contact details leak either way.

A learner can also ask for a support session at a time that suits them. The team confirms (or declines) with a message such as
"S-FF31A0 confirm 2026-10-20 16:00" and both sides are emailed, with a reminder an hour before. Everything is tracked: how long the
first reply took, what is waiting, and what is done."""
from __future__ import annotations

import re
import time
from datetime import datetime, timedelta, timezone

from . import integrations as integ
from .config import env
from .crypto import uuid
from .errors import ApiError, forbidden, not_found
from .mail import send_mail
from .mailtpl import esc, layout
from .store import get_store

IST = timezone(timedelta(hours=5, minutes=30))
DAY = 86_400_000
MAX_TEXT = 1000


def _now() -> float:
    return time.time() * 1000


def _code(prefix: str) -> str:
    return f"{prefix}-{uuid().replace('-', '').upper()[:6]}"


def _clean(t: str) -> str:
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", (t or "")).strip()[:MAX_TEXT]


def when(ms: float) -> str:
    d = datetime.fromtimestamp(ms / 1000, IST)
    return f"{d.day} {d.strftime('%B %Y, %I:%M %p')} IST"


def _plan_name(u: dict) -> str:
    from . import auth as authmod

    return "Beta" if authmod.effective_plan(u) != "prototype" else "Free"


def _mail(u: dict, kind: str, subject: str, title: str, paras: list[str], label: str, path: str) -> None:
    send_mail(u["email"], kind, {"subject": subject, **layout(title, subject, paras, {"label": label, "url": f"{env().app_url.rstrip('/')}{path}"})}, from_=env().mail.noreply)


# ---------------------------------------------------------------- chat

def _view(c: dict | None) -> dict | None:
    if not c:
        return None
    return {k: c[k] for k in ("id", "code", "status", "topic", "created", "updated")}


def _messages(chat_id: str, limit: int = 200) -> list[dict]:
    rows = get_store().find("chat_msgs", where={"chat": chat_id}, order_by="created", limit=limit)
    return [{"id": r["id"], "role": r["role"], "text": r["text"], "created": r["created"]} for r in rows]


def current_chat(uid: str) -> dict | None:
    rows = get_store().find("chats", where={"uid": uid}, order_by="created", desc=True, limit=1)
    return rows[0] if rows else None


def mine(uid: str) -> dict:
    c = current_chat(uid)
    sess = get_store().find("support_sessions", where={"uid": uid}, order_by="created", desc=True, limit=10)
    return {"chat": _view(c), "messages": _messages(c["id"]) if c else [], "sessions": [_session_view(s) for s in sess]}


def user_message(user: dict, text: str, topic: str = "") -> dict:
    text = _clean(text)
    if len(text) < 2:
        raise ApiError(422, "invalid_input", "Write your message first.")
    st = get_store()
    c = current_chat(user["id"])
    now = _now()
    if not c or c["status"] == "closed":
        cid = f"ch_{uuid()[:12]}"
        c = {"id": cid, "code": _code("C"), "uid": user["id"], "status": "open", "topic": _clean(topic)[:60], "plan": _plan_name(user), "created": now, "updated": now,
             "lastUserAt": now, "lastTeamAt": 0, "firstReplyAt": 0, "mailedAt": 0}
        st.put("chats", cid, c)
    else:
        st.update("chats", c["id"], lambda x: {**x, "status": "open", "updated": now, "lastUserAt": now} if x else x)
    mid = f"cm_{uuid()[:14]}"
    st.put("chat_msgs", mid, {"id": mid, "chat": c["id"], "uid": user["id"], "role": "user", "text": text, "created": now, "via": "web"})
    integ.notify_ops(f"[{c['code']}] {c['plan']} learner:\n{text[:600]}\n\nReply on WhatsApp: {c['code']} your answer")
    integ.emit("support.chat", {"code": c["code"], "plan": c["plan"]})
    return mine(user["id"])


def close_chat(user: dict) -> dict:
    c = current_chat(user["id"])
    if c and c["status"] != "closed":
        get_store().update("chats", c["id"], lambda x: {**x, "status": "closed", "updated": _now()} if x else x)
    return mine(user["id"])


def team_reply(code: str, text: str, via: str) -> dict:
    """The team's answer. Finds the chat by its code only, so nothing about the learner is needed to reply."""
    text = _clean(text)
    if not text:
        raise ApiError(422, "invalid_input", "Write the reply first.")
    st = get_store()
    rows = st.find("chats", where={"code": code.upper()}, limit=1)
    if not rows:
        raise not_found("That chat")
    c = rows[0]
    now = _now()
    mid = f"cm_{uuid()[:14]}"
    st.put("chat_msgs", mid, {"id": mid, "chat": c["id"], "uid": c["uid"], "role": "team", "text": text, "created": now, "via": via})
    st.update("chats", c["id"], lambda x: {**x, "status": "answered", "updated": now, "lastTeamAt": now, "firstReplyAt": x.get("firstReplyAt") or now} if x else x)
    u = st.get("users", c["uid"])
    # an email at most every ten minutes, so a long conversation does not flood the inbox
    if u and now - (c.get("mailedAt") or 0) > 10 * 60_000:
        st.update("chats", c["id"], lambda x: {**x, "mailedAt": now} if x else x)
        _mail(u, "support-reply", "We replied to your message", "Our team replied", [esc(text[:400]), "You can answer in the chat in your account."], "Open the chat", "/app/support")
    return {"ok": True, "code": c["code"]}


def team_close(code: str) -> None:
    rows = get_store().find("chats", where={"code": code.upper()}, limit=1)
    if not rows:
        raise not_found("That chat")
    get_store().update("chats", rows[0]["id"], lambda x: {**x, "status": "closed", "updated": _now()} if x else x)


# ---------------------------------------------------------------- sessions

PER_MONTH = {"prototype": 1, "learner": 4, "classroom": 8}


def _session_view(s: dict) -> dict:
    return {k: s.get(k) for k in ("id", "code", "topic", "note", "wanted", "at", "status", "created", "teamNote")}


def request_session(user: dict, topic: str, wanted: float, note: str) -> dict:
    from . import auth as authmod

    now = _now()
    if not (now + 30 * 60_000 <= wanted <= now + 14 * DAY):
        raise ApiError(422, "invalid_input", "Pick a time between 30 minutes and 14 days from now.")
    st = get_store()
    mine_ = st.find("support_sessions", where={"uid": user["id"]}, order_by="created", desc=True, limit=50)
    if any(s["status"] in ("requested", "confirmed") for s in mine_):
        raise ApiError(409, "session_open", "You already have a support session waiting. Cancel it first to ask for another time.")
    month = datetime.fromtimestamp(now / 1000, IST).strftime("%Y-%m")
    cap = PER_MONTH.get(authmod.effective_plan(user), 1)
    if sum(1 for s in mine_ if datetime.fromtimestamp(s["created"] / 1000, IST).strftime("%Y-%m") == month) >= cap:
        raise ApiError(429, "quota_exceeded", f"Your plan includes {cap} support session{'s' if cap != 1 else ''} a month. It renews next month.", {"kind": "support_session", "limit": cap})
    sid = f"ss_{uuid()[:12]}"
    s = {"id": sid, "code": _code("S"), "uid": user["id"], "topic": _clean(topic)[:80], "note": _clean(note)[:400], "wanted": wanted, "at": 0, "status": "requested", "created": now, "plan": _plan_name(user)}
    st.put("support_sessions", sid, s)
    integ.notify_ops(f"[{s['code']}] {s['plan']} learner asks for a support session around {when(wanted)}.\nTopic: {s['topic'] or '-'}\n"
                     f"To confirm: {s['code']} confirm YYYY-MM-DD HH:MM  (IST)   To decline: {s['code']} decline reason")
    return _session_view(s)


def cancel_session(user: dict, sid: str) -> dict:
    s = get_store().update("support_sessions", sid, lambda c: {**c, "status": "cancelled"} if c and c["uid"] == user["id"] and c["status"] in ("requested", "confirmed") else c)
    if not s or s["uid"] != user["id"]:
        raise not_found("That session")
    return _session_view(s)


def decide_session(code: str, action: str, at: float | None = None, message: str = "") -> dict:
    st = get_store()
    rows = st.find("support_sessions", where={"code": code.upper()}, limit=1)
    if not rows:
        raise not_found("That session")
    s = rows[0]
    if action == "confirm":
        at = at or s["wanted"]
        nxt = {**s, "status": "confirmed", "at": at, "teamNote": _clean(message)[:300], "reminded": False}
    elif action in ("decline", "done"):
        nxt = {**s, "status": "declined" if action == "decline" else "done", "teamNote": _clean(message)[:300]}
    else:
        raise ApiError(422, "invalid_input", "Unknown action.")
    st.put("support_sessions", s["id"], nxt)
    u = st.get("users", s["uid"])
    if u and action == "confirm":
        _mail(u, "session-confirmed", "Your support session is confirmed", "Your support session is booked",
              [f"We will be with you on <b>{esc(when(nxt['at']))}</b>.", "Open the chat in your account at that time: the session happens there, so you do not need to share a phone number.",
               esc(nxt["teamNote"]) if nxt["teamNote"] else ""], "Open support", "/app/support")
    elif u and action == "decline":
        _mail(u, "session-confirmed", "About your support session request", "We could not fit that time",
              ["We are sorry, we cannot take a session at the time you asked for." + (f" {esc(nxt['teamNote'])}" if nxt["teamNote"] else ""), "Please ask again for another time, or write to us in the chat."],
              "Ask for another time", "/app/support")
    return _session_view(nxt)


def remind_due(t0: float) -> int:
    """An hour before a confirmed session, email the learner once."""
    st = get_store()
    n = 0
    for s in st.find("support_sessions", where={"status": "confirmed"}, limit=200):
        if s.get("reminded") or not (t0 <= s["at"] <= t0 + 60 * 60_000):
            continue
        st.update("support_sessions", s["id"], lambda c: {**c, "reminded": True} if c else c)
        u = st.get("users", s["uid"])
        if u:
            _mail(u, "session-reminder", "Your support session starts within the hour", "Your support session is soon",
                  [f"Your session is at <b>{esc(when(s['at']))}</b>. Open the chat at that time."], "Open support", "/app/support")
            n += 1
    return n


# ---------------------------------------------------------------- WhatsApp inbound (the team's replies)

_CMD = re.compile(r"^\s*([CS]-[A-Za-z0-9]{6})\s+(.+)$", re.S)


def handle_whatsapp(sender: str, text: str) -> str:
    """Only messages from the team's own WhatsApp number are accepted. Returns a short confirmation for the team."""
    if not env().whatsapp.ops_to or sender != env().whatsapp.ops_to:
        return ""
    m = _CMD.match(text or "")
    if not m:
        return "Start your message with the code, for example: C-AB12CD your answer."
    code, rest = m.group(1).upper(), m.group(2).strip()
    try:
        if code.startswith("C-"):
            if rest.lower() == "close":
                team_close(code)
                return f"{code} closed."
            team_reply(code, rest, "whatsapp")
            return f"Sent to {code}."
        parts = rest.split(None, 1)
        act = parts[0].lower()
        if act == "confirm":
            dt = re.match(r"^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})\s*(.*)$", parts[1] if len(parts) > 1 else "")
            at = None
            if dt:
                y, mo, d = (int(x) for x in dt.group(1).split("-"))
                at = datetime(y, mo, d, int(dt.group(2)), int(dt.group(3)), tzinfo=IST).timestamp() * 1000
            decide_session(code, "confirm", at, dt.group(4) if dt else "")
            return f"{code} confirmed."
        if act in ("decline", "done"):
            decide_session(code, act, None, parts[1] if len(parts) > 1 else "")
            return f"{code} {act}d." if act == "decline" else f"{code} marked done."
        return "Use: confirm YYYY-MM-DD HH:MM, decline reason, or done."
    except ApiError as e:
        return e.message if hasattr(e, "message") else "Could not do that."


# ---------------------------------------------------------------- for the owner's screen

def team_overview() -> dict:
    st = get_store()
    chats = st.find("chats", order_by="updated", desc=True, limit=100)
    sess = st.find("support_sessions", order_by="created", desc=True, limit=100)
    firsts = [(c["firstReplyAt"] - c["created"]) / 60_000 for c in chats if c.get("firstReplyAt")]
    rows = []
    for c in chats:
        last = st.find("chat_msgs", where={"chat": c["id"]}, order_by="created", desc=True, limit=1)
        rows.append({"id": c["id"], "code": c["code"], "plan": c.get("plan", ""), "status": c["status"], "topic": c.get("topic", ""), "created": c["created"], "updated": c["updated"],
                     "waiting": c["status"] == "open" and c.get("lastUserAt", 0) > c.get("lastTeamAt", 0), "last": (last[0]["text"][:160] if last else "")})
    return {"chats": rows, "sessions": [{**_session_view(s), "plan": s.get("plan", "")} for s in sess],
            "stats": {"open": sum(1 for c in chats if c["status"] != "closed"), "waiting": sum(1 for r in rows if r["waiting"]),
                      "avgFirstReplyMin": round(sum(firsts) / len(firsts), 1) if firsts else None,
                      "sessionsRequested": sum(1 for s in sess if s["status"] == "requested"), "sessionsConfirmed": sum(1 for s in sess if s["status"] == "confirmed")}}


def team_messages(chat_id: str) -> list[dict]:
    if not get_store().get("chats", chat_id):
        raise not_found("That chat")
    return _messages(chat_id)
