"""Generation runs: queued, leased, advanced topic by topic, and finalised into a deck, notes and a course file."""
from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor

from .auth import effective_plan
from .config import env
from .crypto import uuid
from .deck import build_pptx
from .errors import ApiError, forbidden, not_found
from .image import generate_image, slide_prompt
from .integrations import emit
from .lesson import clean_instructions, generate_best, score_draft, depth_of
from . import pool, stats
from .usage import tally
from .library import find_reusable, mark_used, save_deck, save_topic
from .mail import send_mail
from .mailtpl import T
from .plans import LIMITS
from .render import enrich_course, render_notes, safe_name
from .store import get_store
from .styles import STYLE_IDS, parse_hex, resolve_style
from .usage import consume, refund
from .web import log

MAX_ATTEMPTS = 3
MAX_ACTIVE_JOBS = 3
FORMATS = {
    "pptx": {"mime": "application/vnd.openxmlformats-officedocument.presentationml.presentation", "ext": "pptx"},
    "md": {"mime": "text/markdown; charset=utf-8", "ext": "md"},
    "json": {"mime": "application/json; charset=utf-8", "ext": "course.json"},
}


def _now() -> float:
    return time.time() * 1000


def create_job(user: dict, course_id: str, topic_ids: list | None = None, images: bool = False, instructions: str | None = None,
               style: str | None = None, accent: str | None = None, reuse: bool | None = None, depth: str | None = None) -> dict:
    st = get_store()
    cd = st.get("courses", course_id)
    if not cd:
        raise not_found("That course")
    if cd["uid"] != user["id"]:
        raise forbidden()
    plan = effective_plan(user)
    limits = LIMITS[plan]
    course = cd["course"]
    ids = topic_ids if topic_ids else course["order"][: limits["topicsPerJob"]]
    unique = list(dict.fromkeys(ids))
    if any(t not in course["topics"] for t in unique):
        raise ApiError(422, "unknown_topic", "One of the chosen topics is not in this course.")
    if len(unique) > limits["topicsPerJob"]:
        raise ApiError(402, "plan_limit", f"Your plan covers up to {limits['topicsPerJob']} topics per run. Pick fewer topics{' or upgrade' if plan == 'prototype' else ''}.",
                       {"limit": limits["topicsPerJob"]})
    if instructions and not limits["customInstructions"] and clean_instructions(instructions):
        raise ApiError(402, "plan_required", "Custom instructions are part of the Learner plan.")
    if style and style != "auto" and style not in STYLE_IDS:
        raise ApiError(422, "unknown_style", "That deck style does not exist.")
    if accent and not parse_hex(accent):
        raise ApiError(422, "bad_colour", "The accent colour must look like #2F7BFF.")
    if accent and not limits["customInstructions"]:
        raise ApiError(402, "plan_required", "A custom accent colour is part of the Learner plan.")
    if images and limits["imagesPerDay"] == 0:
        raise ApiError(402, "plan_required", "AI illustrations are part of the Learner plan.")
    n_active = len(st.find("jobs", where={"uid": user["id"], "status": "running"}, limit=MAX_ACTIVE_JOBS + 1)) + \
        len(st.find("jobs", where={"uid": user["id"], "status": "queued"}, limit=MAX_ACTIVE_JOBS + 1))
    if n_active >= MAX_ACTIVE_JOBS:
        raise ApiError(429, "too_many_jobs", "You already have several runs in progress. Wait for one to finish.")
    consume(user["id"], "jobs", 1, limits["jobsPerDay"])
    job = {"id": f"j_{uuid()}", "uid": user["id"], "courseId": cd["id"], "status": "queued",
           "opts": {"topicIds": unique, "images": bool(images), "instructions": clean_instructions(instructions), "style": style or "auto",
                    "accent": parse_hex(accent), "reuse": reuse is not False, "depth": depth_of(depth), "candidates": limits["candidates"], "watermark": limits["watermark"], "plan": plan},
           "topics": {t: {"state": "pending", "attempts": 0} for t in unique}, "leaseUntil": 0, "created": _now(), "started": None, "finished": None,
           "artifacts": {}, "usage": {"calls": 0, "tokensIn": 0, "tokensOut": 0, "images": 0}}
    st.put("jobs", job["id"], job)
    return job


