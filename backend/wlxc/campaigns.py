"""Product-update and lifecycle emails: a header picture, open and click tracking, one-click unsubscribe, and a frequency cap.

Three kinds of mail go through here:
  * announcements the owner sends to a group (everyone, Free learners, or paid learners) when something new ships;
  * renewal reminders to paid learners whose plan is about to end (a service notice: sent even if they unsubscribed from product mail);
  * a gentle "go further with Beta" note to engaged Free learners, at most once every two weeks, with an honest list of what Beta adds.
Every message is sent from the updates address on your own domain, links to a header picture under /mail/, and carries a
link that stops product mail with one click. Tracking is an invisible 1x1 picture (opens) and a redirect link (clicks); the
redirect only ever goes to the address stored on the server for that message, never to one taken from the link."""
from __future__ import annotations

import time

from .config import env
from .crypto import hmac_hex, safe_equal, uuid
from .errors import ApiError
from .mailtpl import date, esc, layout, with_hero
from .store import get_store

DAY = 86_400_000
GIF = bytes.fromhex("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b")
HEROES = ("welcome", "update", "renewal", "expired", "upgrade", "support", "session", "receipt", "security")


# ---------------------------------------------------------------- unsubscribe

def unsub_token(uid: str) -> str:
    return f"{uid}.{hmac_hex(env().session_secret, 'unsub:' + uid)[:24]}"


def unsubscribe(token: str) -> bool:
    uid, _, sig = (token or "").partition(".")
    if not uid or not safe_equal(sig, hmac_hex(env().session_secret, "unsub:" + uid)[:24]):
        return False
    return bool(get_store().update("users", uid, lambda c: {**c, "mailPrefs": {**(c.get("mailPrefs") or {}), "marketing": False}} if c else c))


def set_marketing(uid: str, on: bool) -> None:
    get_store().update("users", uid, lambda c: {**c, "mailPrefs": {**(c.get("mailPrefs") or {}), "marketing": bool(on)}} if c else c)


def wants_marketing(u: dict) -> bool:
    return bool(u.get("emailVerified")) and (u.get("mailPrefs") or {}).get("marketing", True) is not False


# ---------------------------------------------------------------- building a tracked message

def _safe_url(url: str) -> str:
    base = env().app_url.rstrip("/")
    u = (url or "").strip()
    if u.startswith("/") and not u.startswith("//"):
        return base + u
    if u.startswith(base + "/") or u == base:
        return u
    raise ApiError(422, "invalid_input", f"Links must point to your own site ({base}).")


def build(user: dict, campaign: str, kind: str, subject: str, headline: str, paragraphs: list[str], cta: dict | None, hero: str, marketing: bool = True) -> dict:
    base = env().app_url.rstrip("/")
    tok = uuid()[:22]
    links: dict[str, str] = {}
    button = None
    if cta:
        links["1"] = _safe_url(cta["url"])
        button = {"label": cta["label"], "url": f"{base}/api/t/c/{tok}/1"}
    foot = ("You are getting this product email from WorkLab XC because you have an account." if marketing
            else "This is a service notice about your WorkLab XC plan.")
    r = layout(headline, subject, paragraphs, button, foot)
    r["html"] = with_hero(r["html"], hero if hero in HEROES else "update")
    pixel = f'<img src="{base}/api/t/o/{tok}.gif" width="1" height="1" alt="" style="display:block;border:0">'
    unsub = unsub_token(user["id"])
    link = f"{base}/api/mail/unsubscribe/{unsub}"
    tail = (f'<p style="font-size:12px;color:#6b7280;text-align:center;margin:12px 0 0">Do not want product emails? '
            f'<a href="{esc(link)}" style="color:#6b7280">Unsubscribe in one click</a>. You will still get important notices about your account.</p>') if marketing else ""
    r["html"] = r["html"].replace("</body>", f"{tail}{pixel}</body>")
    if marketing:
        r["text"] += f"\n\nStop product emails: {link}"
    get_store().put("mail_track", tok, {"id": tok, "uid": user["id"], "campaign": campaign, "kind": kind, "links": links, "opens": 0, "clicks": 0, "created": time.time() * 1000})
    r["subject"] = subject
    r["headers"] = {"List-Unsubscribe": f"<{link}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"} if marketing else {}
    return r


