"""What the owner sees about the business and about each learner: hours, courses, generations, reuse, feedback. Admin only; nothing here is public.

Unlike the developer console (which hides everything a learner made or said), this is the owner's view: names, emails, courses, what was generated.
Password hashes, session tokens and payment secrets are never included."""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from . import activity
from .addons import entitlements_of
from .auth import plan_of as effective_plan
from .profile import profile_of
from .store import get_store

KINDS = ("gen", "jobtopics", "images", "jobs", "exam", "chat", "sessions", "answers")


def _ms() -> float:
    return time.time() * 1000


def _totals(uid_map: dict, uid: str) -> dict:
    return uid_map.get(uid) or {"all": {}, "months": {}}


def _text(t: dict) -> int:
    return int(t["all"].get("gen", 0)) + int(t["all"].get("jobtopics", 0))


def _minutes(days: list[dict]) -> dict:
    now = datetime.now(timezone.utc)
    today, month = now.strftime("%Y-%m-%d"), now.strftime("%Y-%m")
    return {"today": round(sum(d["minutes"] for d in days if d["day"] == today), 1),
            "month": round(sum(d["minutes"] for d in days if d["day"].startswith(month)), 1),
            "total": round(sum(d["minutes"] for d in days), 1), "activeDays": sum(1 for d in days if d["minutes"] or d["events"])}


def users_report(q: str = "", sort: str = "created", dir: str = "desc", page: int = 1, size: int = 25, category: str = "", plan: str = "") -> dict:
    st = get_store()
    users = st.find("users", limit=20000)
    totals = {t["uid"]: t for t in st.find("usage_totals", limit=20000)}
    courses: dict[str, list] = {}
    for c in st.find("courses", limit=20000):
        courses.setdefault(c["uid"], []).append(c)
    q = q.strip().lower()

    def keep(u):
        p = profile_of(u)
        if category and p["category"] != category:
            return False
        if plan and effective_plan(u) != plan:
            return False
        return not q or any(q in (x or "").lower() for x in (u["id"], u["email"], u["name"], p["handle"], p["institute"], p["label"]))

    rows = [u for u in users if keep(u)]
    keys = {"created": lambda u: u.get("created") or 0, "lastSeen": lambda u: u.get("lastSeen") or u.get("lastLogin") or 0, "name": lambda u: (u.get("name") or "").lower(),
            "textGens": lambda u: _text(_totals(totals, u["id"])), "imageGens": lambda u: int(_totals(totals, u["id"])["all"].get("images", 0)),
            "courses": lambda u: len(courses.get(u["id"], []))}
    rows.sort(key=keys.get(sort, keys["created"]), reverse=(dir != "asc"))
    size = min(max(size, 1), 100)
    page = max(page, 1)
    out = []
    for u in rows[(page - 1) * size: page * size]:
        p = profile_of(u)
        t = _totals(totals, u["id"])
        mins = _minutes(activity.days(u["id"], 400))
        out.append({"id": u["id"], "name": u["name"], "email": u["email"], "username": p["handle"], "plan": effective_plan(u), "category": p["category"], "education": p["education"],
                    "label": p["label"], "institute": p["institute"], "country": (u.get("geo") or {}).get("country", ""), "created": u.get("created"),
                    "lastSeen": u.get("lastSeen") or u.get("lastLogin"), "courses": len(courses.get(u["id"], [])), "textGens": _text(t), "imageGens": int(t["all"].get("images", 0)),
                    "minutes": mins})
    return {"rows": out, "total": len(rows), "page": page, "pageSize": size}


