"""The admin's database screen: browse every collection, and create, change or delete a record, with a record of every change.

Rules that keep it safe:
 - admin accounts only (not developers), and every write is audited with the keys changed;
 - password hashes, session tokens, payment secrets and similar fields are never shown, and cannot be written;
 - the audit trail, login sessions and a few internal tables are read-only; a learner's account record can be changed but not deleted here;
 - a delete needs the record's id typed back as confirmation."""
from __future__ import annotations

import json
import re

from . import abuse
from .crypto import uuid
from .errors import ApiError, not_found
from .store import get_store

SECRET = re.compile(r"(hash|token|secret|password|passwd|cookie|api_?key|keyenc|authorization|signature)", re.I)
READ_ONLY = {"audit", "sessions", "webhook_events", "rl", "ipverdicts", "geoips", "usercreds"}
NO_DELETE = {"users", "emails", "email_canon", "handles"}
_COL = re.compile(r"^[a-z][a-z0-9_]{0,40}$")
MAX_DOC = 256 * 1024
MAX_WINDOW = 5000


def _col(c: str) -> str:
    if not _COL.match(c or ""):
        raise ApiError(400, "bad_collection", "That is not a collection name.")
    return c


def redact(v):
    """The document with every secret-looking field hidden, at any depth."""
    if isinstance(v, dict):
        return {k: ("[hidden]" if SECRET.search(k) else redact(x)) for k, x in v.items()}
    if isinstance(v, list):
        return [redact(x) for x in v]
    return v


def collections() -> dict:
    st = get_store()
    blobs, nbytes = st.blob_stats()
    return {"collections": [{"name": c, "count": n, "readOnly": c in READ_ONLY} for c, n in st.collections()], "blobs": {"count": blobs, "megabytes": round(nbytes / 1_048_576, 2)}}


def browse(col: str, q: str = "", page: int = 1, size: int = 25) -> dict:
    _col(col)
    st = get_store()
    docs = st.find(col, limit=MAX_WINDOW)
    docs.sort(key=lambda d: d.get("updated") or d.get("created") or 0, reverse=True)
    q = q.strip().lower()
    if q:
        docs = [d for d in docs if q in json.dumps(redact(d), default=str).lower()]
    size = min(max(size, 1), 100)
    page = max(page, 1)
    rows = docs[(page - 1) * size: page * size]
    return {"collection": col, "total": len(docs), "capped": st.count(col) > MAX_WINDOW, "page": page, "pageSize": size, "readOnly": col in READ_ONLY,
            "rows": [{"id": d.get("id", ""), "preview": json.dumps(redact(d), default=str)[:240]} for d in rows]}


def get_doc(col: str, id: str, actor: dict | None = None) -> dict:
    _col(col)
    d = get_store().get(col, id)
    if d is None:
        raise not_found("That record")
    return {"collection": col, "id": id, "readOnly": col in READ_ONLY, "canDelete": col not in READ_ONLY and col not in NO_DELETE, "doc": redact(d)}


def _clean(data) -> dict:
    if not isinstance(data, dict):
        raise ApiError(422, "bad_record", "A record is a JSON object.")
    if len(json.dumps(data, default=str)) > MAX_DOC:
        raise ApiError(413, "too_large", "That record is too large.")
    bad = [k for k in _flat_keys(data) if SECRET.search(k)]
    if bad:
        raise ApiError(422, "secret_field", f"Fields like {bad[0]} hold secrets and cannot be written here.")
    return data


def _flat_keys(v):
    if isinstance(v, dict):
        for k, x in v.items():
            yield k
            yield from _flat_keys(x)
    elif isinstance(v, list):
        for x in v:
            yield from _flat_keys(x)


def _audit(admin: dict, action: str, col: str, id: str, keys: list[str]) -> None:
    abuse.audit(admin["id"], action, f"{col}/{id}", {"keys": keys[:40]})


def create(admin: dict, col: str, id: str, data: dict) -> dict:
    _col(col)
    if col in READ_ONLY:
        raise ApiError(403, "read_only", "That collection is read-only.")
    data = _clean(data)
    id = (id or data.get("id") or uuid()).strip()[:200]
    doc = {**data, "id": id}
    if not get_store().insert(col, id, doc):
        raise ApiError(409, "exists", "A record with that id already exists.")
    _audit(admin, "admin.db_create", col, id, list(data))
    return get_doc(col, id)


def change(admin: dict, col: str, id: str, data: dict, mode: str = "merge") -> dict:
    _col(col)
    if col in READ_ONLY:
        raise ApiError(403, "read_only", "That collection is read-only.")
    data = _clean(data)
    st = get_store()
    cur = st.get(col, id)
    if cur is None:
        raise not_found("That record")
    if mode == "replace":
        if col in NO_DELETE:
            raise ApiError(403, "merge_only", "Account records can be changed field by field, not replaced.")
        # secret fields already on the record are kept: the screen never showed them, so they cannot have been edited
        keep = {k: v for k, v in cur.items() if SECRET.search(k)}
        new = {**data, "id": id, **keep}
    else:
        if "id" in data and data["id"] != id:
            raise ApiError(422, "id_locked", "A record's id cannot be changed.")
        new = {**cur, **data}
    st.put(col, id, new)
    _audit(admin, "admin.db_replace" if mode == "replace" else "admin.db_update", col, id, sorted(set(data) | (set(cur) - set(new))))
    return get_doc(col, id)


def remove(admin: dict, col: str, id: str, confirm: str) -> dict:
    _col(col)
    if col in READ_ONLY or col in NO_DELETE:
        raise ApiError(403, "no_delete", "Records in that collection cannot be deleted here.")
    if confirm != id:
        raise ApiError(422, "confirm_needed", "Type the record's id to confirm the delete.")
    if get_store().get(col, id) is None:
        raise not_found("That record")
    get_store().delete(col, id)
    _audit(admin, "admin.db_delete", col, id, [])
    return {"ok": True}
