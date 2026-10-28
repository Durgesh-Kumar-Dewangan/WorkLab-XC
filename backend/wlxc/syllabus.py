"""Rule-based syllabus parser and the template course built from it. No AI involved."""
from __future__ import annotations

import random
import re
import string
import time

UNIT_RE = re.compile(r"^(?:#{1,3}\s+(.+)|(?:unit|week|module|chapter|part|section)\s*(\d+|[ivx]+)\s*[:.\-–—]?\s*(.*))$", re.I)
PAGE_RE = re.compile(r"\(?\b(?:pp?\.?|pages?)\s*(\d+)(?:\s*[-–]\s*(\d+))?\)?", re.I)
_LEAD = re.compile(r"^(unit|week|module|chapter|part|section)\s*(\d+|[ivx]+)", re.I)
_BULLET = re.compile(r"^(?:[-*•▪‣]|\d+(?:\.\d+)*[.)])\s+(.+)$")


def slugify(s: str) -> str:
    return (re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", str(s).lower()))[:24]) or "topic"


def parse_syllabus(text: str, file_name: str | None = None) -> dict:
    lines = [l.strip() for l in str(text or "").replace("\r", "").split("\n")]
    notes: list[str] = []
    title = ""
    units: list[dict] = []
    cur: dict | None = None
    skipped = 0

    def new_unit(t: str) -> dict:
        nonlocal cur
        cur = {"id": f"u{len(units) + 1}", "title": t, "page": None, "topics": [], "guessed": False}
        units.append(cur)
        return cur

    for raw in lines:
        if not raw:
            continue
        m = re.match(r"^(?:course|title)\s*[:\-]\s*(.+)$", raw, re.I)
        if m and not title:
            title = m.group(1).strip()
            continue
        m = re.match(r"^#\s+(.+)$", raw)
        if m and not title and not units:
            title = m.group(1).strip()
            continue
        mu = UNIT_RE.match(raw)
        if mu:
            lm = _LEAD.match(raw)
            lead = lm.group(0) if lm else ""
            t = (mu.group(1) or (lead + (f": {mu.group(3)}" if mu.group(3) else ""))).strip()
            t = re.sub(r"^#+\s*", "", t)
            pg = PAGE_RE.search(t)
            cleaned = re.sub(r"[()\s:–-]+$", "", PAGE_RE.sub("", t, count=1)).strip() or t
            u = new_unit(cleaned)
            if pg:
                u["page"] = int(pg.group(1))
            continue
        mb = _BULLET.match(raw)
        if mb:
            t = mb.group(1).strip()
            pg = PAGE_RE.search(t)
            page = int(pg.group(1)) if pg else None
            t = PAGE_RE.sub("", t, count=1)
            t = re.sub(r"[\s,;:–-]+$", "", t)
            t = re.sub(r"^\[.\]\s*", "", t).strip()
            if len(t) < 3:
                skipped += 1
                continue
            if cur is None:
                new_unit("Topics")["guessed"] = True
            unc = len(t) > 90 or t.endswith("?") or len(t.split(" ")) > 14
            if len(t) > 90:
                t = t[:87].rstrip() + "…"
            cur["topics"].append({"title": t, "page": page, "uncertain": unc})
            continue
        if not title and not units and len(raw) < 80:
            title = re.sub(r":$", "", raw)
            continue
        skipped += 1
    for u in units:
        if not u["topics"]:
            u["topics"].append({"title": u["title"], "page": u["page"], "uncertain": True})
    if skipped:
        notes.append(f"{skipped} line{'' if skipped == 1 else 's'} of running text {'was' if skipped == 1 else 'were'} not turned into topics.")
    if len(units) == 1 and units[0]["guessed"]:
        notes.append("No unit headings were found, so topics are grouped under one heading. You can split them in the review step.")
    if not title:
        title = re.sub(r"[_-]+", " ", re.sub(r"\.[a-z0-9]+$", "", file_name or "Untitled course", flags=re.I))
    return {"title": title, "units": units, "notes": notes, "fileName": file_name or ""}


def _template_topic(title: str, unit_title: str, pg) -> dict:
    """A topic fresh from a syllabus knows only its heading. The summary, objectives, slides and questions are filled in with the
    real lesson the first time the learner opens the topic, so nothing generic is ever shown in their place."""
    return {
        "summary": "",
        "obj": [],
        "slides": [{"t": title, "b": [unit_title], "say": title, "av": "talk", "cam": "board"}],
        "qs": [],
    }


def build_course_from_outline(outline: dict, file_name: str | None = None, now: float | None = None) -> dict:
    now = time.time() * 1000 if now is None else now
    rid = "".join(random.choices(string.ascii_lowercase + string.digits, k=3))
    topics: dict = {}
    order: list[str] = []
    units: list[dict] = []
    prev = None
    for ui, u in enumerate(outline["units"]):
        uid2 = f"u{ui + 1}"
        first_page = u["topics"][0]["page"] if u["topics"] else None
        unit = {"id": uid2, "title": u["title"], "page": u["page"] or first_page or None, "topics": []}
        for ti, t in enumerate(u["topics"]):
            tid = f"{slugify(t['title'])}-{ui}{ti}"
            topics[tid] = {"id": tid, "u": uid2, "page": t["page"] or unit["page"] or None, "title": t["title"], "mins": 10, "demo": "concept",
                           "req": [], "inf": [prev] if prev else [], "uncertain": bool(t["uncertain"]),
                           "infWhy": "Inferred only from the order in your syllabus.", **_template_topic(t["title"], u["title"], t["page"])}
            order.append(tid)
            unit["topics"].append(tid)
            prev = tid
        units.append(unit)
    return {"id": f"c-{slugify(outline['title'])}-{rid}", "title": outline["title"],
            "subtitle": f"From {file_name}" if file_name else "From pasted text", "source": "upload",
            "sourceName": file_name or "Pasted text", "units": units, "topics": topics, "order": order, "created": now, "template": True}
