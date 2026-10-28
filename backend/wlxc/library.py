"""The library: topics, decks and pictures a person keeps. Every finished run saves its topics here. Before a new run
writes a topic, the library is searched (exact title first, then by meaning) and a saved copy is reused instead of
calling the AI again. Anything can be edited or replaced by hand; an edited topic is never overwritten by a run."""
from __future__ import annotations

import math
import re
import time
import unicodedata

from .auth import effective_plan
from .config import env
from .crypto import sha256
from .errors import ApiError, not_found
from .image import sniff
from .lesson import validate_draft
from .net import http
from .plans import LIMITS
from .store import get_store
from .web import log

MAX_FILE_BYTES = 15 * 1024 * 1024
PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
MATCH = {"embedding": 0.86, "words": 0.8}
_STOP = {"the", "and", "of", "a", "an", "to", "in", "on", "for", "its", "with", "is", "are", "how"}


def norm_key(t: str) -> str:
    t = unicodedata.normalize("NFKD", t.lower())
    t = re.sub("[̀-ͯ]", "", t)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", t)).strip()


def _words(k: str) -> set:
    return {w for w in k.split(" ") if len(w) > 1 and w not in _STOP}


def word_similarity(a: str, b: str) -> float:
    x, y = _words(a), _words(b)
    if not x or not y:
        return 0
    n = len(x & y)
    return n / (len(x) + len(y) - n)


def cosine(a: list, b: list) -> float:
    if len(a) != len(b) or not a:
        return 0
    d = sum(i * j for i, j in zip(a, b))
    x, y = sum(i * i for i in a), sum(j * j for j in b)
    return d / math.sqrt(x * y) if x and y else 0


def embed(text: str) -> list | None:
    """Meaning vector from Azure OpenAI (your startup credits) or OpenAI. None when neither is set or both fail."""
    e = env()
    inp = text[:2000]
    try:
        if e.azure.endpoint and e.azure.key and e.azure.embed_deployment:
            from urllib.parse import quote
            url = f"{e.azure.endpoint}/openai/deployments/{quote(e.azure.embed_deployment, safe='')}/embeddings?api-version={quote(e.azure.api_version, safe='')}"
            r = http(url, "POST", {"content-type": "application/json", "api-key": e.azure.key}, json_body={"input": inp}, timeout=15)
            if r.ok:
                return r.json()["data"][0]["embedding"]
        o = e.llm.openai
        if o.keys:
            r = http(f"{o.base}/embeddings", "POST", {"content-type": "application/json", "authorization": f"Bearer {o.keys[0]}"},
                     json_body={"model": o.embed_model, "input": inp}, timeout=15)
            if r.ok:
                return r.json()["data"][0]["embedding"]
    except Exception as err:  # noqa: BLE001
        log("warn", "library.embed_failed", err=str(err)[:160])
    return None


def _id_for(uid: str, key: str) -> str:
    return f"lt_{sha256(f'{uid}:{key}')[:24]}"


def _clean(s: str, n: int) -> str:
    return s.replace("\x00", "").strip()[:n]


def _clean_tags(t) -> list[str]:
    if not isinstance(t, list):
        return []
    return list(dict.fromkeys(x for x in (_clean(str(i), 30).lower() for i in t) if x))[:10]


def public_item(i: dict) -> dict:
    """What the person sees. Blob keys and vectors stay on the server."""
    d = i.get("draft")
    return {"id": i["id"], "kind": i["kind"], "title": i["title"], "tags": i["tags"], "source": i["source"], "version": i["version"],
            "courseTitle": i.get("courseTitle"), "hasImage": bool(i.get("imageBlob")), "hasFile": bool(i.get("fileBlob")),
            "fileName": i.get("fileName"), "slides": len(d["slides"]) if d else None, "summary": d["summary"] if d else None,
            "uses": i["uses"], "created": i["created"], "updated": i["updated"]}


def _room(user: dict, adding: int = 1) -> None:
    mx = LIMITS[effective_plan(user)]["libraryItems"]
    if get_store().count("library", where={"uid": user["id"]}) + adding > mx:
        raise ApiError(402, "library_full", f"Your plan keeps up to {mx} saved items. Delete some or upgrade.")


def find_reusable(uid: str, title: str, min_score: float | None = None) -> dict | None:
    """Best saved topic for a title, or None. Only the person's own library is searched."""
    st = get_store()
    key = norm_key(title)
    if not key:
        return None
    direct = st.get("library", _id_for(uid, key))
    if direct and direct.get("draft"):
        return {"item": direct, "score": 1, "how": "exact"}
    allx = [i for i in st.find("library", where={"uid": uid, "kind": "topic"}, limit=1000) if i.get("draft")]
    if not allx:
        return None
    q = embed(title) if any(i.get("embedding") for i in allx) else None
    best = None
    for item in allx:
        by_words = word_similarity(key, item["key"])
        by_meaning = cosine(q, item["embedding"]) if q and item.get("embedding") else 0
        score = max(by_meaning, by_words)
        need = min_score if min_score is not None else (MATCH["embedding"] if by_meaning >= by_words else MATCH["words"])
        if score >= need and (not best or score > best["score"]):
            best = {"item": item, "score": score, "how": "meaning" if by_meaning >= by_words and by_meaning > 0 else "words"}
    return best


