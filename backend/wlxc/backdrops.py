"""The backdrop library for the open-air classrooms: the scenery seen behind the stage. The owner adds pictures and videos
(by link, or a file under /backdrops/), puts them in order, and the classroom plays them as a queue, changing the
background on its own. Painted scenes drawn in code are always available, so the queue is never empty."""
from __future__ import annotations

import re

from .crypto import uuid
from .errors import ApiError, not_found
from .store import get_store

COL = "backdrops"
KINDS = ("painted", "image", "video")
PAINTED = {
    "alpine": "Alpine morning",
    "sunset": "Golden sunset",
    "pines": "Misty pines",
}
_URL = re.compile(r"^(https://[^\s\"'<>]{4,500}|/backdrops/[A-Za-z0-9._-]{1,120})$")
MAX_ITEMS = 60


def _seed() -> None:
    s = get_store()
    if s.find(COL, limit=1):
        return
    for i, (key, title) in enumerate(PAINTED.items()):
        s.put(COL, f"preset-{key}", {"id": f"preset-{key}", "title": title, "kind": "painted", "src": key, "order": i, "seconds": 90, "active": True})


def _clean(d: dict) -> dict:
    return {k: d.get(k) for k in ("id", "title", "kind", "src", "order", "seconds", "active")}


def list_items(only_active: bool) -> list[dict]:
    _seed()
    rows = [_clean(d) for d in get_store().find(COL, limit=200)]
    if only_active:
        rows = [r for r in rows if r["active"]]
    return sorted(rows, key=lambda r: (r["order"] or 0, r["title"] or ""))


def _check(kind: str, src: str) -> None:
    if kind == "painted":
        if src not in PAINTED:
            raise ApiError(400, "bad_backdrop", "That painted scene does not exist.")
    elif not _URL.match(src):
        raise ApiError(400, "bad_backdrop", "Use a link that starts with https:// or a file under /backdrops/.")


def add(title: str, kind: str, src: str, seconds: int) -> dict:
    _seed()
    _check(kind, src)
    s = get_store()
    items = list_items(False)
    if len(items) >= MAX_ITEMS:
        raise ApiError(400, "library_full", "The library is full. Remove a backdrop first.")
    item = {"id": uuid(), "title": title, "kind": kind, "src": src, "order": (items[-1]["order"] + 1) if items else 0, "seconds": seconds, "active": True}
    s.put(COL, item["id"], item)
    return _clean(item)


def update(id: str, patch: dict) -> dict:
    def fn(d):
        if d is None:
            return None
        for k in ("title", "seconds", "active", "order"):
            if patch.get(k) is not None:
                d[k] = patch[k]
        return d

    r = get_store().update(COL, id, fn)
    if r is None:
        raise not_found("That backdrop")
    return _clean(r)


def remove(id: str) -> None:
    if not get_store().get(COL, id):
        raise not_found("That backdrop")
    get_store().delete(COL, id)
