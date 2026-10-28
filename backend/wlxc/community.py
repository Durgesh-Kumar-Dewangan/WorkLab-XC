"""Posts, comments, likes, direct messages, blocking, reporting and the moderation queue.

Everything is opt-in: you need a public profile with a handle to post. Safety rules in one place:
  * text is cleaned, length-limited, filtered for banned words and for link spam;
  * rate limits per person; new accounts cannot post links for their first day;
  * a message to someone who does not follow you is a *request*: one message until they reply;
  * blocking hides both people from each other everywhere;
  * three different people reporting a post hides it automatically until an admin reviews it;
  * admins can dismiss, hide, remove, or block the author, and every action is written to the audit trail."""
from __future__ import annotations

import re
import time

from . import abuse
from .config import env, integrations
from .crypto import uuid
from .errors import ApiError, forbidden, not_found
from .profile import profile_of
from .store import get_store
from .web import rate_limit

POST_MAX = 1000
COMMENT_MAX = 500
DM_MAX = 1000
AUTO_HIDE_REPORTS = 3
DAY = 86_400_000
DEFAULT_BANNED = ("fuck", "bitch", "bastard", "slut", "nigger", "faggot", "rape you", "kill yourself", "kys", "whore")
LINK = re.compile(r"(https?://|www\.)\S+", re.I)


def _now() -> float:
    return time.time() * 1000


# ------------------------------------------------------------------ text rules
def clean_text(raw: str, max_len: int, user: dict) -> str:
    t = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f‪-‮⁦-⁩]", "", raw or "")  # control and bidi-override characters
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t).strip()
    if not t:
        raise ApiError(422, "empty", "Write something first.")
    if len(t) > max_len:
        raise ApiError(422, "too_long", f"Keep it under {max_len} characters.")
    low = re.sub(r"[^a-z0-9 ]", "", t.lower().replace("0", "o").replace("1", "i").replace("3", "e").replace("@", "a").replace("$", "s"))
    extra = [w.strip().lower() for w in (env().community_banned or "").split(",") if w.strip()]
    for w in (*DEFAULT_BANNED, *extra):
        if re.search(r"(?<![a-z])" + re.escape(w) + r"(?![a-z])", low):
            raise ApiError(422, "not_allowed", "That message has language we do not allow here. Please rephrase it.")
    links = LINK.findall(t)
    if len(links) > 2:
        raise ApiError(422, "too_many_links", "Please keep it to two links at most.")
    if links and _now() - user.get("created", 0) < DAY:
        raise ApiError(422, "links_new_account", "New accounts can share links after their first day.")
    return t


def _need_ready(user: dict) -> dict:
    if integrations().mail and not user.get("emailVerified"):
        raise ApiError(403, "email_unverified", "Confirm your email address before posting or messaging.")
    p = profile_of(user)
    if not p["handle"] or not p["publicProfile"]:
        raise ApiError(400, "profile_required", "Choose a handle and turn on your public profile in Settings first.")
    return p


def _author(uid: str, cache: dict) -> dict:
    if uid not in cache:
        u = get_store().get("users", uid)
        p = profile_of(u) if u else None
        cache[uid] = {"handle": p["handle"], "name": u["name"], "institute": p["institute"]} if u and p and p["handle"] else {"handle": None, "name": "Former member", "institute": ""}
    return cache[uid]


def _blocked_pair(a: str, b: str) -> bool:
    st = get_store()
    return bool(st.get("userblocks", f"{a}>{b}") or st.get("userblocks", f"{b}>{a}"))


def _blocks_of(uid: str) -> set[str]:
    st = get_store()
    mine = {r["to"] for r in st.find("userblocks", where={"from": uid}, limit=2000)}
    theirs = {r["from"] for r in st.find("userblocks", where={"to": uid}, limit=2000)}
    return mine | theirs


# ------------------------------------------------------------------ posts
def create_post(user: dict, text: str, topic: str | None = None) -> dict:
    _need_ready(user)
    rate_limit(f"post:{user['id']}", 10, 3600)
    t = clean_text(text, POST_MAX, user)
    post = {"id": f"p_{uuid()}", "uid": user["id"], "text": t, "topic": (topic or "").strip()[:120] or None, "created": _now(), "status": "visible", "likes": 0, "comments": 0}
    get_store().put("posts", post["id"], post)
    return _post_out(post, user["id"], {})


def _post_out(p: dict, viewer_id: str, cache: dict) -> dict:
    st = get_store()
    return {"id": p["id"], "author": _author(p["uid"], cache), "text": p["text"], "topic": p.get("topic"), "created": p["created"], "likes": p["likes"], "comments": p["comments"],
            "youLiked": bool(st.get("likes", f"{p['id']}:{viewer_id}")), "mine": p["uid"] == viewer_id}


