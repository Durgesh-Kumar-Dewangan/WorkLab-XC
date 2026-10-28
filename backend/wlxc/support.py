from __future__ import annotations

import re
import time

from . import integrations as integ
from .crypto import uuid
from .mail import T, send_mail, to_team
from .store import get_store


def create_ticket(user: dict | None, message: str, contact: str | None = None, job_id: str | None = None) -> dict:
    """Files a support ticket and returns a WhatsApp link so the person can continue the chat there."""
    t = {"id": f"t_{uuid()[:8]}", "uid": user["id"] if user else None, "email": user["email"] if user else None, "contact": contact,
         "message": message, "jobId": job_id, "status": "open", "created": time.time() * 1000}
    get_store().put("tickets", t["id"], t)
    summary = re.sub(r"\s+", " ", message)[:120]
    wa = integ.support_link(t["id"], summary)
    reply_to = user["email"] if user else (contact if contact and re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$", contact) else None)
    to_team("ticket-team", T.ticket_to_team(t["id"], t["email"] or t["contact"] or "a visitor", message, t["jobId"]))
    if reply_to:
        send_mail(reply_to, "ticket-received", T.ticket_received(t["id"], wa))
    integ.emit("support.requested", {"ticketId": t["id"], "email": t["email"], "contact": t["contact"], "message": message, "jobId": t["jobId"]})
    integ.notify_ops(f"WorkLab XC ticket {t['id']} from {t['email'] or t['contact'] or 'a visitor'}: {summary}")
    return {"ticket": t, "whatsapp": wa}
