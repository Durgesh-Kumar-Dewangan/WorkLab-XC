"""The shared pool for generated topics: a lesson draft and its illustration, written once and used by everyone who asks for the same topic at the same depth.

Everything lives in the main database (Postgres in production): the draft as a document, the picture as a binary row. A second learner who asks for the
same topic gets the stored copy with no AI call and no cost. A learner who opted out of sharing, or a topic title that looks personal, never goes in."""
from __future__ import annotations

import time

from .store import get_store


def _pid(user: dict, title: str, depth: str) -> str | None:
    from .learn import norm_key, pool_cat, shared_id, shareable
    key = norm_key(title)
    if not key or not shareable(user, title):
        return None
    return shared_id(pool_cat(user), key, f"topic:{depth}")


def get(user: dict, title: str, depth: str) -> dict | None:
    """The stored lesson for this topic at this depth, from the learner's own category pool first and then the general one."""
    from .learn import norm_key, pool_cats, shared_id, shareable
    key = norm_key(title)
    if not key or not shareable(user, title):
        return None
    st = get_store()
    for cat in pool_cats(user):
        hit = st.get("shared_topics", shared_id(cat, key, f"topic:{depth}"))
        if hit and hit.get("draft"):
            st.update("shared_topics", hit["id"], lambda c: {**c, "uses": c.get("uses", 0) + 1} if c else c)
            return hit
    return None


def put(user: dict, title: str, depth: str, draft: dict, image: dict | None = None) -> None:
    pid = _pid(user, title, depth)
    if not pid:
        return
    st = get_store()
    blob = None
    if image:
        blob = f"shimg:{pid}"
        st.put_blob(blob, image["bytes"], image["mime"])
    now = time.time() * 1000
    st.update("shared_topics", pid, lambda c: {"id": pid, "title": title[:160], "depth": depth, "draft": draft, "imageBlob": blob or (c or {}).get("imageBlob"),
                                               "imageMime": image["mime"] if image else (c or {}).get("imageMime"), "version": (c or {}).get("version", 0) + 1,
                                               "created": (c or {}).get("created", now), "updated": now, "uses": (c or {}).get("uses", 0)})


def add_image(user: dict, title: str, depth: str, image: dict) -> None:
    """A topic was stored without a picture and one has now been made: keep it with the topic for the next learner."""
    pid = _pid(user, title, depth)
    st = get_store()
    if not pid or not st.get("shared_topics", pid):
        return
    st.put_blob(f"shimg:{pid}", image["bytes"], image["mime"])
    st.update("shared_topics", pid, lambda c: {**c, "imageBlob": f"shimg:{pid}", "imageMime": image["mime"]} if c else c)
