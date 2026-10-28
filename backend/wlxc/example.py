"""Real-world photos for the lesson slides. A slide can name something you could photograph (a bridge, a pendulum, a leaf); this
finds a freely licensed photograph of it on Wikimedia Commons, keeps a copy so the classroom is fast and never hot-links, and
returns the credit that has to be shown with it. Nothing here costs AI credits."""
from __future__ import annotations

import re
from urllib.parse import quote

from .crypto import sha256
from .errors import ApiError, not_found
from .image import sniff
from .library import norm_key
from .net import http
from .store import get_store

API = "https://commons.wikimedia.org/w/api.php"
UA = "WorkLabXC/1.0 (study images; support@worklabxc.com)"
OK_LICENSE = re.compile(r"^(cc[- ]?by(-sa)?[- ]?[0-9.]*|cc0.*|public domain.*|pd.*)$", re.I)
SKIP_TITLE = re.compile(r"\b(logo|icon|diagram|map|flag|coat of arms|chart|screenshot|poster|svg)\b", re.I)
MAX_BYTES = 2_500_000


def _strip(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html or "")).strip()[:120]


def _search(q: str) -> list[dict]:
    params = {"action": "query", "format": "json", "generator": "search", "gsrnamespace": "6", "gsrlimit": "14",
              "gsrsearch": f"{q} filetype:bitmap", "prop": "imageinfo", "iiprop": "url|extmetadata|mime|size", "iiurlwidth": "1000"}
    url = API + "?" + "&".join(f"{k}={quote(v, safe='')}" for k, v in params.items())
    res = http(url, "GET", {"user-agent": UA, "accept": "application/json"}, timeout=15)
    if not res.ok:
        raise ApiError(503, "photos_unavailable", "The photo library is busy right now. Try again shortly.")
    pages = (res.json().get("query") or {}).get("pages") or {}
    out = []
    for p in sorted(pages.values(), key=lambda x: x.get("index", 99)):
        info = (p.get("imageinfo") or [None])[0] or {}
        meta = info.get("extmetadata") or {}
        lic = _strip((meta.get("LicenseShortName") or {}).get("value", ""))
        if info.get("mime") not in ("image/jpeg", "image/png") or (info.get("width") or 0) < 700 or SKIP_TITLE.search(p.get("title", "")):
            continue
        if not OK_LICENSE.match(lic.replace("CC BY", "cc by")) and not re.match(r"^(CC|Public domain|PD)", lic, re.I):
            continue
        thumb = info.get("thumburl") or info.get("url")
        if not thumb:
            continue
        artist = _strip((meta.get("Artist") or {}).get("value", "")) or "Wikimedia Commons contributor"
        out.append({"thumb": thumb, "page": info.get("descriptionurl", ""), "credit": f"{artist}, {lic}", "title": re.sub(r"^File:|\.[a-z]+$", "", p.get("title", ""), flags=re.I)[:90]})
    return out[:8]


def find(query: str, n: int = 0) -> dict:
    """The n-th (wrapping) photograph for a search, saved on the server. Returns {id, title, credit, source}."""
    q = re.sub(r"\s+", " ", re.sub(r"[^A-Za-z0-9 ,'\-]", "", query or "")).strip()[:70]
    if len(q) < 3:
        raise ApiError(400, "bad_query", "Say what the photograph should show.")
    st = get_store()
    key = sha256(norm_key(q))[:24]
    doc = st.get("examples", key)
    if not doc:
        doc = {"id": key, "query": q, "items": _search(q)}
        st.put("examples", key, doc)
    items = doc["items"]
    if not items:
        raise not_found("A free photograph of that")
    for step in range(len(items)):
        i = (n + step) % len(items)
        it = items[i]
        bid = f"ex-{key}-{i}"
        if not st.get_blob(bid):
            try:
                res = http(it["thumb"], "GET", {"user-agent": UA, "accept": "image/*"}, timeout=20)
            except Exception:  # noqa: BLE001
                continue
            if not res.ok or len(res.content) > MAX_BYTES or not sniff(res.content):
                continue
            st.put_blob(bid, res.content, sniff(res.content) or "image/jpeg")
        return {"id": bid, "title": it["title"], "credit": it["credit"], "source": it["page"], "count": len(items), "index": i}
    raise not_found("A usable photograph of that")


def read(bid: str) -> tuple[bytes, str]:
    if not re.match(r"^ex-[0-9a-f]{24}-\d{1,2}$", bid):
        raise not_found("That photograph")
    r = get_store().get_blob(bid)
    if not r:
        raise not_found("That photograph")
    return r
