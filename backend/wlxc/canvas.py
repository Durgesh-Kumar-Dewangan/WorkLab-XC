"""The exploration canvas: a board where a question gets an answer made of a short explanation, key ideas, a small diagram or
table and, when the plan allows, a generated picture. Any idea can be branched into a new question, and notes sit beside the
cards. A canvas is one document per board, kept per account; pictures are stored as blobs that only their owner can read."""
from __future__ import annotations

import re
import time

from . import image as imagemod
from . import llm
from .config import env
from .crypto import uuid
from .errors import ApiError, not_found
from .store import get_store

COL = "canvases"
MAX_NODES = 120
MAX_CANVASES = 40
TONES = ("blue", "green", "amber", "red", "violet", "gray")
NOTE_COLORS = ("orange", "yellow", "green", "blue", "pink")
CANVAS_PER_MONTH = {"prototype": 6}  # every paid plan: effectively unlimited


def monthly_limit(plan: str) -> int:
    return CANVAS_PER_MONTH.get(plan, 2000)


def _s(v, n: int) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()[:n]


def _num(v, lo: float, hi: float, d: float = 0) -> float:
    try:
        return max(lo, min(hi, float(v)))
    except (TypeError, ValueError):
        return d


# ---------------------------------------------------------------- the answer

SYSTEM = (
    "You write answers for a visual learning canvas. Reply with ONLY JSON of this shape: "
    '{"title": "short title", "summary": "2 to 4 plain sentences", '
    '"points": [{"label": "2-4 words", "text": "one sentence"}], '
    '"diagram": {"title": "short", "tiers": [[{"label": "short", "tone": "blue|green|amber|red|violet|gray"}]]} or null, '
    '"table": {"title": "short", "columns": ["a", "b"], "rows": [["x", "y"]]} or null, '
    '"followups": ["a natural next question"], '
    '"imagePrompt": "a one-sentence description of a helpful illustration, no text in the picture"}. '
    "Use 3 to 6 points. Use a diagram (at most 4 tiers of at most 4 boxes, read top to bottom) when the idea is a process or a set of parts, "
    "and a table (at most 4 columns and 6 rows) when the idea is a comparison. Use null for the one you do not need. "
    "Be accurate and say plainly when something is uncertain. No markdown, no HTML."
)


def _validate(j) -> dict:
    if not isinstance(j, dict):
        raise ValueError("the reply must be a JSON object")
    summary = _s(j.get("summary"), 900)
    if not summary:
        raise ValueError("summary is missing")
    points = []
    for p in (j.get("points") or [])[:6]:
        if isinstance(p, dict) and _s(p.get("text"), 300):
            points.append({"label": _s(p.get("label"), 40) or "Idea", "text": _s(p.get("text"), 300)})
    if len(points) < 2:
        raise ValueError("at least 2 points are needed")
    out = {"title": _s(j.get("title"), 80), "summary": summary, "points": points,
           "followups": [_s(f, 140) for f in (j.get("followups") or [])[:3] if _s(f, 140)],
           "imagePrompt": _s(j.get("imagePrompt"), 300), "diagram": None, "table": None}
    d = j.get("diagram")
    if isinstance(d, dict) and isinstance(d.get("tiers"), list):
        tiers = []
        for t in d["tiers"][:4]:
            boxes = [{"label": _s(b.get("label"), 36), "tone": b.get("tone") if b.get("tone") in TONES else "blue"}
                     for b in (t or [])[:4] if isinstance(b, dict) and _s(b.get("label"), 36)]
            if boxes:
                tiers.append(boxes)
        if tiers:
            out["diagram"] = {"title": _s(d.get("title"), 60), "tiers": tiers}
    t = j.get("table")
    if isinstance(t, dict) and isinstance(t.get("columns"), list) and isinstance(t.get("rows"), list):
        cols = [_s(c, 30) for c in t["columns"][:4]]
        rows = [[_s(c, 80) for c in (r or [])[: len(cols)]] for r in t["rows"][:6] if isinstance(r, list)]
        if len(cols) >= 2 and rows:
            out["table"] = {"title": _s(t.get("title"), 60), "columns": cols, "rows": rows}
    return out


def answer(question: str, context: str = "") -> dict:
    user = f"Question: {question}"
    if context:
        user = f"This question branches from an earlier answer on the canvas:\n{context[:900]}\n\n{user}"
    res = llm.complete_json(SYSTEM, user, _validate, max_tokens=1300, temperature=0.4)
    return {**res["value"], "model": res["usage"]["provider"]}


def _from_draft(title: str, d: dict) -> dict:
    """A canvas answer built from a lesson that is already stored for this topic. It costs nothing: no model is asked."""
    points = []
    for x in d.get("scratch") or []:
        points.append({"label": x["heading"], "text": x["body"].split("\n\n")[0]})
    if len(points) < 2:
        points = [{"label": s["title"], "text": s["bullets"][0]} for s in d["slides"] if s.get("bullets")]
    diagram = None
    for g in d.get("diagrams") or []:
        if g["kind"] == "tiers":
            diagram = {"title": g["title"], "tiers": [[{"label": l, "tone": "blue"} for l in row] for row in g["tiers"]]}
        elif g["kind"] in ("flow", "cycle"):
            diagram = {"title": g["title"], "tiers": [[{"label": st["label"], "tone": "blue"}] for st in g["steps"][:4]]}
        if diagram:
            break
    if not diagram and len(d["slides"]) >= 2:
        diagram = {"title": "How it builds up", "tiers": [[{"label": s["title"][:36], "tone": "blue"}] for s in d["slides"][:4]]}
    table = None
    for g in d.get("diagrams") or []:
        if g["kind"] == "compare":
            cols = [c["title"] for c in g["columns"]]
            n = max(len(c["points"]) for c in g["columns"])
            table = {"title": g["title"], "columns": cols, "rows": [[(c["points"][i] if i < len(c["points"]) else "") for c in g["columns"]] for i in range(min(n, 6))]}
            break
    return _validate({"title": title, "summary": d["summary"], "points": points[:6], "diagram": diagram, "table": table,
                      "followups": [q["q"] for q in d.get("questions", [])[:3]], "imagePrompt": d.get("imagePrompt", "")})