def get_job(user: dict, id: str) -> dict:
    j = get_store().get("jobs", id)
    if not j:
        raise not_found("That run")
    if j["uid"] != user["id"]:
        raise forbidden()
    return j


def public_job(j: dict, titles: dict | None = None) -> dict:
    titles = titles or {}
    rows = list(j["topics"].items())
    return {"id": j["id"], "courseId": j["courseId"], "status": j["status"], "created": j["created"], "finished": j["finished"], "error": j.get("error"),
            "progress": {"total": len(rows), "done": sum(1 for _, t in rows if t["state"] == "done"), "failed": sum(1 for _, t in rows if t["state"] == "failed")},
            "topics": [{"id": i, "title": titles.get(i, i), "state": t["state"], "score": t.get("score"), "image": bool(t.get("imageBlob")),
                        "error": t.get("error"), "warning": t.get("warn"), "reused": bool(t.get("reused"))} for i, t in rows],
            "downloads": list(j["artifacts"].keys()), "watermark": j["opts"]["watermark"], "images": j["opts"]["images"], "style": j["opts"].get("style")}


def cancel_job(user: dict, id: str) -> dict:
    get_job(user, id)
    return get_store().update("jobs", id, lambda c: {**c, "status": "canceled", "finished": _now(), "leaseUntil": 0}
                              if c and c["status"] in ("queued", "running") else c)


def retry_job(user: dict, id: str) -> dict:
    """Puts failed topics back in the queue (no extra quota is charged)."""
    get_job(user, id)

    def fn(c):
        if not c or c["status"] not in ("done", "failed"):
            return c
        topics = {k: ({"state": "pending", "attempts": 0} if t["state"] == "failed" else t) for k, t in c["topics"].items()}
        if not any(t["state"] == "pending" for t in topics.values()):
            return c
        n = {**c, "topics": topics, "status": "queued", "leaseUntil": 0, "finished": None}
        n.pop("error", None)
        return n

    return get_store().update("jobs", id, fn)


def _patch(job_id: str, fn):
    return get_store().update("jobs", job_id, lambda c: fn(c) if c else c)


def _set_topic(job_id: str, tid: str, **kw):
    _patch(job_id, lambda j: {**j, "topics": {**j["topics"], tid: {**j["topics"][tid], **kw}}})


def _process_topic(job_id: str, tid: str) -> bool:
    from . import byok

    job = get_store().get("jobs", job_id)
    with byok.as_user(job["uid"] if job else None):  # a learner's own AI key serves their own runs, even from a worker
        return _process_topic_for(job_id, tid)


