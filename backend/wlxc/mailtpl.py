"""Email templates. One simple, accessible layout for every message; all dynamic text is escaped."""
from __future__ import annotations

import html as _html
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from .config import env

BRAND = "#2F7BFF"
IST = timezone(timedelta(hours=5, minutes=30))


def esc(s) -> str:
    return _html.escape("" if s is None else str(s), quote=True).replace("&#x27;", "&#39;")


def _strip(p: str) -> str:
    p = re.sub(r"<[^>]+>", "", p)
    return p.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&#39;", "'")


def layout(title: str, preheader: str, paragraphs: list[str], button: dict | None = None, foot: str | None = None) -> dict:
    e = env()
    btn = ""
    if button:
        btn = (
            f'<p style="margin:28px 0"><a href="{esc(button["url"])}" style="background:{BRAND};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">{esc(button["label"])}</a></p>'
            f'<p style="font-size:13px;color:#6b7280">If the button does not work, copy this link into your browser:<br><a href="{esc(button["url"])}" style="color:{BRAND};word-break:break-all">{esc(button["url"])}</a></p>'
        )
    paras = "".join(f'<p style="font-size:16px;line-height:1.55;margin:0 0 14px">{p}</p>' for p in paragraphs)
    foot_t = foot or "You are getting this because of activity on your WorkLab XC account."
    html = (
        f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>{esc(title)}</title></head>'
        f'<body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827"><span style="display:none;max-height:0;overflow:hidden">{esc(preheader)}</span>'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px"><tr><td>'
        f'<p style="margin:0 0 20px;font-weight:700;font-size:18px;color:{BRAND}">WorkLab XC</p><h1 style="font-size:22px;margin:0 0 16px">{esc(title)}</h1>{paras}{btn}'
        f'<hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 16px"><p style="font-size:12px;color:#6b7280;margin:0">{esc(foot_t)} Questions? Write to <a href="mailto:{esc(e.mail.support)}" style="color:#6b7280">{esc(e.mail.support)}</a>. · {esc(e.mail.domain)}</p>'
        f"</td></tr></table></td></tr></table></body></html>"
    )
    text = "\n".join(
        [title, "", *[_strip(p) for p in paragraphs], *(["", f'{button["label"]}: {button["url"]}'] if button else []), "", f"Questions? {e.mail.support}", e.mail.domain]
    )
    return {"html": html, "text": text}


HERO_FOR = {"verify": "welcome", "reset": "security", "pwchanged": "security", "receipt": "receipt", "expiring": "renewal", "ticket-received": "support",
            "job-done": "update", "feedback-thanks": "support", "support-reply": "support", "session-confirmed": "session", "session-reminder": "session"}


def with_hero(html: str, name: str) -> str:
    """Puts the header picture for this kind of email at the top (skipped if the message already has one)."""
    if not name or "/mail/" in html:
        return html
    img = (f'<img src="{esc(env().app_url.rstrip("/"))}/mail/{esc(name)}.png" width="496" alt="" '
           f'style="display:block;width:100%;max-width:496px;height:auto;border:0;border-radius:10px;margin:0 0 20px">')
    return html.replace('<h1 style=', img + '<h1 style=', 1)


def _link(path: str) -> str:
    return f"{env().app_url}{path}"


def inr(paise: int) -> str:
    rupees = paise / 100
    s = f"{rupees:,.2f}" if paise % 100 else f"{int(rupees):,}"
    return "₹" + s


def money(minor, currency="INR"):
    return inr(minor) if currency == "INR" else f"${minor / 100:,.2f}"


def date(ms: float) -> str:
    d = datetime.fromtimestamp(ms / 1000, IST)
    return f"{d.day} {d.strftime('%B %Y')}"


def _r(subject: str, **kw) -> dict:
    return {"subject": subject, **layout(**kw)}