def feed(viewer: dict, scope: str = "all", before: float | None = None, limit: int = 20) -> dict:
    st = get_store()
    hide = _blocks_of(viewer["id"])
    follow = {r["to"] for r in st.find("follows", where={"from": viewer["id"]}, limit=5000)} | {viewer["id"]} if scope == "following" else None
    out, cache, cursor = [], {}, before
    for _ in range(5):  # skip hidden/blocked rows without loading the whole table
        rows = st.find("posts", where={"status": "visible"}, order_by="created", desc=True, limit=limit * 3, until=("created", (cursor or _now() + 1) - 0.001))
        if not rows:
            cursor = None
            break
        for p in rows:
            cursor = p["created"]
            if p["uid"] in hide or (follow is not None and p["uid"] not in follow):
                continue
            out.append(_post_out(p, viewer["id"], cache))
            if len(out) >= limit:
                return {"posts": out, "next": cursor}
        if len(rows) < limit * 3:
            cursor = None
            break
    return {"posts": out, "next": cursor}


def get_post(viewer: dict, post_id: str) -> dict:
    st = get_store()
    p = st.get("posts", post_id)
    if not p or p["status"] != "visible" or p["uid"] in _blocks_of(viewer["id"]):
        raise not_found("That post")
    cache: dict = {}
    hide = _blocks_of(viewer["id"])
    cs = [c for c in st.find("comments", where={"postId": post_id, "status": "visible"}, order_by="created", limit=300) if c["uid"] not in hide]
    return {"post": _post_out(p, viewer["id"], cache),
            "comments": [{"id": c["id"], "author": _author(c["uid"], cache), "text": c["text"], "created": c["created"], "mine": c["uid"] == viewer["id"]} for c in cs]}


def delete_post(user: dict, post_id: str) -> dict:
    st = get_store()
    p = st.get("posts", post_id)
    if not p or p["uid"] != user["id"]:
        raise not_found("That post")
    _erase_post(post_id)
    return {"ok": True}


def _erase_post(post_id: str) -> None:
    st = get_store()
    for c in st.find("comments", where={"postId": post_id}, limit=5000):
        st.delete("comments", c["id"])
    for l in st.find("likes", where={"postId": post_id}, limit=20000):
        st.delete("likes", l["id"])
    st.delete("posts", post_id)


def toggle_like(user: dict, post_id: str) -> dict:
    st = get_store()
    p = st.get("posts", post_id)
    if not p or p["status"] != "visible" or _blocked_pair(user["id"], p["uid"]):
        raise not_found("That post")
    rate_limit(f"like:{user['id']}", 200, 3600)
    lid = f"{post_id}:{user['id']}"
    made = st.insert("likes", lid, {"id": lid, "postId": post_id, "uid": user["id"], "created": _now()})
    if not made:
        st.delete("likes", lid)
    n = st.update("posts", post_id, lambda c: {**c, "likes": max(0, c["likes"] + (1 if made else -1))} if c else c)
    return {"liked": made, "likes": n["likes"] if n else 0}


def add_comment(user: dict, post_id: str, text: str) -> dict:
    _need_ready(user)
    st = get_store()
    p = st.get("posts", post_id)
    if not p or p["status"] != "visible" or _blocked_pair(user["id"], p["uid"]):
        raise not_found("That post")
    rate_limit(f"comment:{user['id']}", 30, 3600)
    t = clean_text(text, COMMENT_MAX, user)
    c = {"id": f"c_{uuid()}", "postId": post_id, "uid": user["id"], "text": t, "created": _now(), "status": "visible"}
    st.put("comments", c["id"], c)
    st.update("posts", post_id, lambda x: {**x, "comments": x["comments"] + 1} if x else x)
    return {"id": c["id"], "author": _author(user["id"], {}), "text": t, "created": c["created"], "mine": True}


def delete_comment(user: dict, comment_id: str) -> dict:
    st = get_store()
    c = st.get("comments", comment_id)
    if not c:
        raise not_found("That comment")
    p = st.get("posts", c["postId"])
    if c["uid"] != user["id"] and not (p and p["uid"] == user["id"]):  # the author or the post's owner
        raise not_found("That comment")
    st.delete("comments", comment_id)
    st.update("posts", c["postId"], lambda x: {**x, "comments": max(0, x["comments"] - 1)} if x else x)
    return {"ok": True}


