"""n8n automation bridge, Cloudflare Turnstile, WhatsApp helpers."""
from __future__ import annotations

import json
import time
from urllib.parse import quote, urlencode

from . import bg
from .config import env, integrations
from .crypto import hmac_hex, safe_equal, uuid
from .net import http
from .store import get_store
from .web import Req, log

BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000]


def sign(secret: str, ts: str, body: str) -> str:
    return f"sha256={hmac_hex(secret, f'{ts}.{body}')}"


def _deliver(it: dict) -> bool:
    e = env().n8n
    body = json.dumps({"id": it["id"], "type": it["type"], "created": it["created"], "data": it["data"]})
    ts = str(int(time.time()))
    headers = {"content-type": "application/json", "x-wlxc-event-id": it["id"], "x-wlxc-timestamp": ts}
    if e.secret:
        headers["x-wlxc-signature"] = sign(e.secret, ts, body)
    try:
        return http(e.webhook_url, "POST", headers, body=body, timeout=8).ok
    except Exception:  # noqa: BLE001
        return False


def _attempt(id: str) -> bool:
    store = get_store()
    leased: dict = {}

    def take(c):
        if not c or c["status"] != "pending" or c["next"] > time.time() * 1000:
            return c
        leased["v"] = {**c, "next": time.time() * 1000 + 5 * 60_000}
        return leased["v"]

    store.update("outbox", id, take)
    if "v" not in leased:
        return False
    ok = _deliver(leased["v"])

    def done(c):
        if not c:
            return None
        if ok:
            return {**c, "status": "sent", "attempts": c["attempts"] + 1}
        attempts = c["attempts"] + 1
        if attempts > len(BACKOFF_MS):
            return {**c, "status": "dead", "attempts": attempts}
        return {**c, "attempts": attempts, "next": time.time() * 1000 + BACKOFF_MS[attempts - 1]}

    store.update("outbox", id, done)
    return ok


def emit(type_: str, data) -> None:
    """Never raises: automation problems must not break the user's request."""
    if not integrations().n8n:
        return
    try:
        id = f"evt_{uuid()}"
        get_store().put("outbox", id, {"id": id, "type": type_, "data": data, "created": time.time() * 1000, "status": "pending", "attempts": 0, "next": 0})
        bg.detach(lambda: _attempt(id))
    except Exception:  # noqa: BLE001
        pass


def flush_outbox(limit: int = 50) -> dict:
    if not integrations().n8n:
        return {"sent": 0, "pending": 0}
    due = get_store().find("outbox", where={"status": "pending"}, until=("next", time.time() * 1000), order_by="next", limit=limit)
    sent = sum(1 for it in due if _attempt(it["id"]))
    return {"sent": sent, "pending": len(due) - sent}


def verify_inbound(req: Req, body: str) -> bool:
    """Accepts `Authorization: Bearer <secret>` or an HMAC of `${timestamp}.${body}` within 5 minutes."""
    secret = env().n8n.secret
    if not secret:
        return False
    auth = req.header("authorization")
    if auth and auth.startswith("Bearer ") and safe_equal(auth[7:].strip(), secret):
        return True
    ts, sig = req.header("x-wlxc-timestamp"), req.header("x-wlxc-signature")
    if not ts or not sig:
        return False
    try:
        if abs(time.time() - float(ts)) > 300:
            return False
    except ValueError:
        return False
    return safe_equal(sig, sign(secret, ts, body))


def verify_turnstile(token: str | None, ip: str) -> bool:
    """Skipped when TURNSTILE_SECRET is unset, so enable it only once the widget is on the forms."""
    secret = env().turnstile_secret
    if not secret:
        return True
    if not token:
        return False
    try:
        r = http("https://challenges.cloudflare.com/turnstile/v0/siteverify", "POST",
                 {"content-type": "application/x-www-form-urlencoded"}, body=urlencode({"secret": secret, "response": token, "remoteip": ip}), timeout=8)
        return r.json().get("success") is True
    except Exception:  # noqa: BLE001
        return False


def support_link(ticket_id: str, summary: str) -> str | None:
    n = env().whatsapp.support_number
    # the team's number is not shown to learners unless this is switched on; the in-app support chat is the default
    if not n or not env().whatsapp.public_link:
        return None
    text = f"Hi WorkLab XC support, I need help. Ticket {ticket_id}: {summary}"[:400]
    return f"https://wa.me/{n}?text={quote(text, safe="!'()*")}"


def notify_ops(text: str) -> bool:
    if not integrations().whatsapp_api:
        return False
    w = env().whatsapp
    try:
        r = http(f"https://graph.facebook.com/v21.0/{w.phone_id}/messages", "POST", {"authorization": f"Bearer {w.token}"},
                 json_body={"messaging_product": "whatsapp", "to": w.ops_to, "type": "text", "text": {"body": text[:1000]}}, timeout=8)
        if not r.ok:
            log("warn", "whatsapp.notify_failed", status=r.status)
        return r.ok
    except Exception:  # noqa: BLE001
        return False