def _process_topic_for(job_id: str, tid: str) -> bool:
    st = get_store()
    job = st.get("jobs", job_id)
    cd = st.get("courses", job["courseId"])
    course = cd["course"]
    topic = course["topics"][tid]
    unit = next((u for u in course["units"] if u["id"] == topic["u"]), None)
    idx = course["order"].index(tid)
    try:
        # Recognise a saved copy first: same topic (or the same meaning) already written, edited or uploaded by this person.
        hit = None if job["opts"].get("reuse") is False else find_reusable(job["uid"], topic["title"])
        want = depth_of(job["opts"].get("depth"))
        if hit and hit["item"].get("draft") and depth_of(hit["item"]["draft"].get("depth")) != want:
            hit = None  # a saved lesson at a different depth is not the one asked for
        if hit and hit["item"].get("draft"):
            item = hit["item"]
            im = st.get_blob(item["imageBlob"]) if job["opts"]["images"] and item.get("imageBlob") else None
            blob_id = f"img:{job_id}:{tid}" if im else None
            if im:
                st.put_blob(blob_id, im[0], im[1])
            _set_topic(job_id, tid, state="done", draft=item["draft"], score=score_draft(item["draft"], topic["title"]), provider="library",
                       model=hit["how"], imageBlob=blob_id, imageMime=im[1] if im else None, reused=True, error=None)
            mark_used(item["id"])
            stats.note("topic", "saved")
            if not (job["opts"]["images"] and not im):
                return True  # wanted a picture and the saved topic has none: carry on to make one below
        # nobody on this account has written it, but someone may have: the shared pool holds every topic already written, at each depth
        owner = st.get("users", job["uid"]) or {}
        pooled = None if (hit or job["opts"].get("reuse") is False) else pool.get(owner, topic["title"], want)
        reused = (hit["item"].get("draft") if hit else None) or (pooled["draft"] if pooled else None)
        if reused:
            best, calls = {"draft": reused, "score": score_draft(reused, topic["title"]), "provider": "library" if hit else "shared", "model": "", "tokensIn": 0, "tokensOut": 0}, []
            stats.note("topic", "shared" if pooled else "saved")
            if pooled:
                _set_topic(job_id, tid, state="done", draft=reused, score=best["score"], provider="shared", model="", reused=True, error=None)
        else:
            prev = course["topics"].get(course["order"][idx - 1], {}).get("title") if idx > 0 else None
            nxt = course["topics"].get(course["order"][idx + 1], {}).get("title") if idx + 1 < len(course["order"]) else None
            stats.note("topic", "generated")
            tally(job["uid"], "jobtopics", 1)
            r = generate_best(course["title"], unit["title"] if unit else "", topic["title"], job["opts"]["candidates"], prev, nxt, job["opts"]["instructions"], depth_of(job["opts"].get("depth")))
            best, calls = r["best"], r["all"]
            _patch(job_id, lambda j: {**j, "topics": {**j["topics"], tid: {**j["topics"][tid], "state": "done", "draft": best["draft"], "score": best["score"],
                                                                         "provider": best["provider"], "model": best["model"], "error": None}},
                                      "usage": {**j["usage"], "calls": j["usage"]["calls"] + len(calls),
                                                "tokensIn": j["usage"]["tokensIn"] + sum(c["tokensIn"] for c in calls),
                                                "tokensOut": j["usage"]["tokensOut"] + sum(c["tokensOut"] for c in calls)}})
        if job["opts"]["images"]:
            try:
                shared_img = st.get_blob(pooled["imageBlob"]) if pooled and pooled.get("imageBlob") else None
                if shared_img:
                    # the picture was already made for this topic: copy it, no credit spent and no model called
                    blob_id = f"img:{job_id}:{tid}"
                    st.put_blob(blob_id, shared_img[0], shared_img[1])
                    _set_topic(job_id, tid, imageBlob=blob_id, imageMime=shared_img[1])
                    stats.note("image", "shared")
                else:
                    consume(job["uid"], "images", 1, LIMITS[job["opts"]["plan"]]["imagesPerDay"])
                    img = generate_image(slide_prompt(best["draft"]["imagePrompt"]))
                    blob_id = f"img:{job_id}:{tid}"
                    st.put_blob(blob_id, img["bytes"], img["mime"])
                    _patch(job_id, lambda j: {**j, "topics": {**j["topics"], tid: {**j["topics"][tid], "imageBlob": blob_id, "imageMime": img["mime"]}},
                                              "usage": {**j["usage"], "images": j["usage"]["images"] + 1}})
                    stats.note("image", "generated")
                    pool.add_image(owner, topic["title"], want, {"bytes": img["bytes"], "mime": img["mime"]})
            except Exception as e:  # noqa: BLE001
                warn = e.message if isinstance(e, ApiError) else "The illustration could not be made."
                _set_topic(job_id, tid, warn=warn)
        if not hit:
            # Keep it: the next run, session or edit can start from this instead of paying for it again.
            fresh = (st.get("jobs", job_id) or {}).get("topics", {}).get(tid) or {}
            img = st.get_blob(fresh["imageBlob"]) if fresh.get("imageBlob") else None
            save_topic(job["uid"], topic["title"], best["draft"], course["title"], {"bytes": img[0], "mime": img[1]} if img else None)
            if not pooled:  # written for the first time anywhere: keep it for everyone
                pool.put(owner, topic["title"], want, best["draft"], {"bytes": img[0], "mime": img[1]} if img else None)
        return True
    except Exception as e:  # noqa: BLE001
        msg = e.message if isinstance(e, ApiError) else "Something went wrong while writing this topic."
        log("warn", "job.topic_failed", jobId=job_id, tid=tid, err=str(e)[:300])

        def fn(j):
            t = j["topics"][tid]
            attempts = t["attempts"] + 1
            return {**j, "topics": {**j["topics"], tid: {**t, "attempts": attempts, "error": msg, "state": "failed" if attempts >= MAX_ATTEMPTS else "pending"}}}

        _patch(job_id, fn)
        return False


