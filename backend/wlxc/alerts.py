"""Tells you when something is wrong, without flooding you: one message per kind of problem per cooldown window.
Set ALERT_WEBHOOK_URL to a Slack, Discord, Teams (incoming webhook) or n8n URL. The body carries `text` (Slack/Teams/n8n) and
`content` (Discord). Alerting must never break a request, so every failure in here is swallowed."""
from __future__ import annotations

import time

from .config import env
from .net import http
from .store import get_store
from .web import log


def notify(kind: str, text: str, **detail) -> bool:
    """Returns True when a message was sent."""
    try:
        cfg = env().alerts
        log("warn", f"alert.{kind}", text=text[:300], **{k: str(v)[:200] for k, v in detail.items()})
        if not cfg.webhook:
            return False
        now = time.time() * 1000
        fresh = {"v": False}

        def claim(c):
            if c and now - c.get("at", 0) < cfg.cooldown_min * 60_000:
                return {**c, "suppressed": c.get("suppressed", 0) + 1}
            fresh["v"] = True
            return {"at": now, "suppressed": 0, "prev": (c or {}).get("suppressed", 0)}

        doc = get_store().update("alerts", kind, claim)
        if not fresh["v"]:
            return False
        extra = f" (+{doc['prev']} more since the last alert)" if doc.get("prev") else ""
        msg = f"[WorkLab XC {'production' if env().prod else 'dev'}] {kind}: {text}{extra}"
        if detail:
            msg += "\n" + "\n".join(f"{k}: {str(v)[:300]}" for k, v in detail.items())
        r = http(cfg.webhook, "POST", json_body={"text": msg[:1800], "content": msg[:1800]}, timeout=8)
        return r.ok
    except Exception:  # noqa: BLE001
        return False