def save_topic(uid: str, title: str, draft: dict, course_title: str | None = None, image: dict | None = None) -> None:
    """Saves what a run wrote. A topic the person edited by hand is kept as it is."""
    try:
        st = get_store()
        key = norm_key(title)
        if not key:
            return
        id = _id_for(uid, key)
        prev = st.get("library", id)
        if prev and prev["source"] != "generated":
            if image and not prev.get("imageBlob"):
                st.put_blob(f"lib:{id}:img", image["bytes"], image["mime"])
                st.update("library", id, lambda c: {**c, "imageBlob": f"lib:{id}:img", "imageMime": image["mime"]} if c else c)
            return
        if image:
            st.put_blob(f"lib:{id}:img", image["bytes"], image["mime"])
        emb = embed(f"{title}. {draft['summary']}")
        now = time.time() * 1000
        item = {"id": id, "uid": uid, "kind": "topic", "title": _clean(title, 160), "key": key, "tags": (prev or {}).get("tags", []),
                "source": "generated", "version": (prev or {}).get("version", 0) + 1, "draft": draft,
                "imageBlob": f"lib:{id}:img" if image else (prev or {}).get("imageBlob"),
                "imageMime": image["mime"] if image else (prev or {}).get("imageMime"),
                "courseTitle": course_title, "created": (prev or {}).get("created", now), "updated": now, "uses": (prev or {}).get("uses", 0)}
        if emb:
            item["embedding"] = emb
        st.put("library", id, item)
    except Exception as e:  # noqa: BLE001
        log("warn", "library.save_failed", err=str(e)[:160])


def _safe_file(n: str) -> str:
    base = re.sub(r"[^\w\- ]+", "", re.sub(r"\.[a-z0-9]+$", "", n, flags=re.I)).strip()[:60]
    return f"{base or 'deck'}.pptx"


def save_deck(uid: str, title: str, data: bytes, job_id: str) -> None:
    try:
        st = get_store()
        id = f"ld_{sha256(f'{uid}:{job_id}')[:24]}"
        st.put_blob(f"lib:{id}:file", data, PPTX_MIME)
        now = time.time() * 1000
        st.put("library", id, {"id": id, "uid": uid, "kind": "deck", "title": _clean(title, 160), "key": norm_key(title), "tags": [],
                               "source": "generated", "version": 1, "fileBlob": f"lib:{id}:file", "fileMime": PPTX_MIME,
                               "fileName": _safe_file(title), "created": now, "updated": now, "uses": 0})
    except Exception as e:  # noqa: BLE001
        log("warn", "library.save_deck_failed", err=str(e)[:160])


def mark_used(id: str) -> None:
    get_store().update("library", id, lambda c: {**c, "uses": c["uses"] + 1} if c else c)


def list_items(user: dict, q: str = "", kind: str = "") -> list[dict]:
    where = {"uid": user["id"]}
    if kind in ("topic", "deck"):
        where["kind"] = kind
    rows = get_store().find("library", where=where, order_by="updated", desc=True, limit=1000)
    nq = norm_key(q or "")
    if nq:
        e = embed(q)
        scored = []
        for r in rows:
            s = max(1 if nq in r["key"] or any(nq in t for t in r["tags"]) else 0, word_similarity(nq, r["key"]),
                    cosine(e, r["embedding"]) if e and r.get("embedding") else 0)
            if s >= 0.5:
                scored.append((s, r))
        scored.sort(key=lambda x: -x[0])
        rows = [r for _, r in scored]
    return [public_item(r) for r in rows]


def get_item(user: dict, id: str) -> dict:
    i = get_store().get("library", id)
    if not i or i["uid"] != user["id"]:
        raise not_found("That saved item")
    return i


def update_item(user: dict, id: str, title: str | None = None, tags: list | None = None, draft=None, has_draft: bool = False) -> dict:
    """Edit the title, tags or (for a topic) the content. A content edit is checked like any AI draft."""
    cur = get_item(user, id)
    new_draft = None
    if has_draft:
        if cur["kind"] != "topic":
            raise ApiError(422, "invalid_input", "Only saved topics have editable content.")
        try:
            new_draft = validate_draft(draft)
        except Exception as e:  # noqa: BLE001
            raise ApiError(422, "invalid_draft", f"That content is not valid: {e}") from None
    ttl = _clean(title, 160) if title is not None else cur["title"]
    if not ttl:
        raise ApiError(422, "invalid_input", "The title cannot be empty.")
    key = norm_key(ttl)
    st = get_store()
    if key != cur["key"] and cur["kind"] == "topic" and st.get("library", _id_for(user["id"], key)):
        raise ApiError(409, "duplicate", "You already have a saved topic with that title.")
    changed = bool(new_draft) or ttl != cur["title"]
    emb = cur.get("embedding")
    if cur["kind"] == "topic" and changed:
        emb = embed(f"{ttl}. {(new_draft or cur.get('draft') or {}).get('summary', '')}")

    def fn(c):
        if not c:
            return c
        n = {**c, "title": ttl, "key": key, "tags": _clean_tags(tags) if tags is not None else c["tags"], "draft": new_draft or c.get("draft"),
             "source": "edited" if new_draft or c["source"] == "edited" else c["source"],
             "version": c["version"] + 1 if changed else c["version"], "updated": time.time() * 1000}
        if emb:
            n["embedding"] = emb
        else:
            n.pop("embedding", None)
        if n["draft"] is None:
            n.pop("draft")
        return n

    return public_item(st.update("library", id, fn))