def from_pool(user: dict, question: str) -> dict | None:
    """If a lesson for (nearly) this topic is already stored in the shared pool, answer from it. Returns the answer and the stored picture, if any."""
    from .learn import norm_key, pool_cats, shareable
    from .library import word_similarity
    key = norm_key(question)
    if not key or not shareable(user, question):
        return None
    cats = tuple(f"{c}:" for c in pool_cats(user))
    best, score = None, 0.0
    for doc in get_store().find("shared_topics", limit=500):
        if not doc["id"].startswith(cats):
            continue
        sc = word_similarity(key, norm_key(doc["title"]))
        if sc > score:
            best, score = doc, sc
    if not best or score < 0.6:
        return None
    return {"answer": _from_draft(best["title"], best["draft"]), "imageBlob": best.get("imageBlob"), "title": best["title"]}


def make_picture(uid: str, prompt: str) -> str:
    """Draws the answer's picture with the best image model that is set up, and stores it for its owner. Returns the blob id."""
    img = imagemod.generate_image(imagemod.canvas_prompt(prompt), 1024, 1024, order=env().image_order, quality="medium")
    bid = f"cv-{uid}-{uuid()}"
    get_store().put_blob(bid, img["bytes"], img["mime"])
    return bid


def read_picture(uid: str, bid: str) -> tuple[bytes, str]:
    if not bid.startswith(f"cv-{uid}-"):
        raise not_found("That picture")
    r = get_store().get_blob(bid)
    if not r:
        raise not_found("That picture")
    return r


# ---------------------------------------------------------------- boards

def _mine(uid: str, cid: str) -> dict:
    d = get_store().get(COL, cid)
    if not d or d.get("uid") != uid:
        raise not_found("That canvas")
    return d


def list_boards(uid: str) -> list[dict]:
    rows = get_store().find(COL, {"uid": uid}, order_by="updated", desc=True, limit=MAX_CANVASES)
    return [{"id": d["id"], "title": d["title"], "updated": d["updated"], "count": len(d.get("nodes", []))} for d in rows]


def create_board(uid: str, title: str) -> dict:
    if len(list_boards(uid)) >= MAX_CANVASES:
        raise ApiError(400, "canvas_limit", "You have as many canvases as fit. Delete one first.")
    d = {"id": uuid(), "uid": uid, "title": _s(title, 80) or "Untitled canvas", "nodes": [], "created": int(time.time() * 1000), "updated": int(time.time() * 1000)}
    get_store().put(COL, d["id"], d)
    return d


def get_board(uid: str, cid: str) -> dict:
    return _mine(uid, cid)


def clean_node(n: dict) -> dict | None:
    if not isinstance(n, dict) or n.get("kind") not in ("question", "note"):
        return None
    out = {"id": _s(n.get("id"), 60) or uuid(), "kind": n["kind"], "x": _num(n.get("x"), -20000, 20000), "y": _num(n.get("y"), -20000, 20000),
           "parent": _s(n.get("parent"), 60) or None}
    if n["kind"] == "note":
        out["text"] = str(n.get("text") or "")[:600]
        out["color"] = n.get("color") if n.get("color") in NOTE_COLORS else "orange"
    else:
        out["q"] = _s(n.get("q"), 300)
        a = n.get("a")
        out["a"] = _validate(a) if isinstance(a, dict) and a.get("summary") else None
        out["image"] = _s(n.get("image"), 160) or None
        out["state"] = n.get("state") if n.get("state") in ("ready", "error") else "ready"
        out["error"] = _s(n.get("error"), 200) or None
    return out


def save_board(uid: str, cid: str, title: str | None, nodes: list) -> dict:
    d = _mine(uid, cid)
    clean = [c for c in (clean_node(n) for n in nodes[:MAX_NODES]) if c]
    for c in clean:  # a picture can only be one of the owner's
        if c.get("image") and not str(c["image"]).startswith(f"cv-{uid}-"):
            c["image"] = None
    d = {**d, "nodes": clean, "updated": int(time.time() * 1000)}
    if title:
        d["title"] = _s(title, 80) or d["title"]
    get_store().put(COL, cid, d)
    return d


def remove_board(uid: str, cid: str) -> None:
    d = _mine(uid, cid)
    for n in d.get("nodes", []):
        if n.get("image"):
            get_store().delete_blob(n["image"])
    get_store().delete(COL, cid)


def add_node(uid: str, cid: str, node: dict) -> None:
    def fn(d):
        if not d or d.get("uid") != uid:
            return d
        nodes = list(d.get("nodes", []))
        if len(nodes) >= MAX_NODES:
            raise ApiError(400, "canvas_full", "This canvas is full. Start a new one to keep exploring.")
        nodes.append(node)
        return {**d, "nodes": nodes, "updated": int(time.time() * 1000)}

    r = get_store().update(COL, cid, fn)
    if r is None:
        raise not_found("That canvas")
