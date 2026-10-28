"""Turns generated drafts into the classroom's course shape, and into Markdown notes."""
from __future__ import annotations

import re
import time

AI_NOTE = "AI-generated study material. Check important facts against your course material before relying on them."
WATERMARK = "Made with WorkLab XC (free plan). Upgrade to remove this line."
LETTERS = "ABCD"


def to_classroom_slides(d: dict) -> list[dict]:
    """Maps the model's slides onto the classroom's Slide shape, assigning teacher pose and camera by position."""
    out = []
    n = len(d["slides"])
    for i, s in enumerate(d["slides"]):
        last = i == n - 1
        f = s.get("formula")
        out.append({"t": s["title"], "b": s["bullets"], "say": s["narration"],
                    "av": "wave" if i == 0 else "point" if f else "think" if last else "talk",
                    "cam": "teacher" if i == 0 else "board" if f else "close" if last else "overview" if i % 3 == 0 else "board",
                    **({"f": f} if f else {})})
    return out


def enrich_course(course: dict, done: list[dict], models: list[str], now: float | None = None) -> dict:
    """Returns a copy of the course with generated lessons patched in; topics that failed keep their original template."""
    topics = dict(course["topics"])
    for d in done:
        t = topics.get(d["id"])
        if not t:
            continue
        dr = d["draft"]
        topics[d["id"]] = {**t, "summary": dr["summary"], "obj": dr["objectives"], "slides": to_classroom_slides(dr),
                           "qs": [{"type": "mcq", "q": q["q"], "opts": q["options"], "ans": q["answer"], "why": q["why"]} for q in dr["questions"]],
                           "mins": max(5, min(30, round(sum(len(s["narration"]) for s in dr["slides"]) / 900) + 4)), "uncertain": False,
                           **({"subject": dr["subject"]} if dr.get("subject") else {})}
    seen = list(dict.fromkeys(models))
    return {**course, "topics": topics, "ai": {"generatedAt": time.time() * 1000 if now is None else now, "models": seen, "note": AI_NOTE}}


def render_notes(course: dict, done: list[dict], watermark: bool) -> str:
    by = {d["id"]: d for d in done}
    out = [f"# {course['title']}", "", f"_{AI_NOTE}_", ""]
    for u in course["units"]:
        ts = [i for i in u["topics"] if i in by]
        if not ts:
            continue
        out += [f"## {u['title']}", ""]
        for i in ts:
            d = by[i]["draft"]
            out += [f"### {course['topics'][i]['title']}", "", f"*{d['summary']}*", "", "**You will be able to:**", *[f"- {o}" for o in d["objectives"]], "",
                    re.sub(r"^#{1,3}\s", "#### ", d["notes"], flags=re.M), "", "**Check yourself**", ""]
            for k, q in enumerate(d["questions"]):
                out += [f"{k + 1}. {q['q']}", *[f"   - {LETTERS[j]}. {o}" for j, o in enumerate(q["options"])],
                        f"   - Answer: {LETTERS[q['answer']]}. {q['why']}", ""]
    if watermark:
        out += ["---", f"_{WATERMARK}_"]
    return "\n".join(out)


def safe_name(s: str) -> str:
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", s, flags=re.I))[:60] or "worklab-xc"
