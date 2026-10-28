"""Opt-in social layer: public profile, follow, and a leaderboard. Nothing is visible until the person turns it on."""
from __future__ import annotations

import time

from .errors import ApiError, not_found
from .profile import profile_of
from .store import get_store


def _by_handle(handle: str) -> dict:
    st = get_store()
    h = st.get("handles", handle.lower())
    u = st.get("users", h["uid"]) if h else None
    if not u or not profile_of(u)["publicProfile"]:
        raise not_found("That profile")
    return u


def _points(uid: str) -> dict:
    rows = get_store().find("progress", where={"uid": uid}, limit=5000)
    return {"topics": sum(1 for r in rows if r["a"] / (r["a"] + r["b"]) >= 0.6), "points": round(sum(r["a"] - 1 for r in rows) * 10)}


def public_profile(viewer: dict, handle: str) -> dict:
    u = _by_handle(handle)
    p = profile_of(u)
    st = get_store()
    return {"handle": p["handle"], "name": u["name"], "bio": p["bio"], "institute": p["institute"], "category": p["category"], "label": p["label"],
            "joined": u["created"], "followers": st.count("follows", where={"to": u["id"]}), "following": st.count("follows", where={"from": u["id"]}),
            "youFollow": bool(st.get("follows", f"{viewer['id']}>{u['id']}")), **_points(u["id"])}


def toggle_follow(viewer: dict, handle: str) -> dict:
    u = _by_handle(handle)
    if u["id"] == viewer["id"]:
        raise ApiError(400, "self_follow", "You cannot follow yourself.")
    st = get_store()
    id = f"{viewer['id']}>{u['id']}"
    made = st.insert("follows", id, {"id": id, "from": viewer["id"], "to": u["id"], "created": time.time() * 1000})
    if not made:
        st.delete("follows", id)
    return {"following": made}


def leaderboard(category: str | None = None) -> list[dict]:
    users = [u for u in get_store().find("users", limit=20000)
             if profile_of(u)["leaderboard"] and profile_of(u)["handle"] and (not category or profile_of(u)["category"] == category)]
    rows = [{"handle": profile_of(u)["handle"], "name": u["name"], "institute": profile_of(u)["institute"], **_points(u["id"])} for u in users]
    rows.sort(key=lambda r: -r["points"])
    return [{"rank": i + 1, **r} for i, r in enumerate(rows[:50])]