def user_detail(uid: str) -> dict | None:
    """Everything about one learner, in one answer, so the admin can click a name and see the whole picture."""
    st = get_store()
    u = st.get("users", uid)
    if not u:
        return None
    from . import abuse, referral
    p = profile_of(u)
    t = st.get("usage_totals", uid) or {"all": {}, "months": {}}
    ym = datetime.now(timezone.utc).strftime("%Y-%m")
    days = activity.days(uid, 400)
    by_month: dict[str, float] = {}
    for d in days:
        by_month[d["day"][:7]] = round(by_month.get(d["day"][:7], 0) + d["minutes"], 1)
    mycourses = st.find("courses", where={"uid": uid}, order_by="updated", desc=True, limit=100)
    jobs = st.find("jobs", where={"uid": uid}, order_by="created", desc=True, limit=20)
    lib = st.find("library", where={"uid": uid}, order_by="updated", desc=True, limit=500)
    assets = st.find("assets", where={"uid": uid}, order_by="updated", desc=True, limit=500)
    orders = st.find("orders", where={"uid": uid}, order_by="created", desc=True, limit=50)
    fb = [f for f in st.find("feedback", where={"uid": uid}, order_by="created", desc=True, limit=50)]
    tickets = st.find("tickets", where={"uid": uid}, order_by="created", desc=True, limit=50)
    rew = st.get("rewards", uid) or {}
    blk = abuse.active_block(uid)
    audit = st.find("audit", where={"target": uid}, order_by="created", desc=True, limit=50)
    mine_count = lambda col: st.count(col, where={"uid": uid})  # noqa: E731
    friends = st.count("users", where={"referredBy": uid})
    by_kind: dict[str, int] = {}
    for i in lib:
        by_kind[i.get("kind", "?")] = by_kind.get(i.get("kind", "?"), 0) + 1
    asset_kind: dict[str, int] = {}
    for a in assets:
        asset_kind[a.get("kind", "?")] = asset_kind.get(a.get("kind", "?"), 0) + 1
    return {
        "account": {"id": uid, "name": u["name"], "email": u["email"], "emailVerified": bool(u.get("emailVerified")), "created": u.get("created"), "lastLogin": u.get("lastLogin"),
                    "lastSeen": u.get("lastSeen"), "sessions": u.get("sessions", 0), "plan": effective_plan(u), "planUntil": u.get("planUntil"), "role": u.get("role", "user"),
                    "consentAt": (u.get("consent") or {}).get("at"), "country": (u.get("geo") or {}).get("country", ""), "region": (u.get("geo") or {}).get("region", ""),
                    "referredBy": u.get("referredBy", ""), "friendsJoined": friends, "referralCode": referral.code_of(uid),
                    "blocked": {"reason": blk["reason"], "until": blk["until"]} if blk else None, "subscription": u.get("subscription")},
        "profile": {k: p[k] for k in ("handle", "education", "category", "label", "institute", "city", "state", "rank", "age", "ageBand", "goal", "dailyGoal", "language", "bio", "publicProfile", "leaderboard")},
        "rewards": {"xp": rew.get("xp", 0), "weekXp": rew.get("weekXp", 0), "streak": rew.get("streak", 0), "best": rew.get("best", 0), "gems": rew.get("gems", 0), "alias": rew.get("alias", ""),
                    "board": rew.get("board", True)},
        "usage": {"all": {k: int(t["all"].get(k, 0)) for k in KINDS}, "month": {k: int(t["months"].get(ym, {}).get(k, 0)) for k in KINDS},
                  "textGens": _text(t), "imageGens": int(t["all"].get("images", 0))},
        "time": {**_minutes(days), "byMonth": [{"month": m, "minutes": v} for m, v in sorted(by_month.items(), reverse=True)[:12]], "days": days[:60]},
        "courses": [{"id": c["id"], "title": c["course"]["title"], "topics": len(c["course"]["order"]), "created": c.get("created"), "source": (c.get("source") or {}).get("name", ""),
                     "public": bool(c.get("public")), "copiedFrom": c.get("copiedFrom", "")} for c in mycourses],
        "jobs": [{"id": j["id"], "status": j.get("status"), "courseId": j.get("courseId"), "topics": len(j.get("topics") or {}), "created": j.get("created"), "error": (j.get("error") or "")[:140]} for j in jobs],
        "library": {"total": len(lib), "byKind": by_kind, "recent": [{"title": i.get("title"), "kind": i.get("kind"), "uses": i.get("uses", 0), "updated": i.get("updated")} for i in lib[:25]]},
        "assets": {"total": len(assets), "byKind": asset_kind, "recent": [{"key": a.get("key"), "kind": a.get("kind"), "version": a.get("version"), "updated": a.get("updated")} for a in assets[:25]]},
        "counts": {"canvases": mine_count("canvases"), "exams": mine_count("exams"), "libraryItems": len(lib)},
        "orders": [{"id": o["id"], "status": o["status"], "item": o.get("sku") or o.get("plan"), "billing": o.get("billing"), "amountMinor": o["amountPaise"], "currency": o["currency"],
                    "gateway": o.get("gateway", "razorpay"), "country": o.get("country", ""), "created": o["created"], "paidAt": o.get("paidAt")} for o in orders],
        "entitlements": [{"sku": e["sku"], "quantity": e.get("quantity"), "validUntil": e.get("validUntil")} for e in entitlements_of(uid)],
        "feedback": [{"rating": f.get("rating"), "comment": f.get("comment", ""), "tags": f.get("tags", []), "created": f.get("created")} for f in fb],
        "tickets": [{"id": k["id"], "status": k.get("status"), "message": (k.get("message") or "")[:300], "created": k.get("created")} for k in tickets],
        "audit": [{"at": a["created"], "actor": a["actor"], "action": a["action"], "detail": a.get("detail", {})} for a in audit],
    }