# ------------------------------------------------------------------ blocking and reporting
def toggle_block(user: dict, handle: str) -> dict:
    st = get_store()
    h = st.get("handles", handle.lower())
    if not h:
        raise not_found("That person")
    if h["uid"] == user["id"]:
        raise ApiError(400, "self_block", "You cannot block yourself.")
    bid = f"{user['id']}>{h['uid']}"
    made = st.insert("userblocks", bid, {"id": bid, "from": user["id"], "to": h["uid"], "created": _now()})
    if not made:
        st.delete("userblocks", bid)
    else:
        for fid in (f"{user['id']}>{h['uid']}", f"{h['uid']}>{user['id']}"):
            st.delete("follows", fid)
    return {"blocked": made}


REASONS = ("spam", "abuse", "harassment", "hate", "sexual", "self_harm", "misinformation", "other")


def report(user: dict, kind: str, target_id: str, reason: str, detail: str = "") -> dict:
    st = get_store()
    rate_limit(f"report:{user['id']}", 20, 3600)
    col = {"post": "posts", "comment": "comments", "message": "messages"}[kind]
    t = st.get(col, target_id)
    if not t:
        raise not_found("That")
    owner = t.get("uid") or t.get("from")
    if owner == user["id"]:
        raise ApiError(400, "self_report", "You cannot report your own content.")
    if kind == "message" and user["id"] not in (t["from"], t["to"]):
        raise not_found("That")
    rid = f"r_{kind}_{target_id}_{user['id']}"
    snapshot = t.get("text", "")[:1000]  # kept even if the author deletes it, so a report can still be reviewed
    made = st.insert("reports", rid, {"id": rid, "kind": kind, "targetId": target_id, "owner": owner, "reporter": user["id"], "reason": reason, "detail": detail[:500],
                                      "snapshot": snapshot, "status": "open", "created": _now()})
    if made and kind in ("post", "comment"):
        n = len({r["reporter"] for r in st.find("reports", where={"kind": kind, "targetId": target_id, "status": "open"}, limit=100)})
        if n >= AUTO_HIDE_REPORTS and t.get("status") == "visible":
            st.update(col, target_id, lambda c: {**c, "status": "hidden"} if c else c)
            abuse.audit("system", "auto_hide", target_id, {"kind": kind, "reports": n})
    return {"ok": True, "message": "Thank you. A person on our team will review this."}


def admin_reports(status: str = "open", limit: int = 100) -> list[dict]:
    st = get_store()
    cache: dict = {}
    rows = st.find("reports", where={"status": status}, order_by="created", desc=True, limit=limit)
    out = []
    for r in rows:
        u = st.get("users", r["owner"]) if r.get("owner") else None
        out.append({**r, "ownerName": u["name"] if u else None, "ownerEmail": u["email"] if u else None, "ownerHandle": _author(r["owner"], cache)["handle"] if r.get("owner") else None})
    return out


def admin_act(actor: dict, report_id: str, action: str) -> dict:
    st = get_store()
    r = st.get("reports", report_id)
    if not r:
        raise not_found("That report")
    col = {"post": "posts", "comment": "comments", "message": "messages"}[r["kind"]]
    new = "dismissed"
    if action == "dismiss":
        if r["kind"] in ("post", "comment"):
            st.update(col, r["targetId"], lambda c: {**c, "status": "visible"} if c and c.get("status") == "hidden" else c)
    elif action in ("hide", "remove"):
        if r["kind"] == "post" and action == "remove":
            _erase_post(r["targetId"])
        elif r["kind"] in ("post", "comment"):
            st.update(col, r["targetId"], lambda c: {**c, "status": "hidden" if action == "hide" else "removed"} if c else c)
        elif r["kind"] == "message":
            st.update(col, r["targetId"], lambda c: {**c, "text": "[removed by moderators]", "status": "removed"} if c else c)
        new = "actioned"
    elif action == "block_author":
        if r.get("owner"):
            abuse.block_user(r["owner"], "Community rules: content was reported and reviewed.", "admin", actor=actor["id"])
            from .auth import revoke_sessions
            revoke_sessions(r["owner"])
            if r["kind"] == "post":
                st.update("posts", r["targetId"], lambda c: {**c, "status": "removed"} if c else c)
        new = "actioned"
    else:
        raise ApiError(400, "bad_action", "Unknown action.")
    for x in st.find("reports", where={"kind": r["kind"], "targetId": r["targetId"], "status": "open"}, limit=200):
        st.update("reports", x["id"], lambda c: {**c, "status": new, "reviewedBy": actor["id"], "reviewedAt": _now(), "action": action} if c else c)
    abuse.audit(actor["id"], f"report_{action}", r["targetId"], {"kind": r["kind"], "report": report_id})
    return {"ok": True, "status": new}