def _finalize(job_id: str) -> None:
    st = get_store()
    job = st.get("jobs", job_id)
    cd = st.get("courses", job["courseId"])
    done_rows = [(k, t) for k, t in job["topics"].items() if t["state"] == "done" and t.get("draft")]
    if not done_rows:
        _patch(job_id, lambda j: {**j, "status": "failed", "finished": _now(), "leaseUntil": 0,
                                  "error": "We could not write any of the topics. This run was not counted against your daily limit. Try again in a few minutes."})
        refund(job["uid"], "jobs", 1)
        emit("job.failed", {"jobId": job_id, "uid": job["uid"], "courseId": job["courseId"]})
        fu = st.get("users", job["uid"])
        if fu:
            send_mail(fu["email"], "job-failed", T.job_failed(fu["name"], cd["course"]["title"], job_id))
        return
    done = []
    for i, t in done_rows:
        img = st.get_blob(t["imageBlob"]) if t.get("imageBlob") else None
        done.append({"id": i, "draft": t["draft"], "image": {"bytes": img[0], "mime": img[1]} if img else None})
    enriched = enrich_course(cd["course"], done, [t.get("model") or "" for _, t in done_rows])
    base = safe_name(cd["course"]["title"])
    artifacts, warnings = {}, []
    md = render_notes(cd["course"], done, job["opts"]["watermark"])
    st.put_blob(f"art:{job_id}:md", md.encode(), FORMATS["md"]["mime"])
    artifacts["md"] = f"art:{job_id}:md"
    st.put_blob(f"art:{job_id}:json", json.dumps(enriched).encode(), FORMATS["json"]["mime"])
    artifacts["json"] = f"art:{job_id}:json"
    try:
        theme = resolve_style(job["opts"].get("style"), job["opts"].get("accent"), job["opts"].get("instructions", ""),
                              LIMITS[job["opts"]["plan"]]["customInstructions"])
        deck = build_pptx(cd["course"], done, job["opts"]["watermark"], theme)
        st.put_blob(f"art:{job_id}:pptx", deck, FORMATS["pptx"]["mime"])
        artifacts["pptx"] = f"art:{job_id}:pptx"
        save_deck(job["uid"], cd["course"]["title"], deck, job_id)
    except Exception as e:  # noqa: BLE001
        log("error", "job.pptx_failed", jobId=job_id, err=str(e)[:300])
        warnings.append("The PowerPoint file could not be built. Notes and the course file are ready.")
    st.update("courses", cd["id"], lambda c: {**c, "course": enriched, "updated": _now()} if c else c)
    _patch(job_id, lambda j: {**j, "status": "done", "finished": _now(), "leaseUntil": 0, "artifacts": artifacts,
                              **({"error": warnings[0]} if warnings else {})})
    du = st.get("users", job["uid"])
    if du:
        send_mail(du["email"], "job-done", T.job_done(du["name"], cd["course"]["title"], len(done_rows), job_id))
    emit("job.completed", {"jobId": job_id, "uid": job["uid"], "courseId": job["courseId"], "topics": len(done_rows), "file": base, "usage": job["usage"]})


