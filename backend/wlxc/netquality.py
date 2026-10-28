"""Weak-connection detection. The browser reports what it knows about its own link (Network Information API, sent as the
`x-wlxc-net` header by the front end, or as standard Client Hints `ect`/`downlink`/`rtt`/`save-data`). On a slow link the server
leaves out heavy extras (AI pictures) so a run finishes and downloads stay small, and tells the page why.

This is a hint from the client, never a security control: it only ever makes responses lighter."""
from __future__ import annotations

import re

from .web import Req


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def read(req: Req) -> dict:
    h = {"effectiveType": None, "downlink": None, "rtt": None, "saveData": False}
    raw = req.header("x-wlxc-net") or ""
    for part in raw.split(";"):
        k, _, v = part.partition("=")
        k, v = k.strip().lower(), v.strip().lower()
        if k == "ect" and re.fullmatch(r"slow-2g|2g|3g|4g", v):
            h["effectiveType"] = v
        elif k == "downlink":
            h["downlink"] = _num(v)
        elif k == "rtt":
            h["rtt"] = _num(v)
        elif k == "save-data":
            h["saveData"] = v in ("1", "on", "true")
    h["effectiveType"] = h["effectiveType"] or (req.header("ect") or "").lower() or None
    h["downlink"] = h["downlink"] if h["downlink"] is not None else _num(req.header("downlink"))
    h["rtt"] = h["rtt"] if h["rtt"] is not None else _num(req.header("rtt"))
    h["saveData"] = h["saveData"] or (req.header("save-data") or "").lower() == "on"
    return h


def assess(req: Req) -> dict:
    h = read(req)
    reasons = []
    if h["saveData"]:
        reasons.append("data saver is on")
    if h["effectiveType"] in ("slow-2g", "2g"):
        reasons.append(f"connection looks like {h['effectiveType']}")
    if h["downlink"] is not None and h["downlink"] < 0.7:
        reasons.append("download speed is under 0.7 Mbps")
    if h["rtt"] is not None and h["rtt"] > 1500:
        reasons.append("the connection is very slow to respond")
    return {"slow": bool(reasons), "reasons": reasons, "reported": h}