# ------------------------------------------------------------------ direct messages
def _conv_id(a: str, b: str) -> str:
    return "|".join(sorted((a, b)))


def send_message(user: dict, handle: str, text: str) -> dict:
    _need_ready(user)
    st = get_store()
    h = st.get("handles", handle.lower())
    other = st.get("users", h["uid"]) if h else None
    if not other or not profile_of(other)["publicProfile"]:
        raise not_found("That person")
    if other["id"] == user["id"]:
        raise ApiError(400, "self_message", "You cannot message yourself.")
    if _blocked_pair(user["id"], other["id"]):
        raise ApiError(403, "blocked", "You cannot message this person.")
    rate_limit(f"dm:{user['id']}", 60, 3600)
    rate_limit(f"dm-new:{user['id']}", 15, 86_400) if not st.get("convs", _conv_id(user["id"], other["id"])) else None
    t = clean_text(text, DM_MAX, user)
    cid = _conv_id(user["id"], other["id"])
    follows_me = bool(st.get("follows", f"{other['id']}>{user['id']}"))
    state = {"first": False}

    def conv(c):
        if c is None:
            state["first"] = True
            return {"id": cid, "a": user["id"], "b": other["id"], "requestFrom": None if follows_me else user["id"], "requestSent": 1, "created": _now(), "last": _now()}
        if c.get("requestFrom") == user["id"]:
            if c.get("requestSent", 0) >= 1:
                raise ApiError(429, "request_pending", "Wait for a reply. You can send more once they answer your first message.")
            return {**c, "requestSent": c["requestSent"] + 1, "last": _now()}
        if c.get("requestFrom") and c["requestFrom"] != user["id"]:
            return {**c, "requestFrom": None, "last": _now()}  # replying accepts the request
        return {**c, "last": _now()}

    st.update("convs", cid, conv)
    m = {"id": f"m_{uuid()}", "conv": cid, "from": user["id"], "to": other["id"], "text": t, "created": _now(), "read": False, "status": "visible"}
    st.put("messages", m["id"], m)
    return {"id": m["id"], "text": t, "created": m["created"], "mine": True, "request": bool((st.get("convs", cid) or {}).get("requestFrom"))}


def inbox(user: dict) -> list[dict]:
    st = get_store()
    mine = st.find("convs", where={"a": user["id"]}, limit=300) + st.find("convs", where={"b": user["id"]}, limit=300)
    hide = _blocks_of(user["id"])
    cache: dict = {}
    out = []
    for c in sorted(mine, key=lambda c: -c["last"]):
        other = c["b"] if c["a"] == user["id"] else c["a"]
        if other in hide:
            continue
        last = (st.find("messages", where={"conv": c["id"]}, order_by="created", desc=True, limit=1) or [None])[0]
        unread = st.count("messages", where={"conv": c["id"], "to": user["id"], "read": False})
        out.append({"with": _author(other, cache), "last": last and {"text": last["text"], "created": last["created"], "mine": last["from"] == user["id"]}, "unread": unread,
                    "request": bool(c.get("requestFrom") and c["requestFrom"] != user["id"])})
    return out


def thread(user: dict, handle: str) -> dict:
    st = get_store()
    h = st.get("handles", handle.lower())
    other = h and st.get("users", h["uid"])
    if not other or _blocked_pair(user["id"], other["id"]):
        raise not_found("That person")
    cid = _conv_id(user["id"], other["id"])
    msgs = st.find("messages", where={"conv": cid}, order_by="created", limit=300)
    for m in msgs:
        if m["to"] == user["id"] and not m["read"]:
            st.update("messages", m["id"], lambda c: {**c, "read": True} if c else c)
    return {"with": _author(other["id"], {}), "messages": [{"id": m["id"], "text": m["text"], "created": m["created"], "mine": m["from"] == user["id"]} for m in msgs]}


def erase_user_content(uid: str) -> None:
    """Called when an account is deleted: their posts, comments, likes, messages and blocks go; reports about them stay (detached)."""
    st = get_store()
    for p in st.find("posts", where={"uid": uid}, limit=20000):
        _erase_post(p["id"])
    for col, key in (("comments", "uid"), ("likes", "uid"), ("messages", "from"), ("messages", "to"), ("convs", "a"), ("convs", "b"), ("userblocks", "from"), ("userblocks", "to")):
        for d in st.find(col, where={key: uid}, limit=20000):
            st.delete(col, d["id"])
