"""Syllabus -> course: extract text, parse headings into units and topics, then ask the model for prerequisites.
The result is stored as a resource owned by the user and returned in the shape the front end already uses."""
from __future__ import annotations

import time

from .auth import effective_plan
from .crypto import uuid
from .errors import ApiError, forbidden, not_found
from .extract import extract_text, kind_of, tidy
from .knowledge import infer_prerequisites
from .plans import LIMITS
from .store import get_store
from .syllabus import build_course_from_outline, parse_syllabus, slugify

MAX_COURSES = 50
MAX_TOPICS = 120


def ingest_syllabus(user: dict, text: str = "", file: tuple[str, bytes] | None = None, title: str = "") -> dict:
    limits = LIMITS[effective_plan(user)]
    st = get_store()
    cap = min(limits["maxCourses"], MAX_COURSES)
    if len(st.find("courses", where={"uid": user["id"]}, limit=cap + 1)) >= cap and cap < MAX_COURSES:
        raise ApiError(402, "plan_required", "Free includes one subject at a time. Delete your course to start another, or get Beta for unlimited subjects.")
    if len(st.find("courses", where={"uid": user["id"]}, limit=MAX_COURSES + 1)) >= MAX_COURSES:
        raise ApiError(409, "course_limit", f"You can keep up to {MAX_COURSES} courses. Delete one to add another.")
    name = title or ""
    if file:
        if kind_of(*file) != "text" and not limits["pdfDocx"]:
            raise ApiError(402, "plan_required", "PDF and DOCX parsing is part of the Learner plan. Paste the text or upload a .txt or .md file.")
        text = extract_text(*file)
        name = name or file[0]
    text = tidy(text or "")
    if len(text) < 20:
        raise ApiError(422, "empty_syllabus", "We could not find any text in that syllabus.")
    if len(text) > limits["maxSyllabusChars"]:
        raise ApiError(413, "syllabus_too_long", f"That syllabus is longer than your plan allows ({limits['maxSyllabusChars']:,} characters). Trim it or upgrade.")
    outline = parse_syllabus(text, name)
    if title:
        outline["title"] = title[:120]
    total = sum(len(u["topics"]) for u in outline["units"])
    if not total:
        raise ApiError(422, "no_topics", "No topics were found. Put each topic on its own line, under unit or week headings.")
    if total > MAX_TOPICS:
        raise ApiError(413, "too_many_topics", f"That syllabus has {total} topics. The limit is {MAX_TOPICS}. Split it into two courses.")
    base = build_course_from_outline(outline, name)
    base["id"] = f"c-{slugify(outline['title'])}-{uuid()[:6]}"
    base["sourceName"] = name or base["sourceName"]
    course, used = infer_prerequisites(base)
    now = time.time() * 1000
    doc = {"id": course["id"], "uid": user["id"], "course": course, "source": {"name": name or "pasted text", "chars": len(text)},
           "notes": outline["notes"], "aiPrerequisites": used, "created": now, "updated": now}
    st.put("courses", doc["id"], doc)
    return doc


def get_course_doc(user: dict, id: str) -> dict:
    d = get_store().get("courses", id)
    if not d:
        raise not_found("That course")
    if d["uid"] != user["id"]:
        raise forbidden()
    return d


def list_course_docs(user: dict) -> list[dict]:
    docs = get_store().find("courses", where={"uid": user["id"]}, order_by="updated", desc=True, limit=MAX_COURSES)
    return [{"id": d["id"], "title": d["course"]["title"], "topics": len(d["course"]["order"]), "source": d["source"],
             "ai": bool(d["course"].get("ai")), "public": bool(d.get("public")), "created": d["created"], "updated": d["updated"]} for d in docs]


def delete_course_doc(user: dict, id: str) -> None:
    get_course_doc(user, id)
    get_store().delete("courses", id)


