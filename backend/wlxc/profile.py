"""What a person tells us about their studies, and the public bits they choose to share."""
from __future__ import annotations

import re
import time

from .errors import ApiError
from .store import get_store

CONSENT_VERSION = "2026-10"
# The list of curricula lives in the front end (src/lib/curricula.ts), covering every country; the server only checks the shape of the code.
_CURRICULUM = re.compile(r"^[a-z0-9_]{2,40}$")
_COUNTRY = re.compile(r"^[A-Z]{2}$")
EDUCATION = ["school", "college", "competitive", "professional", "self"]
AGE_BANDS = ["under_13", "13_17", "18_24", "25_34", "35_plus"]
GOALS = ["exam", "school", "career", "curiosity", "teach"]
DAILY_GOALS = [20, 30, 50, 80]  # points a day: casual, regular, serious, intense
RESERVED = {"admin", "administrator", "support", "worklab", "worklabxc", "staff", "help", "root", "api", "system", "moderator", "mod", "team", "official", "null", "undefined", "me", "you", "app", "www"}
_HANDLE = re.compile(r"^[a-z0-9_]{3,24}$")


def empty_profile() -> dict:
    return {"education": "", "category": "", "country": "", "label": "", "institute": "", "city": "", "state": "", "rank": "", "ageBand": "",
            "language": "en", "handle": "", "goal": "", "dailyGoal": 30, "bio": "", "publicProfile": False, "leaderboard": False, "age": 0, "photo": "", "updated": 0}


def _clip(v, n: int) -> str:
    if not isinstance(v, str):
        return ""
    return re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f<>]", " ", v)).strip()[:n]


def _curriculum(v) -> str:
    return v if isinstance(v, str) and _CURRICULUM.match(v) else ""


def _country(v) -> str:
    v = v.strip().upper() if isinstance(v, str) else ""
    return v if _COUNTRY.match(v) else ""


def _pick(v, lst: list[str]) -> str:
    return v if isinstance(v, str) and v in lst else ""


def institute_key(n: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", n.lower()).strip()


def username_problem(name: str) -> str:
    """Why a username cannot be used, or an empty string when it can."""
    n = (name or "").strip().lower()
    if not _HANDLE.match(n):
        return "Use 3 to 24 letters, numbers or underscores."
    if n in RESERVED or n.startswith("wlx"):
        return "That name is reserved. Try another."
    return ""


def username_free(name: str) -> bool:
    return get_store().get("handles", (name or "").strip().lower()) is None


def profile_of(u: dict) -> dict:
    return {**empty_profile(), **(u.get("profile") or {})}


def update_profile(user: dict, patch: dict) -> dict:
    """Merge a partial update into the stored profile. Unknown fields are ignored; every value is cleaned."""
    st = get_store()
    cur = profile_of(user)
    nxt = dict(cur)
    if "education" in patch: nxt["education"] = _pick(patch["education"], EDUCATION)
    if "category" in patch: nxt["category"] = _curriculum(patch["category"])
    if "country" in patch: nxt["country"] = _country(patch["country"])
    if "label" in patch: nxt["label"] = _clip(patch["label"], 60)
    if "institute" in patch: nxt["institute"] = _clip(patch["institute"], 120)
    if "city" in patch: nxt["city"] = _clip(patch["city"], 60)
    if "state" in patch: nxt["state"] = _clip(patch["state"], 60)
    if "rank" in patch: nxt["rank"] = _clip(patch["rank"], 40)
    if "ageBand" in patch: nxt["ageBand"] = _pick(patch["ageBand"], AGE_BANDS)
    if "age" in patch:
        a = patch["age"]
        nxt["age"] = int(a) if isinstance(a, (int, float)) and not isinstance(a, bool) and 5 <= a <= 100 else 0
        if nxt["age"]:
            nxt["ageBand"] = "under_13" if nxt["age"] < 13 else "13_17" if nxt["age"] < 18 else "18_24" if nxt["age"] < 25 else "25_34" if nxt["age"] < 35 else "35_plus"
    if "photo" in patch:
        ph = patch["photo"]
        nxt["photo"] = ph if isinstance(ph, str) and len(ph) <= 100_000 and re.match(r"^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$", ph) else ""
    if "language" in patch: nxt["language"] = _clip(patch["language"], 12) or "en"
    if "bio" in patch: nxt["bio"] = _clip(patch["bio"], 240)
    if "goal" in patch: nxt["goal"] = _pick(patch["goal"], GOALS)
    if "dailyGoal" in patch: nxt["dailyGoal"] = patch["dailyGoal"] if patch["dailyGoal"] in DAILY_GOALS else 30
    if "publicProfile" in patch: nxt["publicProfile"] = patch["publicProfile"] is True
    if "leaderboard" in patch: nxt["leaderboard"] = patch["leaderboard"] is True
    if "handle" in patch:
        h = _clip(patch["handle"], 24).lower()
        if h and not _HANDLE.match(h):
            raise ApiError(400, "bad_handle", "Handles use 3 to 24 letters, numbers or underscores.")
        if h and h != cur["handle"] and (h in RESERVED or h.startswith("wlx")):
            raise ApiError(400, "bad_handle", "That name is reserved. Try another.")
        if h != cur["handle"]:
            if h and not st.insert("handles", h, {"uid": user["id"]}):
                raise ApiError(409, "handle_taken", "That handle is taken. Try another.")
            if cur["handle"]:
                st.delete("handles", cur["handle"])
        nxt["handle"] = h
    if nxt["publicProfile"] and not nxt["handle"]:
        raise ApiError(400, "handle_required", "Choose a handle before making your profile public.")
    nxt["updated"] = time.time() * 1000
    name = _clip(patch.get("name"), 80) if "name" in patch else ""
    st.update("users", user["id"], lambda c: {**c, "profile": nxt, **({"name": name} if len(name) >= 2 else {})} if c else c)
    if nxt["institute"]:
        key = institute_key(nxt["institute"])
        if len(key) >= 3:
            bump = 0 if cur["institute"] == nxt["institute"] else 1
            st.update("institutes", key, lambda c: {"name": (c or {}).get("name") or nxt["institute"], "n": (c or {}).get("n", 0) + bump})
    return nxt


def suggest_institutes(q: str) -> list[str]:
    needle = institute_key(q)
    if len(needle) < 2:
        return []
    rows = get_store().find("institutes", limit=2000)
    rows = [r for r in rows if needle in institute_key(r["name"])]
    rows.sort(key=lambda r: -r["n"])
    return [r["name"] for r in rows[:8]]