def _deliver(user: dict, r: dict, kind: str, marketing: bool) -> None:
    from . import mail as mailmod

    mailmod.send_mail(user["email"], kind, r, from_=env().mail.updates, headers=r.get("headers"))
    now = time.time() * 1000
    if marketing:
        get_store().update("users", user["id"], lambda c: {**c, "lastMarketing": now, "lastMarketingKind": kind} if c else c)


# ---------------------------------------------------------------- tracking endpoints

def record_open(tok: str) -> None:
    now = time.time() * 1000
    get_store().update("mail_track", tok.removesuffix(".gif"), lambda c: {**c, "opens": c["opens"] + 1, "firstOpen": c.get("firstOpen") or now, "lastOpen": now} if c else c)


def record_click(tok: str, n: str) -> str | None:
    now = time.time() * 1000
    rec = get_store().update("mail_track", tok, lambda c: {**c, "clicks": c["clicks"] + 1, "firstClick": c.get("firstClick") or now} if c else c)
    return (rec or {}).get("links", {}).get(n)


# ---------------------------------------------------------------- announcements from the owner

def _plan(u: dict) -> str:
    from . import auth as authmod

    return authmod.effective_plan(u)


def _segment(seg: str) -> list[dict]:
    users = get_store().find("users", limit=20000)
    out = []
    for u in users:
        if not wants_marketing(u):
            continue
        paid = _plan(u) != "prototype"
        if seg == "all" or (seg == "paid" and paid) or (seg == "free" and not paid):
            out.append(u)
    return out


def send_campaign(admin: dict, subject: str, headline: str, body: str, cta: dict | None, hero: str, segment: str, test: bool) -> dict:
    """Sends an announcement. `test` sends only to the administrator so the owner can see it first."""
    if cta:
        _safe_url(cta["url"])  # refuse an off-site link before anything is sent
    st = get_store()
    paras = [esc(p.strip()).replace("\n", "<br>") for p in body.split("\n\n") if p.strip()]
    if not paras:
        raise ApiError(422, "invalid_input", "Write the message first.")
    cid = f"cm_{uuid()[:10]}"
    now = time.time() * 1000
    if test:
        targets, skipped = [admin], 0
    else:
        pool = _segment(segment)
        # never more than one product email every three days to the same person
        targets = [u for u in pool if now - (u.get("lastMarketing") or 0) >= 3 * DAY][:2000]
        skipped = len(pool) - len(targets)
    st.put("campaigns", cid, {"id": cid, "subject": subject, "headline": headline, "segment": "test" if test else segment, "hero": hero, "created": now, "by": admin["id"], "queued": len(targets)})
    for u in targets:
        r = build(u, cid, f"mkt-{cid}", subject, headline, paras, cta, hero, True)
        _deliver(u, r, f"mkt-{cid}", not test)
    return {"id": cid, "queued": len(targets), "skippedRecently": skipped}


def stats() -> dict:
    st = get_store()
    rows = st.find("mail_track", limit=50000)
    agg: dict[str, dict] = {}
    for r in rows:
        a = agg.setdefault(r["campaign"], {"sent": 0, "opened": 0, "clicked": 0})
        a["sent"] += 1
        a["opened"] += 1 if r["opens"] else 0
        a["clicked"] += 1 if r["clicks"] else 0
    camps = st.find("campaigns", order_by="created", desc=True, limit=50)
    out = [{**c, **agg.pop(c["id"], {"sent": 0, "opened": 0, "clicked": 0})} for c in camps]
    life = [{"campaign": k, **v} for k, v in agg.items()]
    unsub = sum(1 for u in st.find("users", limit=20000) if (u.get("mailPrefs") or {}).get("marketing") is False)
    return {"campaigns": out, "lifecycle": life, "unsubscribed": unsub}


# ---------------------------------------------------------------- lifecycle (called from the cron tick)

