"""The private user table for administrators, and the actions they can take on an account."""
from __future__ import annotations

import re
import time
from datetime import datetime, timezone

from .abuse import active_block, audit, block_user, unblock_user
from .addons import entitlements_of, grant
from .auth import plan_of as effective_plan, revoke_sessions
from .errors import ApiError, not_found
from .profile import profile_of
from .store import get_store
from .usage import day_key


def csv_cell(v) -> str:
    t = "" if v is None else str(v)
    if isinstance(v, bool):
        t = "true" if v else "false"
    if re.match(r"^[=+\-@\t\r]", t):
        t = "'" + t  # stop spreadsheet formula injection
    return '"' + t.replace('"', '""') + '"' if re.search(r'[",\n]', t) else t


def list_users(q: str = "", sort: str = "created", dir: str = "desc", page: int = 1, page_size: int = 25, category: str = "") -> dict:
    st = get_store()
    allu = st.find("users", limit=20000)
    q = q.lower().strip()
    day = day_key()

    def keep(u):
        p = profile_of(u)
        if category and p["category"] != category:
            return False
        return not q or any(q in (x or "").lower() for x in (u["id"], u["email"], u["name"], p["institute"], p["label"]))

    filtered = [u for u in allu if keep(u)]
    key = sort if sort in ("created", "lastLogin", "name", "email", "totalSessions") else "created"

    def val(u):
        if key == "totalSessions":
            return u.get("sessions", 0)
        if key in ("name", "email"):
            return (u.get(key) or "").lower()
        return u.get(key) or 0

    filtered.sort(key=val, reverse=(dir != "asc"))
    page_size = min(max(page_size, 1), 200)
    page = max(page, 1)
    rows = []
    for u in filtered[(page - 1) * page_size: page * page_size]:
        p = profile_of(u)
        n = lambda k: (st.get("usage", f"{u['id']}:{k}:{day}") or {}).get("n", 0)  # noqa: E731
        blk = active_block(u["id"])
        rows.append({
            "id": u["id"], "name": u["name"], "email": u["email"], "created": u["created"], "lastLogin": u.get("lastLogin"),
            "verified": bool(u.get("emailVerified")), "plan": effective_plan(u), "planUntil": u.get("planUntil"),
            "addons": [e["sku"] for e in entitlements_of(u["id"])],
            "today": {"sessions": n("sessions"), "jobs": n("jobs"), "images": n("images"), "chat": n("chat")},
            "totalSessions": u.get("sessions", 0), "category": p["category"], "label": p["label"], "institute": p["institute"],
            "rank": p["rank"], "city": p["city"], "state": p["state"],
            "blocked": {"until": blk["until"], "reason": blk["reason"]} if blk else None,
            "consentAt": (u.get("consent") or {}).get("at"),
        })
    return {"rows": rows, "total": len(filtered), "page": page, "pageSize": page_size}


def users_csv(rows: list[dict]) -> str:
    head = ["id", "name", "email", "created", "last_login", "verified", "plan", "addons", "sessions_today", "jobs_today", "images_today",
            "chat_today", "total_sessions", "category", "label", "institute", "rank", "city", "state", "blocked"]
    iso = lambda t: datetime.fromtimestamp(t / 1000, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z") if t else ""  # noqa: E731
    lines = []
    for r in rows:
        cells = [r["id"], r["name"], r["email"], iso(r["created"]), iso(r["lastLogin"]), r["verified"], r["plan"], "|".join(r["addons"]),
                 r["today"]["sessions"], r["today"]["jobs"], r["today"]["images"], r["today"]["chat"], r["totalSessions"], r["category"],
                 r["label"], r["institute"], r["rank"], r["city"], r["state"], r["blocked"]["reason"] if r["blocked"] else ""]
        lines.append(",".join(csv_cell(c) for c in cells))
    return "\n".join([",".join(head), *lines])


def admin_act(actor: dict, uid: str, a: dict) -> dict:
    st = get_store()
    target = st.get("users", uid)
    if not target:
        raise not_found("That user")
    act = a["action"]
    if target["id"] == actor["id"] and act in ("block", "force_logout"):
        raise ApiError(400, "self_action", "Pick another account for that.")
    now = time.time() * 1000
    if act == "block":
        block_user(uid, a.get("reason") or "Blocked by an administrator.", "admin", a.get("minutes"), actor["id"])
        revoke_sessions(uid)
    elif act == "unblock":
        unblock_user(uid, actor["id"])
    elif act == "grant_plan":
        until = max(target.get("planUntil") or 0, now) + min(max(a["days"], 1), 400) * 86_400_000
        st.update("users", uid, lambda c: {**c, "plan": a["plan"], "planUntil": until} if c else c)
        audit(actor["id"], "grant_plan", uid, {"plan": a["plan"], "days": a["days"]})
    elif act == "grant_addon":
        grant(uid, a["sku"], a.get("quantity"), a.get("days"))
        audit(actor["id"], "grant_addon", uid, {"sku": a["sku"], "days": a.get("days"), "quantity": a.get("quantity")})
    elif act == "reset_quota":
        day = day_key()
        for k in ("sessions", "jobs", "images", "chat", "answers", "gen"):
            st.delete("usage", f"{uid}:{k}:{day}")
        st.update("users", uid, lambda c: {**c, "lastSessionAt": 0} if c else c)
        audit(actor["id"], "reset_quota", uid)
    elif act == "force_logout":
        revoke_sessions(uid)
        audit(actor["id"], "force_logout", uid)
    return {"ok": True}
