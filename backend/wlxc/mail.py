"""Email: queue, send through the first working provider, retry from the cron tick. Never raises to the caller."""
from __future__ import annotations

import base64
import os
import re
import smtplib
import ssl
import time
from email.message import EmailMessage
from urllib.parse import unquote, urlencode, urlparse

from . import bg
from .config import env, integrations
from .crypto import uuid
from .mailtpl import HERO_FOR, T, esc, with_hero  # noqa: F401  (re-exported)
from .net import http
from .store import get_store
from .web import log

BACKOFF = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000]


def _addr(s: str) -> str:
    m = re.search(r"<([^>]+)>", s)
    return m.group(1) if m else s


def _name(s: str) -> str:
    m = re.match(r'^"?([^"<]+?)"?\s*<', s)
    return m.group(1).strip() if m else ""


def _check(r, who: str):
    if not r.ok:
        raise RuntimeError(f"{who} HTTP {r.status} {r.text[:200]}")


def _resend(m):
    _check(http("https://api.resend.com/emails", "POST", {"authorization": f"Bearer {env().mail.resend_key}"},
                json_body={"from": m["from"], "to": [m["to"]], "subject": m["subject"], "html": m["html"], "text": m["text"], "reply_to": m["replyTo"],
                           **({"headers": m["headers"]} if m.get("headers") else {})}, timeout=15), "resend")


def _brevo(m):
    _check(http("https://api.brevo.com/v3/smtp/email", "POST", {"api-key": env().mail.brevo_key, "accept": "application/json"},
                json_body={"sender": {"name": _name(m["from"]) or "WorkLab XC", "email": _addr(m["from"])}, "to": [{"email": m["to"]}],
                           "subject": m["subject"], "htmlContent": m["html"], "textContent": m["text"], "replyTo": {"email": _addr(m["replyTo"])},
                           **({"headers": m["headers"]} if m.get("headers") else {})}, timeout=15), "brevo")


def _mailgun(m):
    c = env().mail
    host = "api.eu.mailgun.net" if c.mailgun_region == "eu" else "api.mailgun.net"
    auth = base64.b64encode(f"api:{c.mailgun_key}".encode()).decode()
    body = urlencode({"from": m["from"], "to": m["to"], "subject": m["subject"], "html": m["html"], "text": m["text"], "h:Reply-To": m["replyTo"],
                      **{f"h:{k}": v for k, v in (m.get("headers") or {}).items()}})
    _check(http(f"https://{host}/v3/{c.mailgun_domain}/messages", "POST",
                {"authorization": f"Basic {auth}", "content-type": "application/x-www-form-urlencoded"}, body=body, timeout=15), "mailgun")


def _smtp(m):
    u = urlparse(env().mail.smtp_url)
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"], msg["Reply-To"] = m["from"], m["to"], m["subject"], m["replyTo"]
    for hk, hv in (m.get("headers") or {}).items():
        msg[hk] = hv
    msg.set_content(m["text"])
    msg.add_alternative(m["html"], subtype="html")
    port = u.port or (465 if u.scheme == "smtps" else 587)
    if u.scheme == "smtps":
        s = smtplib.SMTP_SSL(u.hostname, port, timeout=20, context=ssl.create_default_context())
    else:
        s = smtplib.SMTP(u.hostname, port, timeout=20)
        s.starttls(context=ssl.create_default_context())
    try:
        if u.username:
            s.login(unquote(u.username), unquote(u.password or ""))
        s.send_message(msg)
    finally:
        s.quit()


def _senders():
    c = env().mail
    table = {
        "resend": (bool(c.resend_key), _resend),
        "brevo": (bool(c.brevo_key), _brevo),
        "mailgun": (bool(c.mailgun_key and c.mailgun_domain), _mailgun),
        "smtp": (bool(c.smtp_url), _smtp),
    }
    return [(i, table[i][1]) for i in c.order if i in table and table[i][0]]


def send_now(m: dict) -> str:
    """Sends through the first provider that works; raises only when every configured provider failed."""
    c = env().mail
    full = {**m, "from": m.get("from") or c.noreply, "replyTo": m.get("replyTo") or c.support}
    errs = []
    for sid, fn in _senders():
        try:
            fn(full)
            return sid
        except Exception as e:  # noqa: BLE001
            errs.append(str(e))
    raise RuntimeError(" | ".join(errs) if errs else "no mail provider configured")


def _attempt(id: str) -> bool:
    store = get_store()
    lease: dict = {}

    def take(c):
        if not c or c["status"] != "pending" or c["next"] > time.time() * 1000:
            return c
        lease["v"] = {**c, "next": time.time() * 1000 + 5 * 60_000}
        return lease["v"]

    store.update("mail_outbox", id, take)
    m = lease.get("v")
    if not m:
        return False
    try:
        via = send_now(m)
        store.update("mail_outbox", id, lambda c: {**c, "status": "sent", "attempts": c["attempts"] + 1, "via": via, "html": "", "text": ""} if c else c)
        return True
    except Exception as e:  # noqa: BLE001
        log("warn", "mail.send_failed", kind=m["kind"], err=str(e)[:200])

        def fail(c):
            if not c:
                return c
            attempts = c["attempts"] + 1
            if attempts > len(BACKOFF):
                return {**c, "status": "dead", "attempts": attempts, "html": "", "text": ""}
            return {**c, "attempts": attempts, "next": time.time() * 1000 + BACKOFF[attempts - 1]}

        store.update("mail_outbox", id, fail)
        return False


def send_mail(to: str, kind: str, r: dict, from_: str | None = None, reply_to: str | None = None, headers: dict | None = None) -> None:
    """Queues an email and tries to send it straight away. With no provider configured nothing is sent;
    in development the message is printed so links can be followed."""
    try:
        if not integrations().mail:
            if not env().prod and not os.environ.get("WLXC_QUIET_MAIL"):
                print(f"\n[mail:{kind}] to {to}\n{r['subject']}\n{r['text']}\n", flush=True)
            return
        store = get_store()
        # Same message to the same person within a minute is a double-click or a bug, not two emails.
        if not store.insert("mail_dedupe", f"{kind}:{to}:{int(time.time() // 60)}", {"at": time.time() * 1000}):
            return
        id = f"m_{uuid()}"
        item = {"id": id, "to": to, "kind": kind, "subject": re.sub(r"[\r\n]+", " ", r["subject"])[:200], "html": with_hero(r["html"], HERO_FOR.get(kind, "")), "text": r["text"], "headers": headers or {},
                "from": from_, "replyTo": reply_to, "status": "pending", "attempts": 0, "next": 0, "created": time.time() * 1000}
        store.put("mail_outbox", id, item)
        bg.detach(lambda: _attempt(id))
    except Exception as e:  # noqa: BLE001
        log("warn", "mail.queue_failed", kind=kind, err=str(e)[:200])


def flush_mail(limit: int = 50) -> dict:
    if not integrations().mail:
        return {"sent": 0, "retry": 0}
    due = get_store().find("mail_outbox", where={"status": "pending"}, until=("next", time.time() * 1000), order_by="next", limit=limit)
    sent = sum(1 for m in due if _attempt(m["id"]))
    return {"sent": sent, "retry": len(due) - sent}


def to_team(kind: str, r: dict) -> None:
    send_mail(env().mail.support, kind, r, from_=env().mail.noreply)