def _prices() -> tuple[int, int]:
    p = env().price
    return p.learner_month, p.learner_year


def _auto_renews(u: dict) -> bool:
    s = u.get("subscription") or {}
    return s.get("status") in ("authenticated", "active", "pending") and not s.get("cancelAtPeriodEnd")


def lifecycle(t0: float, limit: int = 60) -> dict:
    st = get_store()
    m, y = _prices()
    sent = {"renewal": 0, "expired": 0, "upgrade": 0}
    save = f" (that is {round((m * 12 - y) / (m * 12) * 100)}% off)" if m and y and y < m * 12 else ""
    # 1. a week before the plan ends (the 3-day and 1-day notices are sent by the tick's own reminder)
    for u in st.find("users", since=("planUntil", t0 + 3 * DAY), until=("planUntil", t0 + 7 * DAY), limit=limit):
        if u.get("renewNoticeFor") == u.get("planUntil") or _auto_renews(u) or _plan(u) == "prototype":
            continue
        st.update("users", u["id"], lambda c: {**c, "renewNoticeFor": c.get("planUntil")} if c else c)
        r = build(u, "lifecycle:renewal", "renewal", f"Your Beta plan ends on {date(u['planUntil'])}", f"{u['name'].split()[0]}, your Beta plan ends soon",
                  [f"Your Beta plan runs until <b>{esc(date(u['planUntil']))}</b>. After that your account goes back to Free: one 3D classroom session a month, and ads.",
                   f"Renew any time before then to keep unlimited 3D classroom lessons and no ads. It is Rs. {m} a month, or Rs. {y} for a year{save}." if m else "Renew any time before then to keep unlimited 3D classroom lessons and no ads.",
                   "Everything you have made stays in your account either way."],
                  {"label": "Renew Beta", "url": "/pricing"}, "renewal", marketing=False)
        _deliver(u, r, "renewal", False)
        sent["renewal"] += 1
    # 2. just ended: one friendly note, no pressure
    for u in st.find("users", since=("planUntil", t0 - 3 * DAY), until=("planUntil", t0), limit=limit):
        if u.get("expiredNoticeFor") == u.get("planUntil") or _auto_renews(u) or not wants_marketing(u):
            continue
        st.update("users", u["id"], lambda c: {**c, "expiredNoticeFor": c.get("planUntil")} if c else c)
        r = build(u, "lifecycle:expired", "expired", "Your Beta plan has ended", f"{u['name'].split()[0]}, your Beta plan has ended",
                  ["Your account is on Free now. All your courses, lessons and progress are still here.",
                   "If you would like the 3D classroom without limits and no ads again, you can restart Beta whenever you like."],
                  {"label": "See Beta", "url": "/pricing"}, "expired")
        _deliver(u, r, "expired", True)
        sent["expired"] += 1
    # 3. engaged Free learners: at most once every two weeks
    n = 0
    for u in st.find("users", where={"plan": "prototype"}, order_by="lastLogin", desc=True, limit=400):
        if n >= limit:
            break
        if not wants_marketing(u) or u.get("sessions", 0) < 3 or t0 - (u.get("created") or t0) < 3 * DAY:
            continue
        if t0 - (u.get("lastLogin") or 0) > 14 * DAY or t0 - (u.get("lastMarketing") or 0) < 14 * DAY:
            continue
        r = build(u, "lifecycle:upgrade", "upgrade", "Get more from WorkLab XC", f"{u['name'].split()[0]}, ready to go further?",
                  ["You have been studying regularly, so here is what Beta adds to your Free plan:",
                   "- Unlimited 3D classroom sessions (Free has one a month)<br>- No ads<br>- PDF and Word syllabi, and more lessons and exams every day",
                   f"Beta is Rs. {m} a month, or Rs. {y} a year{save}. If Free is all you need, ignore this: nothing changes." if m else "If Free is all you need, ignore this: nothing changes."],
                  {"label": "See what Beta includes", "url": "/pricing"}, "upgrade")
        _deliver(u, r, "upgrade", True)
        sent["upgrade"] += 1
        n += 1
    return sent