class T:
    @staticmethod
    def verify(name, token):
        return _r("Confirm your email for WorkLab XC", title=f"Welcome, {name}", preheader="Confirm your email to finish setting up.",
                  paragraphs=["Thanks for joining WorkLab XC. Please confirm this is your email address.", "The link works for 24 hours."],
                  button={"label": "Confirm my email", "url": _link(f"/verify-email?token={quote(token, safe='')}")})

    @staticmethod
    def reset(name, token):
        return _r("Reset your WorkLab XC password", title="Reset your password", preheader="Use this link within one hour.",
                  paragraphs=[f"Hi {esc(name)}, we got a request to reset your password.",
                              "The link works for one hour and can be used once. If you did not ask for this, ignore this email; your password stays the same."],
                  button={"label": "Choose a new password", "url": _link(f"/reset-password?token={quote(token, safe='')}")})

    @staticmethod
    def password_changed(name):
        return _r("Your WorkLab XC password was changed", title="Password changed", preheader="You were signed out everywhere else.",
                  paragraphs=[f"Hi {esc(name)}, your password was just changed and you were signed out on other devices.",
                              f"If this was not you, reset your password straight away and write to us at {esc(env().mail.support)}."])

    @staticmethod
    def receipt(name, plan, billing, amount_paise, order_id, until, currency="INR"):
        return _r(f"Payment received: WorkLab XC {plan}", title="Thank you, your plan is active", preheader=f"{money(amount_paise, currency)} received.",
                  paragraphs=[f"Hi {esc(name)}, we received {esc(money(amount_paise, currency))} for the {esc(plan)} plan ({'yearly' if billing == 'year' else 'monthly'}).",
                              f"It is active until <strong>{esc(date(until))}</strong>.",
                              f"Reference: {esc(order_id)}. Keep this email as your receipt."],
                  button={"label": "Open Studio", "url": _link("/app/studio")})

    @staticmethod
    def addon_receipt(name, item, amount_paise, order_id, currency="INR"):
        return _r(f"Receipt: {item[:60]}", title="Thank you, your add-on is active", preheader=f"{money(amount_paise, currency)} received.",
                  paragraphs=[f"Hi {esc(name)}, we received {esc(money(amount_paise, currency))} for <strong>{esc(item)}</strong>.",
                              f"Reference: {esc(order_id)}. Keep this email as your receipt."],
                  button={"label": "Open WorkLab XC", "url": _link("/app")})

    @staticmethod
    def job_done(name, course, topics, job_id):
        return _r(f"Your deck is ready: {course[:60]}", title="Your slides and notes are ready", preheader=f"{topics} topics finished.",
                  paragraphs=[f"Hi {esc(name)}, we finished {topics} topic{'' if topics == 1 else 's'} of <strong>{esc(course)}</strong>.",
                              "Download the PowerPoint, the notes or the course file from Studio. AI-written material can contain mistakes, so check key facts against your course."],
                  button={"label": "Download", "url": _link(f"/app/studio?job={quote(job_id, safe='')}")})

    @staticmethod
    def job_failed(name, course, job_id):
        return _r(f"We could not finish: {course[:60]}", title="That run did not finish", preheader="It was not counted against your limit.",
                  paragraphs=[f"Hi {esc(name)}, our AI services were too busy to write <strong>{esc(course)}</strong> just now.",
                              "The run was not counted against your daily limit. Please try again in a few minutes."],
                  button={"label": "Try again", "url": _link(f"/app/studio?job={quote(job_id, safe='')}")})

    @staticmethod
    def expiring(name, plan, until):
        return _r("Your WorkLab XC plan ends soon", title="Your plan ends in a few days", preheader=f"Active until {date(until)}.",
                  paragraphs=[f"Hi {esc(name)}, your {esc(plan)} plan is active until <strong>{esc(date(until))}</strong>.",
                              "Renew before then to keep AI illustrations, longer runs and watermark-free exports. After that your account moves to the free plan; nothing is deleted."],
                  button={"label": "Renew", "url": _link("/pricing")}, foot="You are getting this reminder because your paid plan is about to end.")

    @staticmethod
    def ticket_received(id, whatsapp):
        return _r(f"We got your message ({id})", title="We are on it", preheader=f"Your reference is {id}.",
                  paragraphs=[f"Thanks for writing in. Your reference is <strong>{esc(id)}</strong>. We reply within one working day.",
                              *([f'In a hurry? <a href="{esc(whatsapp)}">Continue on WhatsApp</a>.'] if whatsapp else [])])

    @staticmethod
    def ticket_to_team(id, from_, message, job_id):
        return _r(f"[ticket {id}] {message[:60]}", title=f"New ticket {id}", preheader=message[:80],
                  paragraphs=[f"From: {esc(from_)}", esc(message).replace("\n", "<br>"), *([f"Run: {esc(job_id)}"] if job_id else [])])

    @staticmethod
    def feedback_thanks(name, rating):
        return _r("Thanks for your feedback", title="Thank you", preheader="We read every message.",
                  paragraphs=[f"Hi {esc(name)}, thanks for telling us how it went ({rating}/5).",
                              "We are sorry it was not better. Someone from the team will look at what you wrote and may reply." if rating <= 2
                              else "We read every message and use it to decide what to build next."])

    @staticmethod
    def feedback_to_team(from_, rating, comment, tags, page):
        return _r(f"[feedback {rating}/5] {comment[:50] or 'no comment'}", title=f"Feedback {rating}/5", preheader=comment[:80],
                  paragraphs=[f"From: {esc(from_)}", esc(comment or "(no comment)").replace("\n", "<br>"),
                              f"Tags: {esc(', '.join(tags) or 'none')}{' · Page: ' + esc(page) if page else ''}"])

    @staticmethod
    def account_deleted(name):
        return _r("Your WorkLab XC account was deleted", title="Account deleted", preheader="Your data was removed.",
                  paragraphs=[f"Hi {esc(name)}, as you asked, we deleted your account, courses, runs and files.",
                              "Payment records are kept for the period the law requires. If this was not you, write to us right away."])