def run_job(job_id: str, budget_ms: float | None = None, concurrency: int = 3) -> str:
    """Advances a job until it finishes or the time budget runs low. Safe to call from several places at once:
    a lease makes only one caller work on a job at a time, and progress is saved per topic, so a job that runs
    out of time simply continues on the next call (web request, cron tick or worker loop)."""
    budget = budget_ms if budget_ms is not None else env().job_budget_ms
    deadline = _now() + budget
    st = get_store()
    claim = {"ok": False}

    def take(c):
        now = _now()
        if not c or c["status"] not in ("queued", "running") or c["leaseUntil"] > now:
            return c
        claim["ok"] = True
        return {**c, "status": "running", "leaseUntil": now + budget + 60_000, "started": c.get("started") or now}

    cur = st.update("jobs", job_id, take)
    if not cur:
        return "missing"
    if not claim["ok"]:
        return "busy" if cur["status"] in ("queued", "running") else cur["status"]
    try:
        while True:
            j = st.get("jobs", job_id)
            if j["status"] == "canceled":
                return "canceled"
            pending = [i for i, t in j["topics"].items() if t["state"] == "pending"]
            if not pending:
                _finalize(job_id)
                return st.get("jobs", job_id)["status"]
            if _now() + 25_000 > deadline:
                _patch(job_id, lambda x: {**x, "status": "queued", "leaseUntil": 0} if x["status"] == "running" else x)
                return "queued"
            batch = pending[:concurrency]
            with ThreadPoolExecutor(max_workers=len(batch)) as ex:
                results = list(ex.map(lambda t: _process_topic(job_id, t), batch))
            if not any(results):
                # Every topic in this round failed (providers down?). Wait before the next attempt instead of spinning.
                _patch(job_id, lambda x: {**x, "status": "queued", "leaseUntil": _now() + 30_000} if x["status"] == "running" else x)
                return "queued"
    except Exception as e:  # noqa: BLE001
        log("error", "job.run_failed", jobId=job_id, err=str(e)[:300])
        _patch(job_id, lambda x: {**x, "status": "queued", "leaseUntil": _now() + 30_000} if x["status"] == "running" else x)
        return "queued"


def due_jobs(limit: int = 5) -> list[str]:
    """Jobs a worker or cron tick should pick up: queued and past any back-off, plus running jobs whose lease expired."""
    st, now = get_store(), _now()
    q = st.find("jobs", where={"status": "queued"}, until=("leaseUntil", now), order_by="created", limit=limit)
    r = st.find("jobs", where={"status": "running"}, until=("leaseUntil", now), order_by="created", limit=limit)
    return [j["id"] for j in sorted([*q, *r], key=lambda j: j["created"])[:limit]]


def artifact(user: dict, id: str, fmt: str) -> dict:
    j = get_job(user, id)
    key = j["artifacts"].get(fmt)
    if not key:
        raise not_found("That file")
    b = get_store().get_blob(key)
    if not b:
        raise not_found("That file")
    cd = get_store().get("courses", j["courseId"])
    return {"data": b[0], "contentType": b[1], "filename": f"{safe_name(cd['course']['title'] if cd else 'worklab-xc')}.{FORMATS[fmt]['ext']}"}


def titles_for(course_id: str) -> dict:
    cd = get_store().get("courses", course_id)
    return {i: t["title"] for i, t in (cd["course"]["topics"] if cd else {}).items()}