def content_report(days: int = 30) -> dict:
    """How much was written and how much was reused instead, from the daily counters, plus what is stored in the shared pool."""
    st = get_store()
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    rows = [r for r in st.find("content_stats", limit=800) if r["day"] >= since]
    kinds: dict[str, dict[str, int]] = {}
    series = []
    for r in sorted(rows, key=lambda r: r["day"]):
        g = s_ = v = 0
        for key, n in r["counts"].items():
            kind, how = key.split(":", 1)
            k = kinds.setdefault(kind, {"generated": 0, "shared": 0, "saved": 0})
            k[how] = k.get(how, 0) + n
            if how == "generated":
                g += n
            else:
                v += n
        series.append({"day": r["day"], "generated": g, "reused": v})
    gen = sum(k["generated"] for k in kinds.values())
    reused = sum(k["shared"] + k["saved"] for k in kinds.values())
    topics = st.find("shared_topics", order_by="uses", desc=True, limit=1000)
    assets = st.find("shared_assets", limit=5000)
    ak: dict[str, int] = {}
    for a in assets:
        k = a.get("kind") or str(a.get("id", "asset")).rsplit(":", 1)[-1]
        ak[k] = ak.get(k, 0) + 1
    blob_n, blob_bytes = st.blob_stats()
    return {
        "days": days, "generated": gen, "reused": reused, "reusePercent": round(100 * reused / (gen + reused), 1) if gen + reused else 0,
        "byKind": [{"kind": k, "generated": v["generated"], "shared": v["shared"], "saved": v["saved"]} for k, v in sorted(kinds.items())], "series": series,
        "pool": {"topics": len(topics), "withPicture": sum(1 for t in topics if t.get("imageBlob")), "assets": len(assets), "assetsByKind": [{"kind": k, "n": n} for k, n in sorted(ak.items())],
                 "picturesStored": blob_n, "storageMB": round(blob_bytes / 1_048_576, 2), "totalUses": sum(t.get("uses", 0) for t in topics)},
        "topReused": [{"title": t["title"], "depth": t.get("depth"), "uses": t.get("uses", 0), "hasPicture": bool(t.get("imageBlob")), "updated": t.get("updated")} for t in topics[:15]],
    }


def syllabus_report() -> dict:
    """What people study: syllabus types, levels, institutes and the most common courses."""
    st = get_store()
    users = st.find("users", limit=20000)
    cat: dict[str, int] = {}
    edu: dict[str, int] = {}
    for u in users:
        p = profile_of(u)
        cat[p["category"] or "not set"] = cat.get(p["category"] or "not set", 0) + 1
        edu[p["education"] or "not set"] = edu.get(p["education"] or "not set", 0) + 1
    titles: dict[str, int] = {}
    n_courses = 0
    for c in st.find("courses", limit=20000):
        n_courses += 1
        t = (c["course"]["title"] or "").strip().lower()[:80]
        titles[t] = titles.get(t, 0) + 1
    inst = sorted(st.find("institutes", limit=2000), key=lambda r: -r.get("n", 0))[:15]
    top = lambda d, n=15: [{"name": k, "n": v} for k, v in sorted(d.items(), key=lambda kv: -kv[1])[:n]]  # noqa: E731
    return {"users": len(users), "courses": n_courses, "bySyllabus": top(cat), "byLevel": top(edu), "topCourses": top(titles), "institutes": [{"name": i["name"], "n": i.get("n", 0)} for i in inst]}


def audit_list(limit: int = 200, action: str = "") -> list[dict]:
    st = get_store()
    rows = st.find("audit", order_by="created", desc=True, limit=min(limit, 500))
    if action:
        rows = [r for r in rows if r["action"].startswith(action)]
    cache: dict[str, str] = {}

    def who(uid: str) -> str:
        if uid not in cache:
            u = st.get("users", uid)
            cache[uid] = u["email"] if u else uid
        return cache[uid]

    return [{"id": r["id"], "at": r["created"], "actor": who(r["actor"]) if str(r["actor"]).startswith("u_") else r["actor"], "action": r["action"], "target": r["target"], "detail": r.get("detail", {})} for r in rows]