def _assert_pptx(b: bytes) -> None:
    # A .pptx is a zip: it starts with "PK" and its entry names (stored in the clear) include ppt/ parts.
    if not (len(b) > 4 and b[:2] == b"PK") or b"ppt/" not in b:
        raise ApiError(422, "invalid_file", "Use a PowerPoint (.pptx) file.")


def replace_file(user: dict, id: str, name: str, data: bytes) -> dict:
    """Replace the picture of a topic, or the PowerPoint of a deck, with a file the person made."""
    cur = get_item(user, id)
    if len(data) == 0:
        raise ApiError(422, "invalid_input", "That file is empty.")
    if len(data) > MAX_FILE_BYTES:
        raise ApiError(413, "too_large", "That file is larger than 15 MB.")
    st = get_store()
    now = lambda: time.time() * 1000  # noqa: E731
    if cur["kind"] == "topic":
        mime = sniff(data)
        if not mime:
            raise ApiError(422, "invalid_file", "Use a PNG, JPEG or WebP picture.")
        st.put_blob(f"lib:{id}:img", data, mime)
        st.update("library", id, lambda c: {**c, "imageBlob": f"lib:{id}:img", "imageMime": mime,
                                            "source": "edited" if c["source"] == "generated" else c["source"], "version": c["version"] + 1, "updated": now()} if c else c)
    else:
        _assert_pptx(data)
        st.put_blob(f"lib:{id}:file", data, PPTX_MIME)
        st.update("library", id, lambda c: {**c, "fileBlob": f"lib:{id}:file", "fileMime": PPTX_MIME, "fileName": _safe_file(name),
                                            "source": "edited", "version": c["version"] + 1, "updated": now()} if c else c)
    return public_item(st.get("library", id))


def create_deck(user: dict, title: str, name: str, data: bytes, tags=None) -> dict:
    _room(user)
    title = _clean(title, 160)
    if not title:
        raise ApiError(422, "invalid_input", "Give it a title.")
    if len(data) > MAX_FILE_BYTES:
        raise ApiError(413, "too_large", "That file is larger than 15 MB.")
    _assert_pptx(data)
    now = time.time() * 1000
    id = f"ld_{sha256(f'{user['id']}:{now}:{title}')[:24]}"
    st = get_store()
    st.put_blob(f"lib:{id}:file", data, PPTX_MIME)
    item = {"id": id, "uid": user["id"], "kind": "deck", "title": title, "key": norm_key(title), "tags": _clean_tags(tags), "source": "uploaded",
            "version": 1, "fileBlob": f"lib:{id}:file", "fileMime": PPTX_MIME, "fileName": _safe_file(name), "created": now, "updated": now, "uses": 0}
    st.put("library", id, item)
    return public_item(item)


def create_topic(user: dict, title: str, draft, tags=None) -> dict:
    _room(user)
    title = _clean(title, 160)
    if not title:
        raise ApiError(422, "invalid_input", "Give it a title.")
    try:
        d = validate_draft(draft)
    except Exception as e:  # noqa: BLE001
        raise ApiError(422, "invalid_draft", f"That content is not valid: {e}") from None
    key = norm_key(title)
    id = _id_for(user["id"], key)
    st = get_store()
    if st.get("library", id):
        raise ApiError(409, "duplicate", "You already have a saved topic with that title.")
    now = time.time() * 1000
    item = {"id": id, "uid": user["id"], "kind": "topic", "title": title, "key": key, "tags": _clean_tags(tags), "source": "uploaded", "version": 1,
            "draft": d, "created": now, "updated": now, "uses": 0}
    emb = embed(f"{title}. {d['summary']}")
    if emb:
        item["embedding"] = emb
    st.put("library", id, item)
    return public_item(item)


def delete_item(user: dict, id: str) -> None:
    cur = get_item(user, id)
    st = get_store()
    for b in (cur.get("imageBlob"), cur.get("fileBlob")):
        if b:
            st.delete_blob(b)
    st.delete("library", id)


def item_file(user: dict, id: str, part: str) -> dict:
    cur = get_item(user, id)
    key = cur.get("imageBlob") if part == "image" else cur.get("fileBlob")
    blob = get_store().get_blob(key) if key else None
    if not blob:
        raise not_found("That file")
    data, ct = blob
    return {"data": data, "contentType": ct, "name": cur.get("fileName") or f"{cur['title'][:60]}.{(ct.split('/') + ['bin'])[1]}"}