# ---------------------------------------------------------------- public syllabi
# A learner can publish the outline of a course (title, units, topic names) for others to browse and copy. Lessons, notes and the original
# upload are never shared. The publisher shows under their league name, not their real one, and enough reports take a syllabus down.
HIDE_AFTER_REPORTS = 3


def outline_of(d: dict) -> dict:
    c = d["course"]
    return {"id": d["id"], "title": c["title"], "topics": len(c["order"]), "units": len(c.get("units") or []), "adds": d.get("adds", 0),
            "publisher": d.get("publisher", ""), "category": d.get("category", ""), "education": d.get("education", ""), "publishedAt": d.get("publishedAt", 0)}


def set_public(user: dict, id: str, public: bool) -> dict:
    from . import rewards
    from .profile import profile_of
    d = get_course_doc(user, id)
    p = profile_of(user)
    alias = rewards.get(user)["alias"] if public else d.get("publisher", "")
    out = get_store().update("courses", id, lambda c: {**c, "public": public, "publisher": alias, "category": p["category"], "education": p["education"],
                                                        "adds": c.get("adds", 0), "publishedAt": time.time() * 1000 if public and not c.get("public") else c.get("publishedAt", 0)} if c else c)
    return {"id": id, "public": bool(out["public"])}


def list_public(q: str = "", category: str = "", education: str = "", limit: int = 40) -> list[dict]:
    rows = get_store().find("courses", where={"public": True}, order_by="adds", desc=True, limit=300)
    q = q.strip().lower()
    out = [outline_of(d) for d in rows if (not category or d.get("category") == category) and (not education or d.get("education") == education)
           and (not q or q in d["course"]["title"].lower())]
    return out[:limit]


def get_public(id: str) -> dict:
    d = get_store().get("courses", id)
    if not d or not d.get("public"):
        raise not_found("That syllabus")
    return d


def public_units(id: str) -> list[dict]:
    c = get_public(id)["course"]
    return [{"title": u["title"], "topics": [c["topics"][t]["title"] for t in u["topics"] if t in c["topics"]]} for u in c.get("units") or []]


def add_public(user: dict, id: str) -> dict:
    """Copies a public syllabus into the learner's own courses. No model call is made, so it costs nothing."""
    src = get_public(id)
    st = get_store()
    limits = LIMITS[effective_plan(user)]
    cap = min(limits["maxCourses"], MAX_COURSES)
    if len(st.find("courses", where={"uid": user["id"]}, limit=cap + 1)) >= cap:
        raise ApiError(402, "plan_required", "Free includes one subject at a time. Delete your course to start another, or get Beta for unlimited subjects.")
    now = time.time() * 1000
    new_id = f"c-{slugify(src['course']['title'])}-{uuid()[:6]}"
    doc = {"id": new_id, "uid": user["id"], "course": {**src["course"], "id": new_id}, "source": {"name": f"public: {src['course']['title']}"[:80], "chars": 0},
           "notes": [], "aiPrerequisites": src.get("aiPrerequisites", False), "copiedFrom": id, "created": now, "updated": now}
    st.put("courses", new_id, doc)
    st.update("courses", id, lambda c: {**c, "adds": c.get("adds", 0) + 1} if c else c)
    return {"id": new_id}


def report_public(user: dict, id: str, reason: str) -> dict:
    d = get_public(id)
    if d["uid"] == user["id"]:
        raise ApiError(400, "self_report", "You cannot report your own syllabus.")
    st = get_store()
    made = st.insert("syllabus_reports", f"{id}:{user['id']}", {"id": f"{id}:{user['id']}", "courseId": id, "reporter": user["id"], "reason": reason[:300], "created": time.time() * 1000})
    if made and len(st.find("syllabus_reports", where={"courseId": id}, limit=50)) >= HIDE_AFTER_REPORTS:
        st.update("courses", id, lambda c: {**c, "public": False, "hiddenForReports": True} if c else c)
    return {"ok": True, "message": "Thank you. We will look at it."}
