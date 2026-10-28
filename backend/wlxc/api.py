"""Every HTTP endpoint. Same URLs, cookies and JSON shapes as the original API, so the website works unchanged.
Handlers take a Ctx and return a dict (sent as JSON) or an Out. `ROUTES` lists (method, path, handler)."""
from __future__ import annotations

import json
import re
import time
from urllib.parse import quote

from . import paypal as paypalmod
from . import (activity, exams, netquality, community, invoices, antifraud, abuse, accounts, addons, adminusers, auth as authmod, billing, bg, courses, image, integrations as integ, ipintel, jobs, learn,
               fair, backdrops, canvas as canvasmod, example, extract, rewards, study, chat as chatmod, campaigns, library, llm, mail as mailmod, maintenance, profile as profmod, adminreports, admindb, devtools, receipts, referral, geo, pricing, sessions, social, store as storemod, styles as stylesmod, support, usage)
from . import byok
from . import googleauth
from .config import env, integrations
from .crypto import safe_equal, sha256, uuid
from .errors import ApiError, forbidden, not_found
from .mailtpl import T
from .plans import LIMITS, server_plans
from .validate import EMAIL, any_, array, boolean, enum, number, obj, optional, string
from .web import Ctx, Out, Req, json_out, log, rate_limit, route, safe_id

ROUTES: list[tuple[str, str, object]] = []


def add(method: str, path: str, handler, **opts):
    ROUTES.append((method, path, route(handler, **opts)))


def _admin(ctx: Ctx) -> dict:
    if not authmod.is_admin(ctx.user):
        raise forbidden()
    return ctx.user


def _fair(handler):
    """Give each account its own share of the server: only its plan's number of heavy requests run at once for it."""
    def wrapped(ctx: Ctx):
        if not ctx.user:
            return handler(ctx)
        with fair.slot(ctx.user["id"], LIMITS[authmod.effective_plan(ctx.user)]["concurrent"]):
            return handler(ctx)
    return wrapped


def _file(ctx: Ctx, key: str = "file"):
    return ctx.req.files.get(key)


def _is_multipart(ctx: Ctx) -> bool:
    return "multipart/form-data" in (ctx.req.header("content-type") or "")


def _ctype(data: bytes, mime: str, extra: dict | None = None) -> Out:
    return Out(200, data, {"content-type": mime, "cache-control": "private, no-store", "x-content-type-options": "nosniff", **(extra or {})})


# ---------------------------------------------------------------- auth

def _captcha(token, ip):
    if not integ.verify_turnstile(token, ip):
        raise ApiError(400, "captcha_failed", "Could not verify you are human. Refresh and try again.")


def _session_out(user: dict, status: int = 200, req: Req | None = None) -> Out:
    token, expires = authmod.create_session(user["id"])
    cookie = authmod.set_cookie(token, expires)
    if req is not None:
        did, dcookie = antifraud.new_device_cookie(req)
        cookie += "\n" + dcookie
        antifraud.record_device(req, user["id"], did)
    return json_out(authmod.public_user(user), status, {"set-cookie": cookie, "cache-control": "no-store"})


_REGISTER = obj(name=string(min=1, max=80), email=string(max=200, lower=True, pattern=EMAIL), password=string(min=8, max=200, trim=False),
                consent=optional(boolean()), turnstileToken=optional(string(max=4000)),
                age=optional(number(int_=True, min=5, max=100)), education=optional(string(max=20)), category=optional(string(max=40)), country=optional(string(max=2)),
                label=optional(string(max=60)), institute=optional(string(max=120)), ref=optional(string(max=16)),
                username=optional(string(max=24, lower=True)), goal=optional(string(max=20)), dailyGoal=optional(number(int_=True, min=10, max=200)))


def register(ctx: Ctx):
    antifraud.gate(ctx.req, None, "auth")
    if ctx.ip != "unknown":
        rate_limit(f"signup-day:{sha256(ctx.ip)}", env().abuse.signups_per_ip_day, 86_400)
    b = ctx.json(_REGISTER)
    _captcha(b["turnstileToken"], ctx.ip)
    if env().abuse.require_consent and b["consent"] is not True:
        raise ApiError(400, "consent_required", "Please accept the Terms and Privacy Policy to create an account.")
    if env().abuse.require_profile:
        missing = [k for k, ok in (("age", b["age"]), ("education", b["education"]), ("category", b["category"]),
                                   ("label", len((b["label"] or "").strip()) >= 2), ("institute", len((b["institute"] or "").strip()) >= 2)) if not ok]
        if missing:
            raise ApiError(422, "profile_required", "Please fill in every detail to create your account.", {"fields": missing})
    if env().abuse.require_username and not b["username"]:
        raise ApiError(422, "profile_required", "Choose a username to create your account.", {"fields": ["username"]})
    if b["username"]:
        bad = profmod.username_problem(b["username"])
        if bad:
            raise ApiError(422, "bad_username", bad, {"fields": ["username"]})
        if not profmod.username_free(b["username"]):
            raise ApiError(409, "username_taken", "That username is taken. Try another.", {"fields": ["username"]})
    antifraud.assert_real_email(b["email"])
    antifraud.check_device_before_signup(ctx.req)
    user = authmod.register(b["name"], b["email"], b["password"], {"at": time.time() * 1000, "version": profmod.CONSENT_VERSION} if b["consent"] else None)
    if b["age"] or b["category"] or b["label"] or b["institute"]:
        profmod.update_profile(user, {k: b[k] for k in ("age", "education", "category", "country", "label", "institute") if b[k]})
        user = storemod.get_store().get("users", user["id"]) or user
    if b["username"] or b["goal"] or b["dailyGoal"]:
        try:
            profmod.update_profile(user, {k: v for k, v in (("handle", b["username"]), ("goal", b["goal"]), ("dailyGoal", b["dailyGoal"])) if v})
        except ApiError:
            # someone took the name in the moment between the check and now: undo the account so the person can try again
            st = storemod.get_store()
            for col, key in (("users", user["id"]), ("emails", user["email"])):
                st.delete(col, key)
            st.delete("email_canon", antifraud.canonical_email(user["email"]))
            raise
        user = storemod.get_store().get("users", user["id"]) or user
    referral.attach(user["id"], b.get("ref"))
    out = _session_out(user, 201, ctx.req)
    accounts.send_verification(user)
    bg.detach(lambda: integ.emit("user.registered", {"userId": user["id"], "email": user["email"], "name": user["name"]}))
    return out


_GOOGLE = obj(credential=string(min=20, max=4000), consent=optional(boolean()),
              age=optional(number(int_=True, min=5, max=100)), education=optional(string(max=20)), category=optional(string(max=40)), country=optional(string(max=2)),
              label=optional(string(max=60)), institute=optional(string(max=120)))


def google_auth(ctx: Ctx):
    """Sign in or create an account with Google. A new account still needs the same details as email sign-up, so the first call for
    someone new answers `needsProfile` and creates nothing; the second call carries the details."""
    antifraud.gate(ctx.req, None, "auth")
    b = ctx.json(_GOOGLE)
    g = googleauth.verify(b["credential"])
    st = storemod.get_store()
    idx = st.get("emails", g["email"])
    if idx:
        user = st.get("users", idx["uid"])
        now = time.time() * 1000
        st.update("users", user["id"], lambda c: {**c, "lastLogin": now, "emailVerified": True, "googleSub": g["sub"]} if c else c)
        return _session_out({**user, "lastLogin": now, "emailVerified": True}, 200, ctx.req)
    if env().abuse.require_consent and b["consent"] is not True:
        return json_out({"needsProfile": True, "name": g["name"], "email": g["email"]}, 200)
    if env().abuse.require_profile:
        missing = [k for k, ok in (("age", b["age"]), ("education", b["education"]), ("category", b["category"]),
                                   ("label", len((b["label"] or "").strip()) >= 2), ("institute", len((b["institute"] or "").strip()) >= 2)) if not ok]
        if missing:
            return json_out({"needsProfile": True, "name": g["name"], "email": g["email"], "fields": missing}, 200)
    if ctx.ip != "unknown":
        rate_limit(f"signup-day:{sha256(ctx.ip)}", env().abuse.signups_per_ip_day, 86_400)
    antifraud.assert_real_email(g["email"])
    antifraud.check_device_before_signup(ctx.req)
    user = authmod.register(g["name"], g["email"], uuid() + uuid(), {"at": time.time() * 1000, "version": profmod.CONSENT_VERSION} if b["consent"] else None)
    st.update("users", user["id"], lambda c: {**c, "emailVerified": True, "googleSub": g["sub"], "googlePicture": g["picture"]} if c else c)
    profmod.update_profile(user, {k: b[k] for k in ("age", "education", "category", "country", "label", "institute") if b[k]})
    user = st.get("users", user["id"]) or user
    bg.detach(lambda: integ.emit("user.registered", {"userId": user["id"], "email": user["email"], "name": user["name"], "via": "google"}))
    return _session_out(user, 201, ctx.req)


add("POST", "/api/auth/google", google_auth, auth="none", rate={"name": "google-auth", "limit": 20, "windowSec": 900})
add("POST", "/api/auth/register", register, auth="none", rate={"name": "register", "limit": 10, "windowSec": 3600})

_LOGIN = obj(email=string(min=3, max=200, lower=True), password=string(min=1, max=200, trim=False), turnstileToken=optional(string(max=4000)))


def login(ctx: Ctx):
    antifraud.gate(ctx.req, None, "auth")
    b = ctx.json(_LOGIN)
    ident = b["email"]
    if "@" not in ident:  # a username: find the account it belongs to; the answer to a wrong one is the same as for a wrong password
        hit = storemod.get_store().get("handles", ident)
        owner = storemod.get_store().get("users", hit["uid"]) if hit else None
        b = {**b, "email": owner["email"] if owner else "nobody@invalid.example"}
    # Per-account limit as well as per-IP, so one account cannot be guessed at from many addresses.
    rate_limit(f"login-acct:{b['email']}", 10, 900)
    _captcha(b["turnstileToken"], ctx.ip)
    return _session_out(authmod.login(b["email"], b["password"]), 200, ctx.req)


def username_check(ctx: Ctx):
    n = (ctx.req.query.get("u") or "").strip().lower()
    bad = profmod.username_problem(n)
    return {"valid": not bad, "reason": bad, "available": (not bad) and profmod.username_free(n)}


add("GET", "/api/auth/username", username_check, auth="none", rate={"name": "username-check", "limit": 60, "windowSec": 300})
add("POST", "/api/auth/login", login, auth="none", rate={"name": "login", "limit": 20, "windowSec": 900})


def logout(ctx: Ctx):
    authmod.destroy_session(authmod.read_cookie(ctx.req))
    return json_out({"ok": True}, 200, {"set-cookie": authmod.clear_cookie()})


add("POST", "/api/auth/logout", logout, auth="none")

_FORGOT = obj(email=string(max=200, lower=True, pattern=EMAIL), turnstileToken=optional(string(max=4000)))


def forgot(ctx: Ctx):
    b = ctx.json(_FORGOT)
    rate_limit(f"forgot-acct:{b['email']}", 3, 3600)
    _captcha(b["turnstileToken"], ctx.ip)
    accounts.request_password_reset(b["email"])
    return {"ok": True, "message": "If that address has an account, a reset link is on its way."}


add("POST", "/api/auth/forgot-password", forgot, auth="none", rate={"name": "forgot", "limit": 10, "windowSec": 3600})

_RESET = obj(token=string(min=20, max=200), password=string(min=8, max=200, trim=False))


def reset(ctx: Ctx):
    b = ctx.json(_RESET)
    accounts.reset_password(b["token"], b["password"])
    return {"ok": True}


add("POST", "/api/auth/reset-password", reset, auth="none", rate={"name": "reset", "limit": 10, "windowSec": 3600})

_CHPW = obj(current=string(min=1, max=200, trim=False), password=string(min=8, max=200, trim=False))


def change_password(ctx: Ctx):
    b = ctx.json(_CHPW)
    accounts.change_password(ctx.user, b["current"], b["password"], authmod.session_id_from_request(ctx.req))
    return {"ok": True}


add("POST", "/api/auth/change-password", change_password, auth="user", rate={"name": "chpw", "limit": 10, "windowSec": 3600, "by": "user"})


def verify_email(ctx: Ctx):
    u = accounts.verify_email(ctx.json(obj(token=string(min=20, max=200)))["token"])
    return {"ok": True, "email": u["email"]}


add("POST", "/api/auth/verify-email", verify_email, auth="none", rate={"name": "verify", "limit": 20, "windowSec": 3600})


def resend(ctx: Ctx):
    accounts.send_verification(ctx.user)
    return {"ok": True, "alreadyVerified": bool(ctx.user.get("emailVerified"))}


add("POST", "/api/auth/resend-verification", resend, auth="user", rate={"name": "resend-verify", "limit": 3, "windowSec": 3600, "by": "user"})


# ---------------------------------------------------------------- me, profile

def me_get(ctx: Ctx):
    u = ctx.user
    try:
        geo.record(u, ctx.req)
    except Exception:  # noqa: BLE001  - where someone is must never stop their account loading
        pass
    plan = authmod.effective_plan(u)
    lim = LIMITS[plan]
    if lim["ads"] and addons.has(u["id"], "noads"):
        lim = {**lim, "ads": False}  # the Ad-free add-on
    today = {"sessions": [usage.used(u["id"], "sessions"), lim["sessionsPerDay"]], "lessons": [usage.used(u["id"], "gen"), lim["genPerDay"]],
             "exams": [usage.used(u["id"], "exam"), lim["examsPerDay"]], "chat": [usage.used(u["id"], "chat"), env().addons.chat_per_day]}
    month = {"classroom": [len(usage.classroom_month(u["id"])), lim["classroomPerMonth"]]} if lim["classroomPerMonth"] else {}
    month["chat"] = [usage.month_used(u["id"], "freechat"), env().addons.free_chat_per_month]
    month["notes"] = [usage.month_used(u["id"], "freenotes"), env().addons.free_notes_per_month]
    return {"user": {**authmod.public_user(u), "dev": devtools.is_dev(u), "username": profmod.profile_of(u)["handle"]}, "limits": lim, "today": today, "month": month, "usage": {"jobs": usage.used(u["id"], "jobs"), "images": usage.used(u["id"], "images")},
            "feedbackRequired": u.get("unrated", 0) > env().feedback_grace_sessions, "lastSession": u.get("lastSession"),
            "supportWhatsapp": None, "mailPrefs": {"marketing": (u.get("mailPrefs") or {}).get("marketing", True) is not False},
            "privacy": {"shareContent": (u.get("privacy") or {}).get("shareContent", True) is not False}}


add("GET", "/api/me", me_get, auth="user", allow_blocked=True)


def me_delete(ctx: Ctx):
    accounts.delete_account(ctx.user, ctx.json(obj(password=string(min=1, max=200, trim=False)))["password"])
    return json_out({"ok": True}, 200, {"set-cookie": authmod.clear_cookie()})


add("DELETE", "/api/me", me_delete, auth="user", rate={"name": "delete", "limit": 5, "windowSec": 3600, "by": "user"})


def me_export(ctx: Ctx):
    return Out(200, json.dumps(accounts.export_data(ctx.user), indent=2).encode(),
               {"content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="worklab-xc-my-data.json"', "cache-control": "private, no-store"})


add("GET", "/api/me/export", me_export, auth="user", allow_blocked=True, rate={"name": "export", "limit": 5, "windowSec": 3600, "by": "user"})


def profile_get(ctx: Ctx):
    return {"profile": profmod.profile_of(ctx.user), "consent": ctx.user.get("consent")}


add("GET", "/api/profile", profile_get, auth="user", allow_blocked=True)


def profile_put(ctx: Ctx):
    b = ctx.json(any_())
    if not isinstance(b, dict):
        return json_out({"error": "bad_request", "message": "Send an object."}, 400)
    return {"profile": profmod.update_profile(ctx.user, b)}


add("PUT", "/api/profile", profile_put, auth="user", max_body=160 * 1024, rate={"name": "profile", "limit": 30, "windowSec": 3600, "by": "user"})
add("GET", "/api/institutes", lambda ctx: {"institutes": profmod.suggest_institutes(ctx.req.query.get("q", ""))}, auth="user",
    rate={"name": "institutes", "limit": 120, "windowSec": 600, "by": "user"})


def _rate_user(name, limit, window=3600):
    return {"name": name, "limit": limit, "windowSec": window, "by": "user"}


# ---------------------------------------------------------------- phone verification
_PHONE = obj(phone=string(min=7, max=30))
_CODE = obj(code=string(min=4, max=8, pattern=r"^\d{4,8}$"))
add("POST", "/api/phone/start", lambda ctx: antifraud.start_phone(ctx.user, ctx.json(_PHONE)["phone"]), auth="user", rate=_rate_user("phone-start", 10, 3600))
add("POST", "/api/phone/verify", lambda ctx: antifraud.verify_phone(ctx.user, ctx.json(_CODE)["code"]), auth="user", rate=_rate_user("phone-verify", 30, 3600))
add("GET", "/api/phone/status", lambda ctx: {"enabled": antifraud.sms_enabled() and env().fraud.phone_mode in ("generation", "signup"), "verified": bool(ctx.user.get("phoneVerified")),
                                            "required": antifraud.phone_required_for(ctx.user), "mask": ctx.user.get("phoneMask")}, auth="user")


# ---------------------------------------------------------------- subscription, billing details, invoices
add("GET", "/api/subscription", lambda ctx: {"subscription": billing.subscription_of(ctx.user)}, auth="user")
add("POST", "/api/subscription/cancel", lambda ctx: billing.cancel_subscription(ctx.user), auth="user", rate=_rate_user("sub-cancel", 5, 3600))
_BILLTO = obj(name=string(max=120), gstin=optional(string(max=15)), stateCode=optional(string(max=2)), address=optional(string(max=300)))
add("GET", "/api/billing/details", lambda ctx: {"details": invoices.buyer_details(ctx.user), "states": invoices.STATE_NAMES}, auth="user")
add("PUT", "/api/billing/details", lambda ctx: (lambda b: {"details": invoices.save_billing_details(ctx.user, b["name"], b["gstin"] or "", b["stateCode"] or "", b["address"] or "")})(ctx.json(_BILLTO)),
    auth="user", rate=_rate_user("bill-details", 20, 3600))
add("GET", "/api/invoices", lambda ctx: {"invoices": invoices.list_for(ctx.user)}, auth="user")


def invoice_get(ctx: Ctx):
    inv = invoices.get_for(ctx.user, safe_id(ctx.params["id"]))
    fmt = ctx.req.query.get("format", "json")
    name = inv["number"].replace("/", "-")
    if fmt == "pdf":
        try:
            return Out(200, invoices.render_pdf(inv), {"content-type": "application/pdf", "content-disposition": f'attachment; filename="{name}.pdf"', "cache-control": "private, no-store"})
        except ImportError:
            fmt = "html"
    if fmt == "html":
        return Out(200, invoices.render_html(inv).encode(), {"content-type": "text/html; charset=utf-8", "cache-control": "private, no-store",
                                                              "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'"})
    return {"invoice": inv}


add("GET", "/api/invoices/{id}", invoice_get, auth="user")


# ---------------------------------------------------------------- sessions, feedback, support, leads

_SESSION = obj(courseId=optional(string(max=100)), topicId=optional(string(max=100)))


def sessions_post(ctx: Ctx):
    antifraud.gate(ctx.req, ctx.user)
    b = ctx.json(_SESSION)
    # a session is only worth spending when a lesson can actually be written, so check before it counts against the allowance
    if not llm.routes():
        raise ApiError(503, "ai_not_configured", "Lessons are written by AI, and no AI provider is set up on this server yet.")
    session = sessions.start_session(ctx.user, b["courseId"], b["topicId"])
    activity.bump(ctx.user["id"], sessions=1)
    return json_out({"session": session}, 201)


_ENTER = obj(courseId=string(max=100), topicId=string(max=100))


def classroom_enter(ctx: Ctx):
    """Free accounts may open the 3D classroom for a set number of topics each month; paid accounts are not limited."""
    lim = LIMITS[authmod.effective_plan(ctx.user)]
    b = ctx.json(_ENTER)
    if lim["classroom"]:
        return {"ok": True, "unlimited": True}
    cap = lim["classroomPerMonth"]
    if cap <= 0:
        raise ApiError(403, "classroom_not_in_plan", "The 3D classroom is part of Beta.")
    used = usage.classroom_enter(ctx.user["id"], f"{b['courseId']}:{b['topicId']}", cap)
    return {"ok": True, "used": used, "limit": cap}


add("POST", "/api/classroom/enter", classroom_enter, auth="user", rate={"name": "classroom-enter", "limit": 60, "windowSec": 600, "by": "user"})
add("POST", "/api/sessions", _fair(sessions_post), auth="user", rate={"name": "sessions", "limit": 60, "windowSec": 600, "by": "user"})

_FEEDBACK = obj(sessionId=optional(string(min=1, max=100)), page=optional(string(max=120)), rating=number(int_=True, min=1, max=5),
                comment=optional(string(max=2000)), tags=optional(array(string(max=20), max=6)))


def feedback_post(ctx: Ctx):
    b = ctx.json(_FEEDBACK)
    r = sessions.submit_feedback(ctx.user, b["rating"], b["sessionId"], b["comment"] or "", b["tags"], b["page"])
    return json_out({"ok": True, "duplicate": r["duplicate"], "whatsapp": r["whatsapp"]}, 200 if r["duplicate"] else 201)


add("GET", "/api/feedback", lambda ctx: {"feedback": sessions.my_feedback(ctx.user)}, auth="user")
add("POST", "/api/feedback", feedback_post, auth="user", rate={"name": "feedback", "limit": 30, "windowSec": 3600, "by": "user"})

_SUPPORT = obj(message=string(min=5, max=3000), contact=optional(string(max=120)), jobId=optional(string(max=80)))


def support_post(ctx: Ctx):
    b = ctx.json(_SUPPORT)
    r = support.create_ticket(ctx.user, b["message"], b["contact"], b["jobId"])
    return json_out({"ticketId": r["ticket"]["id"], "whatsapp": r["whatsapp"]}, 201)


# ---- support chat (the team is reached through WhatsApp, and nobody's number is shared)
_CHAT_MSG = obj(text=string(min=1, max=1000), topic=optional(string(max=60)))
_SESSION_REQ = obj(topic=string(max=80), wanted=number(), note=optional(string(max=400)))
add("GET", "/api/support/chat", lambda ctx: chatmod.mine(ctx.user["id"]), auth="user", allow_blocked=True)
add("POST", "/api/support/chat", lambda ctx: (lambda b: chatmod.user_message(ctx.user, b["text"], b["topic"] or ""))(ctx.json(_CHAT_MSG)), auth="user", allow_blocked=True,
    rate={"name": "support-chat", "limit": 30, "windowSec": 600, "by": "user"})
add("POST", "/api/support/chat/close", lambda ctx: chatmod.close_chat(ctx.user), auth="user", allow_blocked=True)
add("POST", "/api/support/session", lambda ctx: (lambda b: {"session": chatmod.request_session(ctx.user, b["topic"], float(b["wanted"]), b["note"] or "")})(ctx.json(_SESSION_REQ)),
    auth="user", rate={"name": "support-session", "limit": 6, "windowSec": 3600, "by": "user"})
add("POST", "/api/support/session/{id}/cancel", lambda ctx: {"session": chatmod.cancel_session(ctx.user, safe_id(ctx.params["id"]))}, auth="user")


def whatsapp_verify(ctx: Ctx):
    q = ctx.req.query
    tok = env().whatsapp.verify_token
    if tok and q.get("hub.mode") == "subscribe" and safe_equal(q.get("hub.verify_token", ""), tok):
        return Out(200, q.get("hub.challenge", "").encode(), {"content-type": "text/plain"})
    raise forbidden()


def whatsapp_inbound(ctx: Ctx):
    secret = env().whatsapp.app_secret
    body = ctx.req.body
    import hashlib, hmac as _hmac
    sig = (ctx.req.header("x-hub-signature-256") or "").removeprefix("sha256=")
    if not secret or not safe_equal(sig, _hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()):
        raise forbidden()
    try:
        data = json.loads(body.decode() or "{}")
    except ValueError:
        return {"ok": True}
    for entry in data.get("entry", []):
        for ch in entry.get("changes", []):
            for m in (ch.get("value") or {}).get("messages", []):
                if m.get("type") == "text":
                    ack = chatmod.handle_whatsapp(str(m.get("from", "")), (m.get("text") or {}).get("body", ""))
                    if ack:
                        integ.notify_ops(ack)
    return {"ok": True}


add("GET", "/api/webhooks/whatsapp", whatsapp_verify, auth="none", csrf=False)
add("POST", "/api/webhooks/whatsapp", whatsapp_inbound, auth="none", csrf=False, max_body=256 * 1024)

# ---- email tracking and unsubscribe (no sign-in: these are opened from an email)
add("GET", "/api/t/o/{tok}", lambda ctx: (campaigns.record_open(safe_id(ctx.params["tok"])), Out(200, campaigns.GIF, {"content-type": "image/gif", "cache-control": "no-store"}))[1], auth="none", csrf=False)


def _click(ctx: Ctx):
    url = campaigns.record_click(safe_id(ctx.params["tok"]), safe_id(ctx.params["n"]))
    return Out(302, b"", {"location": url or env().app_url, "cache-control": "no-store"})


add("GET", "/api/t/c/{tok}/{n}", _click, auth="none", csrf=False)


def _unsub(ctx: Ctx):
    ok = campaigns.unsubscribe(ctx.params["tok"])
    page = ("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Unsubscribe</title>"
            "<body style='font-family:system-ui;max-width:460px;margin:12vh auto;padding:0 16px;line-height:1.5'>"
            + ("<h1>You are unsubscribed</h1><p>You will not get product emails from WorkLab XC any more. You will still get important notices about your account. You can turn them back on in Settings.</p>"
               if ok else "<h1>That link did not work</h1><p>Sign in and turn product emails off in Settings instead.</p>") + "</body>")
    return Out(200 if ok else 400, page.encode(), {"content-type": "text/html; charset=utf-8", "cache-control": "no-store"})


add("GET", "/api/mail/unsubscribe/{tok}", _unsub, auth="none", csrf=False)
add("POST", "/api/mail/unsubscribe/{tok}", _unsub, auth="none", csrf=False)  # the one-click button in mail apps
add("POST", "/api/me/privacy", lambda ctx: (lambda b: (storemod.get_store().update("users", ctx.user["id"], lambda c: {**c, "privacy": {**(c.get("privacy") or {}), "shareContent": b["shareContent"]}} if c else c), {"ok": True})[1])(ctx.json(obj(shareContent=boolean()))), auth="user")
add("POST", "/api/me/mail-prefs", lambda ctx: (lambda b: (campaigns.set_marketing(ctx.user["id"], b["marketing"]), {"ok": True})[1])(ctx.json(obj(marketing=boolean()))), auth="user")

# ---- owner: campaigns and the support desk
_CAMPAIGN = obj(subject=string(min=3, max=150), headline=string(min=3, max=120), body=string(min=3, max=4000), ctaLabel=optional(string(max=40)), ctaUrl=optional(string(max=300)),
                hero=optional(enum(*campaigns.HEROES)), segment=enum("all", "free", "paid"), test=optional(boolean()))


def admin_campaign_send(ctx: Ctx):
    admin = _admin(ctx)
    b = ctx.json(_CAMPAIGN)
    cta = {"label": b["ctaLabel"], "url": b["ctaUrl"]} if b["ctaLabel"] and b["ctaUrl"] else None
    return campaigns.send_campaign(admin, b["subject"], b["headline"], b["body"], cta, b["hero"] or "update", b["segment"], b["test"] is not False)


add("POST", "/api/admin/campaigns", admin_campaign_send, auth="user", rate={"name": "campaign", "limit": 20, "windowSec": 3600, "by": "user"})
add("GET", "/api/admin/campaigns", lambda ctx: (_admin(ctx), campaigns.stats())[1], auth="user")
add("GET", "/api/admin/support", lambda ctx: (_admin(ctx), chatmod.team_overview())[1], auth="user")
add("GET", "/api/admin/support/chat/{id}", lambda ctx: (_admin(ctx), {"messages": chatmod.team_messages(safe_id(ctx.params["id"]))})[1], auth="user")
add("POST", "/api/admin/support/reply", lambda ctx: (_admin(ctx), (lambda b: chatmod.team_reply(b["code"], b["text"], "admin"))(ctx.json(obj(code=string(max=12), text=string(min=1, max=1000)))))[1], auth="user")
add("POST", "/api/admin/support/close", lambda ctx: (_admin(ctx), (lambda b: (chatmod.team_close(b["code"]), {"ok": True})[1])(ctx.json(obj(code=string(max=12)))))[1], auth="user")
add("POST", "/api/admin/support/session", lambda ctx: (_admin(ctx), (lambda b: {"session": chatmod.decide_session(b["code"], b["action"], b["at"], b["message"] or "")})(
    ctx.json(obj(code=string(max=12), action=enum("confirm", "decline", "done"), at=optional(number()), message=optional(string(max=300))))))[1], auth="user")

add("POST", "/api/support", support_post, auth="optional", allow_blocked=True, rate={"name": "support", "limit": 8, "windowSec": 3600})

_LEAD = obj(name=string(min=1, max=120), email=string(max=200, lower=True, pattern=EMAIL), role=optional(string(max=80)),
            message=optional(string(max=4000)), topic=optional(string(max=60)))


def leads_post(ctx: Ctx):
    b = ctx.json(_LEAD)
    id = f"l_{uuid()[:12]}"
    lead = {"id": id, **{k: v for k, v in b.items() if v is not None}, "created": time.time() * 1000}
    storemod.get_store().put("leads", id, lead)
    integ.emit("lead.created", lead)
    return json_out({"ok": True, "id": id}, 201)


add("POST", "/api/leads", leads_post, auth="none", rate={"name": "leads", "limit": 5, "windowSec": 3600})


# ---------------------------------------------------------------- plans, styles, health, checkout

def plans_get(ctx: Ctx):
    # the price depends on where the visitor is, so a shared cache must not keep one person's answer for another
    q = ctx.req.query
    country, via = geo.resolve(ctx.req, ctx.user, q.get("tz") or "", q.get("lang") or "")
    out = {**server_plans(country), "detectedBy": via, "signal": geo.signal(ctx.req, q.get("ct") or "")}
    return json_out(out, 200, {"cache-control": "private, max-age=60", "vary": "Cookie, x-wlxc-net"})


add("GET", "/api/plans", plans_get, auth="none")


def styles_get(ctx: Ctx):
    styles = [{"id": s["id"], "name": s["name"], "description": s["description"], "bg": f"#{s['bg']}", "ink": f"#{s['ink']}", "accent": f"#{s['accent']}"}
              for s in stylesmod.STYLES.values()]
    return json_out({"styles": [{"id": "auto", "name": "Match my instructions", "description": 'Reads words like "dark", "serif" or "orange" in your instructions.'}, *styles]},
                    200, {"cache-control": "public, max-age=3600"})


add("GET", "/api/styles", styles_get, auth="none")


def _trusted(ctx: Ctx) -> bool:
    secret = env().cron_secret
    a = ctx.req.header("authorization") or ""
    return bool(secret and a.startswith("Bearer ") and safe_equal(a[7:], secret))


def health(ctx: Ctx):
    db = False
    try:
        st = storemod.get_store()
        st.put("health", "ping", {"at": time.time() * 1000})
        db = st.get("health", "ping") is not None
    except Exception:  # noqa: BLE001
        db = False
    # Which services are switched on is operational detail: only callers with the cron secret get it.
    return json_out({"ok": db, "db": db, "integrations": dict(vars(integrations()))} if _trusted(ctx) else {"ok": db}, 200 if db else 503)


add("GET", "/api/health", health, auth="none")


def metrics_get(ctx: Ctx):
    if not _trusted(ctx):
        raise ApiError(401, "unauthenticated", "Not available.")
    from . import metrics
    return Out(200, metrics.render().encode(), {"content-type": "text/plain; version=0.0.4; charset=utf-8", "cache-control": "no-store"})


add("GET", "/api/metrics", metrics_get, auth="none", csrf=False)

_CHECKOUT = obj(plan=enum("prototype", "learner", "plus", "classroom"), billing=enum("month", "year"), autoRenew=optional(boolean()))


def checkout(ctx: Ctx):
    b = ctx.json(_CHECKOUT)
    if b["autoRenew"] is True:
        return billing.start_subscription(ctx.user, b["plan"], b["billing"], geo.country_for(ctx.req, ctx.user))
    return billing.start_checkout(ctx.user, b["plan"], b["billing"], geo.country_for(ctx.req, ctx.user))


add("POST", "/api/checkout", checkout, auth="user", rate={"name": "checkout", "limit": 10, "windowSec": 600, "by": "user"})


def addons_get(ctx: Ctx):
    return {"catalogue": [{"sku": s, "name": addons.SKU_INFO[s]["name"], "description": addons.SKU_INFO[s]["description"], **addons.pricing(s, geo.country_for(ctx.req, ctx.user))} for s in addons.SKUS],
            "currency": pricing.region(geo.country_for(ctx.req, ctx.user)),
            "free": {"chat": [usage.month_used(ctx.user["id"], "freechat"), env().addons.free_chat_per_month],
                     "notes": [usage.month_used(ctx.user["id"], "freenotes"), env().addons.free_notes_per_month]},
            "mine": addons.entitlements_of(ctx.user["id"])}


def purchases_get(ctx: Ctx):
    rows = storemod.get_store().find("purchases", where={"uid": ctx.user["id"]}, order_by="activatedAt", desc=True, limit=200)
    return {"purchases": [{k: r.get(k) for k in ("id", "paymentId", "kind", "item", "billing", "amountPaise", "currency", "country", "gateway", "renewal", "paidAt", "activatedAt", "activeUntil", "status")} for r in rows]}


def admin_purchases(ctx: Ctx):
    _admin(ctx)
    q = (ctx.req.query.get("q") or "").strip()
    st = storemod.get_store()
    rows = st.find("purchases", order_by="activatedAt", desc=True, limit=500)
    if q:
        rows = [r for r in rows if q in (r.get("paymentId") or "") or q in r["orderId"] or q in r["uid"]]
    return {"purchases": rows[:200]}


add("GET", "/api/purchases", purchases_get, auth="user")
add("GET", "/api/admin/purchases", admin_purchases, auth="user")
add("GET", "/api/addons", addons_get, auth="user")
add("POST", "/api/addons", lambda ctx: billing.start_addon_checkout(ctx.user, ctx.json(obj(sku=enum(*addons.SKUS)))["sku"], geo.country_for(ctx.req, ctx.user)), auth="user",
    rate={"name": "checkout-addon", "limit": 10, "windowSec": 600, "by": "user"})


def billing_return(ctx: Ctx):
    q = ctx.req.query
    link_id, ref_id = q.get("razorpay_payment_link_id", ""), q.get("razorpay_payment_link_reference_id", "")
    status, pay_id, sig = q.get("razorpay_payment_link_status", ""), q.get("razorpay_payment_id", ""), q.get("razorpay_signature", "")
    dest = lambda v: Out(303, b"", {"location": f"{env().app_url}/app/settings?paid={v}"})  # noqa: E731
    if not billing.verify_return_signature(link_id, ref_id, status, pay_id, sig):
        return dest("invalid")
    try:
        r = billing.settle_from_link(link_id, ref_id, ctx.user, pay_id or None)
        return dest("1" if r["paid"] else "0")
    except Exception as e:  # noqa: BLE001
        log("error", "billing.return_failed", err=str(e)[:300])
        # The webhook will still activate the plan, so tell the customer it is being confirmed rather than failing outright.
        return dest("pending")


add("GET", "/api/billing/return", billing_return, auth="optional")


def razorpay_webhook(ctx: Ctx):
    raw = ctx.req.body.decode("utf-8", "replace")
    if not billing.verify_webhook_signature(raw, ctx.req.header("x-razorpay-signature")):
        raise ApiError(400, "bad_signature", "Signature check failed.")
    try:
        body = json.loads(raw)
    except ValueError:
        raise ApiError(400, "bad_json", "Body is not JSON.") from None
    event_id = ctx.req.header("x-razorpay-event-id") or f"body_{sha256(raw)}"
    return {"ok": True, "result": billing.handle_webhook(event_id, body)}


add("POST", "/api/webhooks/razorpay", razorpay_webhook, auth="none", csrf=False, max_body=512 * 1024)


def paypal_return(ctx: Ctx):
    q = ctx.req.query
    dest = lambda v: Out(303, b"", {"location": f"{env().app_url}/app/settings?paid={v}"})  # noqa: E731
    try:
        r = billing.settle_paypal(safe_id(q.get("order", "")), q.get("token", ""), ctx.user)
        return dest("1" if r["paid"] else "0")
    except Exception as e:  # noqa: BLE001
        log("error", "billing.paypal_return_failed", err=str(e)[:300])
        return dest("pending")  # the webhook still switches the plan on once PayPal confirms


add("GET", "/api/billing/paypal/return", paypal_return, auth="optional")


def paypal_webhook(ctx: Ctx):
    try:
        body = json.loads(ctx.req.body.decode("utf-8", "replace"))
    except ValueError:
        raise ApiError(400, "bad_json", "Body is not JSON.") from None
    h = {k: ctx.req.header(k) or "" for k in ("paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time")}
    if not paypalmod.verify_webhook(h, body):
        raise ApiError(400, "bad_signature", "Signature check failed.")
    return {"ok": True, "result": billing.handle_paypal_event(body.get("id") or h["paypal-transmission-id"], body)}


add("POST", "/api/webhooks/paypal", paypal_webhook, auth="none", csrf=False, max_body=512 * 1024)


def receipt_get(ctx: Ctx):
    r = receipts.get_for(ctx.user, safe_id(ctx.params["id"]))
    if ctx.req.query.get("format") == "json":
        return {"receipt": r}
    return Out(200, receipts.render_html(r).encode(), {"content-type": "text/html; charset=utf-8", "cache-control": "private, no-store",
                                                        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'"})


add("GET", "/api/receipts/{id}", receipt_get, auth="user")


# ---------------------------------------------------------------- courses

_COURSE_JSON = obj(text=string(min=20, max=200_000), title=optional(string(max=120)))


def _course_summary(d: dict) -> dict:
    return {"id": d["id"], "course": d["course"], "notes": d["notes"], "aiPrerequisites": d["aiPrerequisites"]}


def _guard(handler):
    """Run the VPN/proxy/Tor check before a route that spends AI credit."""
    def wrapped(ctx: Ctx):
        antifraud.gate(ctx.req, ctx.user)
        return _fair(handler)(ctx)
    return wrapped


def courses_post(ctx: Ctx):
    mx = env().max_upload_bytes
    if _is_multipart(ctx):
        f = _file(ctx)
        if not f:
            raise ApiError(400, "no_file", "Choose a file to upload.")
        name, data, _ = f
        if len(data) > mx:
            raise ApiError(413, "too_large", f"That file is larger than {round(mx / 1048576)} MB.")
        title = (ctx.req.form.get("title") or "").strip()[:120]
        return json_out(_course_summary(courses.ingest_syllabus(ctx.user, file=(name[:200], data), title=title)), 201)
    b = ctx.json(_COURSE_JSON, 300 * 1024)
    return json_out(_course_summary(courses.ingest_syllabus(ctx.user, text=b["text"], title=b["title"] or "")), 201)


add("GET", "/api/courses", lambda ctx: {"courses": courses.list_course_docs(ctx.user)}, auth="user")
add("POST", "/api/courses", _guard(courses_post), auth="user", max_body=env().max_upload_bytes + 128 * 1024, rate={"name": "ingest", "limit": 15, "windowSec": 600, "by": "user"})


def course_get(ctx: Ctx):
    d = courses.get_course_doc(ctx.user, safe_id(ctx.params["id"]))
    return {"id": d["id"], "course": d["course"], "notes": d["notes"], "aiPrerequisites": d["aiPrerequisites"], "updated": d["updated"]}


def course_delete(ctx: Ctx):
    courses.delete_course_doc(ctx.user, safe_id(ctx.params["id"]))
    return {"ok": True}


add("GET", "/api/courses/{id}", course_get, auth="user")
add("DELETE", "/api/courses/{id}", course_delete, auth="user")
_PUBLISH = obj(public=boolean())
_REPORT_SYL = obj(reason=optional(string(max=300)))
add("PUT", "/api/courses/{id}/public", lambda ctx: courses.set_public(ctx.user, safe_id(ctx.params["id"]), ctx.json(_PUBLISH)["public"]), auth="user", rate=_rate_user("publish", 20, 3600))
add("GET", "/api/syllabi", lambda ctx: {"syllabi": courses.list_public(ctx.req.query.get("q") or "", ctx.req.query.get("category") or "", ctx.req.query.get("education") or "")}, auth="user")
add("GET", "/api/syllabi/{id}", lambda ctx: {"syllabus": courses.outline_of(courses.get_public(safe_id(ctx.params["id"]))), "units": courses.public_units(safe_id(ctx.params["id"]))}, auth="user")
add("POST", "/api/syllabi/{id}/add", lambda ctx: json_out(courses.add_public(ctx.user, safe_id(ctx.params["id"])), 201), auth="user", rate=_rate_user("syl-add", 30, 3600))
add("POST", "/api/syllabi/{id}/report", lambda ctx: courses.report_public(ctx.user, safe_id(ctx.params["id"]), ctx.json(_REPORT_SYL)["reason"] or ""), auth="user", rate=_rate_user("syl-report", 20, 3600))


# ---------------------------------------------------------------- jobs, images

_JOB = obj(depth=optional(enum("quick", "standard", "deep")), courseId=string(min=1, max=100), topicIds=optional(array(string(max=100), max=60)), images=optional(boolean()), instructions=optional(string(max=1000)),
           style=optional(string(max=20)), accent=optional(string(max=9)), reuse=optional(boolean()))


def jobs_get(ctx: Ctx):
    rows = storemod.get_store().find("jobs", where={"uid": ctx.user["id"]}, order_by="created", desc=True, limit=30)
    return {"jobs": [jobs.public_job(j) for j in rows]}


def jobs_post(ctx: Ctx):
    antifraud.gate(ctx.req, ctx.user)
    b = ctx.json(_JOB)
    net = netquality.assess(ctx.req)
    images = bool(b["images"]) and not net["slow"]  # pictures are the heaviest part of a run; skip them on a weak link
    job = jobs.create_job(ctx.user, b["courseId"], b["topicIds"], images, b["instructions"], b["style"], b["accent"], b["reuse"], b["depth"])
    bg.background(lambda: jobs.run_job(job["id"]))
    out = {"job": jobs.public_job(job, jobs.titles_for(job["courseId"]))}
    if net["slow"]:
        out["lowBandwidth"] = {"reasons": net["reasons"], "imagesSkipped": bool(b["images"]),
                               "message": "Your connection looks slow, so we left out AI pictures to finish faster. Turn off data saver or switch networks to include them."}
    return json_out(out, 202)


add("GET", "/api/jobs", jobs_get, auth="user")
add("POST", "/api/jobs", _fair(jobs_post), auth="user", rate={"name": "jobs", "limit": 20, "windowSec": 600, "by": "user"})


def job_get(ctx: Ctx):
    job = jobs.get_job(ctx.user, safe_id(ctx.params["id"]))
    if job["status"] == "queued" or (job["status"] == "running" and job["leaseUntil"] < time.time() * 1000):
        bg.background(lambda: jobs.run_job(job["id"]))
    return {"job": jobs.public_job(job, jobs.titles_for(job["courseId"]))}


def job_cancel(ctx: Ctx):
    j = jobs.cancel_job(ctx.user, safe_id(ctx.params["id"]))
    return {"ok": True, "status": j and j["status"]}


def job_retry(ctx: Ctx):
    j = jobs.retry_job(ctx.user, safe_id(ctx.params["id"]))
    if j and j["status"] == "queued":
        bg.background(lambda: jobs.run_job(j["id"]))
    return {"ok": True, "status": j and j["status"]}


def job_download(ctx: Ctx):
    fmt = ctx.req.query.get("format", "pptx")
    if fmt not in jobs.FORMATS:
        raise ApiError(400, "bad_format", "Format must be pptx, md or json.")
    f = jobs.artifact(ctx.user, safe_id(ctx.params["id"]), fmt)
    ascii_name = re.sub(r'"', "", re.sub(r"[^\x20-\x7e]", "_", f["filename"]))
    return _ctype(f["data"], jobs.FORMATS[fmt]["mime"], {"content-disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(f['filename'], safe='')}",
                                                         "content-length": str(len(f["data"]))})


add("GET", "/api/jobs/{id}", job_get, auth="user")
add("POST", "/api/jobs/{id}/cancel", job_cancel, auth="user")
add("POST", "/api/jobs/{id}/retry", job_retry, auth="user")
add("GET", "/api/jobs/{id}/download", job_download, auth="user")

_IMAGE = obj(prompt=string(min=3, max=300), width=optional(number(int_=True, min=256, max=1024)), height=optional(number(int_=True, min=256, max=1024)))


def images_post(ctx: Ctx):
    antifraud.gate(ctx.req, ctx.user)
    u = ctx.user
    limit = LIMITS[authmod.effective_plan(u)]["imagesPerDay"]
    if not limit:
        raise ApiError(402, "plan_required", "AI illustrations are part of the Learner plan.")
    b = ctx.json(_IMAGE)
    usage.consume(u["id"], "images", 1, limit)
    try:
        img = image.generate_image(image.slide_prompt(b["prompt"]), b["width"] or 1024, b["height"] or 576)
        return _ctype(img["bytes"], img["mime"], {"x-ai-generated": "true"})
    except Exception:
        usage.refund(u["id"], "images", 1)
        raise


add("POST", "/api/images", _fair(images_post), auth="user", rate={"name": "images", "limit": 20, "windowSec": 600, "by": "user"})


# ---------------------------------------------------------------- library

def library_get(ctx: Ctx):
    q = ctx.req.query
    return {"items": library.list_items(ctx.user, q.get("q", ""), q.get("kind", ""))}


def saved_get(ctx: Ctx):
    """Every lesson the learner has studied, with its questions and notes, for the Saved page."""
    out = []
    for it in library.list_items(ctx.user, "", "topic"):
        d = library.get_item(ctx.user, it["id"]).get("draft")
        if not d:
            continue
        out.append({"id": it["id"], "title": it["title"], "courseTitle": it["courseTitle"], "updated": it["updated"], "uses": it["uses"],
                    "draft": {k: d.get(k) for k in ("summary", "objectives", "slides", "questions", "notes")}})
    return {"items": out}


add("GET", "/api/saved", saved_get, auth="user")

_EXAM_NEW = obj(courseId=string(min=1, max=100), topicIds=optional(array(string(max=100), max=60)), count=optional(number(int_=True, min=3, max=30)),
                minutes=optional(number(int_=True, min=5, max=180)), kinds=optional(array(string(max=10), max=3)), difficulty=optional(string(max=10)))


def exams_post(ctx: Ctx):
    b = ctx.json(_EXAM_NEW)
    return json_out({"exam": exams.create_exam(ctx.user, b["courseId"], b["topicIds"] or [], b["count"] or 10, b["minutes"] or 30, b["kinds"] or ["mcq"], b["difficulty"] or "medium")}, 201)


_EXAM_SUBMIT = obj(answers=array(any_(), max=40), seconds=optional(number(int_=True, min=0, max=20000)))


def exam_sheet(ctx: Ctx):
    files = [ctx.req.files[k] for k in sorted(ctx.req.files) if k.startswith("file")]
    return {"exam": exams.submit_sheet(ctx.user, safe_id(ctx.params["id"]), files)}


add("GET", "/api/exams", lambda ctx: {"exams": exams.list_exams(ctx.user)}, auth="user")
add("POST", "/api/exams", _guard(exams_post), auth="user", rate={"name": "exam-new", "limit": 20, "windowSec": 3600, "by": "user"})
add("GET", "/api/exams/{id}", lambda ctx: {"exam": exams.get_exam(ctx.user, safe_id(ctx.params["id"]))}, auth="user")
add("POST", "/api/exams/{id}/submit", _guard(lambda ctx: (lambda b: {"exam": exams.submit_typed(ctx.user, safe_id(ctx.params["id"]), b["answers"], b["seconds"] or 0)})(ctx.json(_EXAM_SUBMIT, 400 * 1024))),
    auth="user", rate={"name": "exam-submit", "limit": 30, "windowSec": 3600, "by": "user"})
add("POST", "/api/exams/{id}/sheet", _guard(exam_sheet), auth="user", max_body=34 * 1024 * 1024, rate={"name": "exam-sheet", "limit": 10, "windowSec": 3600, "by": "user"})

_LIB_TOPIC = obj(title=string(min=1, max=160), tags=optional(array(string(max=30), max=10)), draft=any_())


def library_post(ctx: Ctx):
    if _is_multipart(ctx):
        f = _file(ctx)
        if not f:
            raise ApiError(400, "no_file", "Choose a PowerPoint file.")
        name, data, _ = f
        if len(data) > library.MAX_FILE_BYTES:
            raise ApiError(413, "too_large", "That file is larger than 15 MB.")
        title = (ctx.req.form.get("title") or "").strip() or re.sub(r"\.[a-z0-9]+$", "", name, flags=re.I)
        tags = [t.strip() for t in (ctx.req.form.get("tags") or "").split(",") if t.strip()]
        return json_out({"item": library.create_deck(ctx.user, title, name, data, tags)}, 201)
    b = ctx.json(_LIB_TOPIC, 200 * 1024)
    return json_out({"item": library.create_topic(ctx.user, b["title"], b["draft"], b["tags"])}, 201)


add("GET", "/api/library", library_get, auth="user")
add("POST", "/api/library", library_post, auth="user", max_body=library.MAX_FILE_BYTES + 128 * 1024, rate={"name": "library-add", "limit": 30, "windowSec": 600, "by": "user"})

_MATCH = obj(titles=array(string(min=1, max=200), min=1, max=60))


def library_match(ctx: Ctx):
    out = {}
    for t in ctx.json(_MATCH)["titles"]:
        m = library.find_reusable(ctx.user["id"], t)
        out[t] = {"id": m["item"]["id"], "title": m["item"]["title"], "score": round(m["score"], 2), "how": m["how"], "source": m["item"]["source"]} if m else None
    return {"matches": out}


add("POST", "/api/library/match", library_match, auth="user", rate={"name": "library-match", "limit": 60, "windowSec": 600, "by": "user"})


def library_item_get(ctx: Ctx):
    i = library.get_item(ctx.user, safe_id(ctx.params["id"]))
    return {"item": library.public_item(i), "draft": i.get("draft")}


_LIB_PATCH = obj(title=optional(string(min=1, max=160)), tags=optional(array(string(max=30), max=10)))


def library_item_patch(ctx: Ctx):
    raw = ctx.json(any_(), 200 * 1024)
    p = _LIB_PATCH(raw if isinstance(raw, dict) else {}, "")
    return {"item": library.update_item(ctx.user, safe_id(ctx.params["id"]), p["title"], p["tags"], raw.get("draft") if isinstance(raw, dict) else None,
                                         isinstance(raw, dict) and raw.get("draft") is not None)}


def library_item_delete(ctx: Ctx):
    library.delete_item(ctx.user, safe_id(ctx.params["id"]))
    return {"ok": True}


def library_file_get(ctx: Ctx):
    part = "image" if ctx.req.query.get("part") == "image" else "file"
    id = safe_id(ctx.params["id"])
    try:
        f = library.item_file(ctx.user, id, part)
    except ApiError:
        if part != "file":
            raise
        f = library.item_file(ctx.user, id, "image")  # a topic has a picture but no file
    return _ctype(f["data"], f["contentType"], {"content-disposition": f'attachment; filename="{re.sub(r"[^\w.\- ]+", "_", f["name"])}"'})


def library_file_put(ctx: Ctx):
    f = _file(ctx)
    if not f:
        raise ApiError(400, "no_file", "Choose a file.")
    return {"item": library.replace_file(ctx.user, safe_id(ctx.params["id"]), f[0], f[1])}


add("GET", "/api/library/{id}", library_item_get, auth="user")
add("PATCH", "/api/library/{id}", library_item_patch, auth="user", rate={"name": "library-edit", "limit": 60, "windowSec": 600, "by": "user"})
add("DELETE", "/api/library/{id}", library_item_delete, auth="user")
add("GET", "/api/library/{id}/file", library_file_get, auth="user")
add("PUT", "/api/library/{id}/file", library_file_put, auth="user", max_body=library.MAX_FILE_BYTES + 128 * 1024, rate={"name": "library-file", "limit": 30, "windowSec": 600, "by": "user"})


# ---------------------------------------------------------------- learn

def _rate(name, limit, window=3600):
    return {"name": name, "limit": limit, "windowSec": window, "by": "user"}


_PREPARE = obj(sessionId=string(min=1, max=80), title=string(min=2, max=160), courseTitle=optional(string(max=160)), depth=optional(enum("quick", "standard", "deep")))
add("POST", "/api/learn/prepare", _guard(lambda ctx: (lambda b: learn.prepare_topic(ctx.user, b["sessionId"], b["title"], b["courseTitle"], b["depth"] or "standard"))(ctx.json(_PREPARE))),
    auth="user", rate=_rate("learn-prepare", 60))

_MAKE = obj(title=string(min=2, max=160), fresh=optional(boolean()))
_DRILL_CHECK = obj(title=string(min=2, max=160), index=number(int_=True, min=0, max=20), choice=number(int_=True, min=0, max=6))
_GAME_CHECK = obj(title=string(min=2, max=160), answers=array(any_(), max=12))
add("POST", "/api/learn/drill", _guard(lambda ctx: (lambda b: learn.drill_for(ctx.user, b["title"], b["fresh"] is True))(ctx.json(_MAKE))), auth="user", rate=_rate("learn-drill", 60))
add("PUT", "/api/learn/drill", lambda ctx: (lambda b: learn.check_drill(ctx.user, b["title"], b["index"], b["choice"]))(ctx.json(_DRILL_CHECK)), auth="user", rate=_rate("learn-drill-check", 300))
add("POST", "/api/learn/game", _guard(lambda ctx: (lambda b: learn.game_for(ctx.user, b["title"], b["fresh"] is True))(ctx.json(_MAKE))), auth="user", rate=_rate("learn-game", 60))
add("PUT", "/api/learn/game", lambda ctx: (lambda b: learn.check_game(ctx.user, b["title"], b["answers"]))(ctx.json(_GAME_CHECK)), auth="user", rate=_rate("learn-game-check", 120))

_PROBLEM_CHECK = obj(title=string(min=2, max=160), index=number(min=0, max=20, int_=True), value=string(max=100), reveal=optional(boolean()))
add("POST", "/api/learn/problems", _guard(lambda ctx: (lambda b: learn.problems_for(ctx.user, b["title"], b["fresh"] is True))(ctx.json(_MAKE))), auth="user", rate=_rate("learn-problems", 60))
add("PUT", "/api/learn/problems", lambda ctx: (lambda b: learn.check_problem(ctx.user, b["title"], b["index"], b["value"], b["reveal"] is True))(ctx.json(_PROBLEM_CHECK)),
    auth="user", rate=_rate("learn-problem-check", 300))

_PROGRESS = obj(title=string(min=2, max=160), event=enum("quiz", "slides"), score=number(min=0, max=1))
add("POST", "/api/learn/time", lambda ctx: (lambda b: (activity.bump(ctx.user["id"], False, minutes=b["minutes"]), {"ok": True})[1])(ctx.json(obj(minutes=number(min=0, max=30)))),
    auth="user", rate={"name": "learn-time", "limit": 400, "windowSec": 3600, "by": "user"})
add("GET", "/api/learn/activity", lambda ctx: {"days": activity.days(ctx.user["id"])}, auth="user")
add("GET", "/api/learn/progress", lambda ctx: learn.course_progress(ctx.user, ctx.req.query.get("courseId", "")), auth="user")
add("POST", "/api/learn/progress", lambda ctx: (lambda b: {**learn.record_progress(ctx.user, b["title"], b["event"], b["score"]), **({"reward": rewards.on_answer(ctx.user, b["score"] >= 0.5, "quiz")} if b["event"] == "quiz" else {})})(ctx.json(_PROGRESS)),
    auth="user", rate=_rate("learn-progress", 300))

_UNIT = obj(courseId=string(min=1, max=80), unitId=string(min=1, max=80))
_NOTES = obj(courseId=string(min=1, max=80), unitId=string(min=1, max=80),
             weights=array(obj(topic=string(min=1, max=160), marks=number(min=1, max=20)), min=1, max=40))


def _saved_unit(kind: str, filename: str):
    def handler(ctx: Ctx):
        q = ctx.req.query
        a = learn.get_saved_unit_asset(ctx.user, q.get("courseId", ""), q.get("unitId", ""), kind)
        if q.get("format") == "md" and a:
            return Out(200, a["markdown"].encode(), {"content-type": "text/markdown; charset=utf-8", "content-disposition": f'attachment; filename="{filename}"'})
        return {"saved": a}
    return handler


add("GET", "/api/learn/unit-answers", _saved_unit("unit_answers", "unit-answers.md"), auth="user")
add("POST", "/api/learn/unit-answers", _guard(lambda ctx: (lambda b: learn.unit_answers(ctx.user, b["courseId"], b["unitId"]))(ctx.json(_UNIT))), auth="user", rate=_rate("learn-answers", 20))
add("GET", "/api/learn/notes", _saved_unit("notes", "notes-by-marks.md"), auth="user")
add("POST", "/api/learn/notes", _guard(lambda ctx: (lambda b: learn.marks_notes(ctx.user, b["courseId"], b["unitId"], b["weights"]))(ctx.json(_NOTES))), auth="user", rate=_rate("learn-notes", 20))

_CHAT = obj(title=string(min=2, max=160), question=string(min=3, max=500))
add("GET", "/api/learn/chat", lambda ctx: {"messages": learn.chat_history(ctx.user, ctx.req.query.get("title", ""))}, auth="user")
add("POST", "/api/learn/chat", _guard(lambda ctx: (lambda b: learn.ask_class(ctx.user, b["title"], b["question"]))(ctx.json(_CHAT))), auth="user", rate=_rate("learn-chat", 60, 600))


# ---------------------------------------------------------------- social

add("GET", "/api/people/{handle}", lambda ctx: social.public_profile(ctx.user, ctx.params["handle"]), auth="user")
add("POST", "/api/people/{handle}", lambda ctx: social.toggle_follow(ctx.user, ctx.params["handle"]), auth="user", rate=_rate("follow", 60))
add("GET", "/api/leaderboard", lambda ctx: {"rows": social.leaderboard(ctx.req.query.get("category") or None)}, auth="user")


# ---------------------------------------------------------------- admin

def admin_overview(ctx: Ctx):
    _admin(ctx)
    st, now, DAY = storemod.get_store(), time.time() * 1000, 86_400_000
    week = ("created", now - 7 * DAY)
    fb = st.find("feedback", since=("created", now - 30 * DAY), limit=1000)
    orders = st.find("orders", where={"status": "paid"}, since=("paidAt", now - 30 * DAY), limit=1000)
    avg = sum(f["rating"] for f in fb) / len(fb) if fb else None
    return {"users": {"total": st.count("users"), "last7d": st.count("users", since=week)},
            "runs": {"last7d": st.count("jobs", since=week), "done": st.count("jobs", where={"status": "done"}, since=week),
                     "failed": st.count("jobs", where={"status": "failed"}, since=week)},
            "feedback": {"last30d": len(fb), "averageRating": None if avg is None else round(avg, 2)},
            "revenue30d": {"orders": len(orders), "amountPaise": sum(o["amountPaise"] for o in orders if o.get("currency", "INR") == "INR"), "currency": "INR",
                           "usdCents": sum(o["amountPaise"] for o in orders if o.get("currency") == "USD")},
            "openTickets": st.count("tickets", where={"status": "open"})}


def admin_feedback(ctx: Ctx):
    _admin(ctx)
    q = ctx.req.query
    mx = min(int(q.get("limit") or 50) if str(q.get("limit") or "50").isdigit() else 50, 500)
    max_rating = int(q["maxRating"]) if str(q.get("maxRating", "")).isdigit() and int(q["maxRating"]) else 5
    st = storemod.get_store()
    rows = [f for f in st.find("feedback", order_by="created", desc=True, limit=1000) if f["rating"] <= max_rating][:mx]
    names: dict = {}
    for f in rows:
        if f["uid"] not in names:
            u = st.get("users", f["uid"])
            names[f["uid"]] = u["email"] if u else "deleted user"
    return {"feedback": [{"id": f["id"], "kind": f["kind"], "uid": f["uid"], "from": names.get(f["uid"]), "rating": f["rating"], "comment": f["comment"], "tags": f["tags"],
                          "page": f.get("page"), "created": f["created"]} for f in rows]}


def admin_tickets(ctx: Ctx):
    _admin(ctx)
    status = "closed" if ctx.req.query.get("status") == "closed" else "open"
    return {"tickets": storemod.get_store().find("tickets", where={"status": status}, order_by="created", desc=True, limit=100)}


def admin_ticket_close(ctx: Ctx):
    _admin(ctx)
    t = storemod.get_store().update("tickets", safe_id(ctx.params["id"]), lambda c: {**c, "status": "closed"} if c else c)
    if not t:
        raise not_found("That ticket")
    return {"ok": True}


def admin_users(ctx: Ctx):
    _admin(ctx)
    q = ctx.req.query
    csv = q.get("format") == "csv"
    num = lambda k, d: int(q[k]) if str(q.get(k, "")).isdigit() and int(q[k]) else d  # noqa: E731
    r = adminusers.list_users(q.get("q", ""), q.get("sort", "created"), "asc" if q.get("dir") == "asc" else "desc", num("page", 1), 200 if csv else num("pageSize", 25), q.get("category", ""))
    if csv:
        return Out(200, adminusers.users_csv(r["rows"]).encode(), {"content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="users.csv"', "cache-control": "no-store"})
    return r


_ADMIN_ACT = obj(action=enum("block", "unblock", "grant_plan", "grant_addon", "reset_quota", "force_logout"), reason=optional(string(max=300)),
                 minutes=optional(number(min=1, max=525_600, int_=True)), plan=optional(enum("learner", "classroom")), days=optional(number(min=1, max=400, int_=True)),
                 sku=optional(enum(*addons.SKUS)), quantity=optional(number(min=1, max=100, int_=True)))


def admin_user_act(ctx: Ctx):
    _admin(ctx)
    b = ctx.json(_ADMIN_ACT)
    a = b["action"]
    if a == "grant_plan":
        act = {"action": a, "plan": b["plan"] or "learner", "days": b["days"] or 30}
    elif a == "grant_addon":
        if not b["sku"]:
            raise ApiError(422, "invalid_input", "sku: is required")
        act = {"action": a, "sku": b["sku"], "days": b["days"], "quantity": b["quantity"]}
    elif a == "block":
        act = {"action": a, "reason": b["reason"] or "", "minutes": b["minutes"]}
    else:
        act = {"action": a}
    return adminusers.admin_act(ctx.user, ctx.params["id"], act)


add("GET", "/api/admin/overview", admin_overview, auth="user")
add("POST", "/api/presence", lambda ctx: geo.heartbeat(ctx.user, ctx.req), auth="user", rate=_rate_user("presence", 120, 3600))
def _dev(ctx: Ctx) -> dict:
    return devtools.require_dev(ctx.user)


def _private(out: dict, status: int = 200) -> Out:
    return json_out(out, status, {"cache-control": "private, no-store"})


_CASE = obj(ref=string(min=6, max=14), reason=string(min=1, max=300))
_ACT = obj(action=string(max=30), note=optional(string(max=300)), target=optional(string(max=100)))
_ISSUE = obj(state=string(max=20), note=optional(string(max=300)))
add("GET", "/api/dev/issues", lambda ctx: (_dev(ctx), _private({"issues": devtools.list_issues(ctx.req.query.get("state") or "")}))[1], auth="user", rate=_rate_user("dev-issues", 300, 3600))
add("POST", "/api/dev/issues/{id}", lambda ctx: (lambda d: _private(devtools.set_issue(d, safe_id(ctx.params["id"]), ctx.json(_ISSUE)["state"], ctx.json(_ISSUE)["note"] or "")))(_dev(ctx)), auth="user", rate=_rate_user("dev-issue-set", 200, 3600))
add("POST", "/api/dev/cases", lambda ctx: (lambda d: (lambda b: _private(devtools.open_case(d, b["ref"], b["reason"]), 201))(ctx.json(_CASE)))(_dev(ctx)), auth="user", rate=_rate_user("dev-case", 60, 3600))
add("GET", "/api/dev/cases/{id}", lambda ctx: (lambda d: _private(devtools.learner_view(d, safe_id(ctx.params["id"]))))(_dev(ctx)), auth="user", rate=_rate_user("dev-view", 300, 3600))
add("POST", "/api/dev/cases/{id}/act", lambda ctx: (lambda d: (lambda b: _private(devtools.act(d, safe_id(ctx.params["id"]), b["action"], b["note"] or "", b["target"] or "")))(ctx.json(_ACT)))(_dev(ctx)), auth="user", rate=_rate_user("dev-act", 120, 3600))
add("POST", "/api/dev/cases/{id}/close", lambda ctx: (lambda d: _private(devtools.close_case(d, safe_id(ctx.params["id"]))))(_dev(ctx)), auth="user")
add("GET", "/api/dev/actions", lambda ctx: (_dev(ctx), _private({"actions": devtools.ACTIONS}))[1], auth="user")
add("GET", "/api/me/support-ref", lambda ctx: _private({"ref": devtools.ref_of(ctx.user["id"])}), auth="user")
add("GET", "/api/me/access-log", lambda ctx: _private({"log": devtools.access_log(ctx.user)}), auth="user")
_CLIENT_ERR = obj(route=string(max=120), message=string(max=300))
add("POST", "/api/client-error", lambda ctx: (lambda b: (devtools.record_issue(ctx.user, "CLIENT", b["route"], 0, "client", b["message"], ctx.rid, "client"), {"ok": True})[1])(ctx.json(_CLIENT_ERR)), auth="optional", rate={"name": "client-error", "limit": 20, "windowSec": 600, "by": "ip"})
def _adm(ctx: Ctx) -> dict:
    return _admin(ctx)


def _qs(ctx: Ctx, k: str, d: str = "") -> str:
    return ctx.req.query.get(k) or d


def _int(ctx: Ctx, k: str, d: int) -> int:
    v = ctx.req.query.get(k, "")
    return int(v) if v.lstrip("-").isdigit() else d


_DOC_NEW = obj(col=string(max=41), id=optional(string(max=200)), data=any_())
_DOC_PUT = obj(col=string(max=41), id=string(min=1, max=200), data=any_(), mode=optional(enum("merge", "replace")))
_DOC_DEL = obj(col=string(max=41), id=string(min=1, max=200), confirm=string(max=200))
add("GET", "/api/admin/report/users", lambda ctx: (_adm(ctx), _private(adminreports.users_report(_qs(ctx, "q"), _qs(ctx, "sort", "created"), _qs(ctx, "dir", "desc"), _int(ctx, "page", 1), _int(ctx, "size", 25), _qs(ctx, "category"), _qs(ctx, "plan"))))[1], auth="user", rate=_rate_user("adm-users", 600, 3600))


def admin_user_detail(ctx: Ctx):
    admin = _adm(ctx)
    d = adminreports.user_detail(_qs(ctx, "id"))
    if not d:
        raise not_found("That learner")
    abuse.audit(admin["id"], "admin.user_view", d["account"]["id"], {})
    return _private(d)


add("GET", "/api/admin/report/user", admin_user_detail, auth="user", rate=_rate_user("adm-user", 600, 3600))
add("GET", "/api/admin/report/content", lambda ctx: (_adm(ctx), _private(adminreports.content_report(min(max(_int(ctx, "days", 30), 1), 365))))[1], auth="user", rate=_rate_user("adm-content", 300, 3600))
add("GET", "/api/admin/report/syllabus", lambda ctx: (_adm(ctx), _private(adminreports.syllabus_report()))[1], auth="user", rate=_rate_user("adm-syl", 300, 3600))
add("GET", "/api/admin/audit", lambda ctx: (_adm(ctx), _private({"rows": adminreports.audit_list(_int(ctx, "limit", 200), _qs(ctx, "action"))}))[1], auth="user", rate=_rate_user("adm-audit", 300, 3600))
add("GET", "/api/admin/db/collections", lambda ctx: (_adm(ctx), _private(admindb.collections()))[1], auth="user", rate=_rate_user("adm-db", 600, 3600))
add("GET", "/api/admin/db/browse", lambda ctx: (_adm(ctx), _private(admindb.browse(_qs(ctx, "col"), _qs(ctx, "q"), _int(ctx, "page", 1), _int(ctx, "size", 25))))[1], auth="user", rate=_rate_user("adm-db", 600, 3600))
add("GET", "/api/admin/db/doc", lambda ctx: (_adm(ctx), _private(admindb.get_doc(_qs(ctx, "col"), _qs(ctx, "id"))))[1], auth="user", rate=_rate_user("adm-db", 600, 3600))
add("POST", "/api/admin/db/doc", lambda ctx: (lambda a, b: _private(admindb.create(a, b["col"], b["id"] or "", b["data"]), 201))(_adm(ctx), ctx.json(_DOC_NEW)), auth="user", rate=_rate_user("adm-db-w", 120, 3600))
add("PUT", "/api/admin/db/doc", lambda ctx: (lambda a, b: _private(admindb.change(a, b["col"], b["id"], b["data"], b["mode"] or "merge")))(_adm(ctx), ctx.json(_DOC_PUT)), auth="user", rate=_rate_user("adm-db-w", 120, 3600))
add("DELETE", "/api/admin/db/doc", lambda ctx: (lambda a, b: _private(admindb.remove(a, b["col"], b["id"], b["confirm"])))(_adm(ctx), ctx.json(_DOC_DEL)), auth="user", rate=_rate_user("adm-db-w", 120, 3600))
add("GET", "/api/admin/live", lambda ctx: (_admin(ctx), geo.live_snapshot())[1], auth="user", rate=_rate_user("admin-live", 600, 3600))
add("GET", "/api/admin/geo", lambda ctx: (_admin(ctx), geo.globe_points())[1], auth="user")



# ---------------------------------------------------------------- the exploration canvas
_ASK = obj(question=string(min=2, max=300), parent=optional(string(max=60)), x=optional(number(min=-20000, max=20000)), y=optional(number(min=-20000, max=20000)),
           visual=optional(boolean()))


def canvas_ask(ctx: Ctx):
    antifraud.gate(ctx.req, ctx.user)
    u, cid = ctx.user, safe_id(ctx.params["id"])
    board = canvasmod.get_board(u["id"], cid)
    b = ctx.json(_ASK)
    plan = authmod.effective_plan(u)
    stored = canvasmod.from_pool(u, b["question"])  # a lesson already written for this topic answers it for free
    if not stored and not usage.consume_month(u["id"], "canvas", canvasmod.monthly_limit(plan)):
        raise ApiError(402, "plan_required", "You have used this month's free canvas questions. The Beta plan has no limit.")
    parent = next((n for n in board.get("nodes", []) if n.get("id") == b["parent"]), None) if b["parent"] else None
    ctxt = ""
    if parent and parent.get("a"):
        ctxt = f"{parent.get('q', '')}: {parent['a'].get('summary', '')}"
    try:
        a = stored["answer"] if stored else canvasmod.answer(b["question"], ctxt)
    except Exception:
        usage.refund_month(u["id"], "canvas")
        raise
    node = {"id": uuid(), "kind": "question", "q": b["question"], "a": {k: a[k] for k in ("title", "summary", "points", "diagram", "table", "followups", "imagePrompt")},
            "image": None, "state": "ready", "error": None, "parent": parent["id"] if parent else None,
            "x": b["x"] if b["x"] is not None else (parent["x"] + 560 if parent else 80), "y": b["y"] if b["y"] is not None else (parent["y"] if parent else 80)}
    from . import stats
    stats.note("canvas", "shared" if stored else "generated")
    out = {"imageSkipped": None, "fromStored": bool(stored)}
    if b["visual"] and stored and stored.get("imageBlob") and storemod.get_store().get_blob(stored["imageBlob"]):
        data, mime = storemod.get_store().get_blob(stored["imageBlob"])
        bid = f"cv-{u['id']}-{uuid()}"
        storemod.get_store().put_blob(bid, data, mime)
        node["image"] = bid  # the picture made for this topic is reused: no model, no daily picture used
    elif b["visual"]:
        limit = LIMITS[plan]["imagesPerDay"]
        if not limit:
            out["imageSkipped"] = "plan"
        else:
            try:
                usage.consume(u["id"], "images", 1, limit)
            except ApiError:
                out["imageSkipped"] = "limit"
            else:
                try:
                    node["image"] = canvasmod.make_picture(u["id"], a["imagePrompt"] or b["question"])
                except Exception:  # noqa: BLE001
                    usage.refund(u["id"], "images", 1)
                    out["imageSkipped"] = "busy"
    canvasmod.add_node(u["id"], cid, node)
    return {"node": node, **out}


add("GET", "/api/canvases", lambda ctx: {"canvases": canvasmod.list_boards(ctx.user["id"])}, auth="user")
add("POST", "/api/canvases", lambda ctx: {"canvas": canvasmod.create_board(ctx.user["id"], ctx.json(obj(title=optional(string(max=80))))["title"] or "")}, auth="user")
add("GET", "/api/canvases/{id}", lambda ctx: {"canvas": canvasmod.get_board(ctx.user["id"], safe_id(ctx.params["id"]))}, auth="user")
add("PUT", "/api/canvases/{id}", lambda ctx: (lambda b: {"canvas": canvasmod.save_board(ctx.user["id"], safe_id(ctx.params["id"]), b["title"], b["nodes"])})(
    ctx.json(obj(title=optional(string(max=80)), nodes=array(any_(), max=canvasmod.MAX_NODES)))), auth="user")
add("DELETE", "/api/canvases/{id}", lambda ctx: (canvasmod.remove_board(ctx.user["id"], safe_id(ctx.params["id"])), {"ok": True})[1], auth="user")
add("POST", "/api/canvases/{id}/ask", _fair(canvas_ask), auth="user", rate={"name": "canvas-ask", "limit": 30, "windowSec": 600, "by": "user"})
add("GET", "/api/canvas-image/{bid}", lambda ctx: _ctype(*canvasmod.read_picture(ctx.user["id"], safe_id(ctx.params["bid"]))), auth="user")


# ---------------------------------------------------------------- study tools
def _cid(ctx: Ctx) -> str:
    return safe_id((ctx.req.query.get("courseId") or "").strip())


add("GET", "/api/study/map", lambda ctx: study.error_map(ctx.user, _cid(ctx)), auth="user")
add("GET", "/api/study/plan", lambda ctx: study.get_plan(ctx.user, _cid(ctx)), auth="user")
add("PUT", "/api/study/plan", lambda ctx: (lambda b: study.set_plan(ctx.user, b["courseId"], b["examDate"], b["minutes"] or 90))(
    ctx.json(obj(courseId=string(min=1, max=100), examDate=string(min=10, max=10), minutes=optional(number(min=20, max=480, int_=True))))), auth="user")
add("DELETE", "/api/study/plan", lambda ctx: (study.clear_plan(ctx.user, _cid(ctx)), {"ok": True})[1], auth="user")
add("GET", "/api/study/cards", lambda ctx: study.list_cards(ctx.user["id"], ctx.req.query.get("courseId", ""), ctx.req.query.get("all") != "1"), auth="user")
add("POST", "/api/study/cards", lambda ctx: (lambda b: {"card": study.add_card(ctx.user["id"], b["front"], b["back"], b["title"] or "", "manual", b["courseId"] or "")})(
    ctx.json(obj(front=string(min=4, max=400), back=string(min=1, max=600), title=optional(string(max=160)), courseId=optional(string(max=100))))), auth="user")
add("POST", "/api/study/cards/{id}/review", lambda ctx: {"card": study.review_card(ctx.user["id"], safe_id(ctx.params["id"]), ctx.json(obj(grade=enum("again", "hard", "good", "easy")))["grade"])}, auth="user")
add("DELETE", "/api/study/cards/{id}", lambda ctx: (study.delete_card(ctx.user["id"], safe_id(ctx.params["id"])), {"ok": True})[1], auth="user")


def study_paper(ctx: Ctx):
    antifraud.gate(ctx.req, ctx.user)
    if _is_multipart(ctx):
        f = _file(ctx)
        if not f:
            raise ApiError(400, "no_file", "Choose a file.")
        cid = safe_id((ctx.req.form.get("courseId") or "").strip())
        return study.analyse_paper(ctx.user, cid, (ctx.req.form.get("name") or f[0]).strip(), extract.extract_text(f[0], f[1]))
    b = ctx.json(obj(courseId=string(min=1, max=100), name=optional(string(max=100)), text=string(min=80, max=60000)))
    return study.analyse_paper(ctx.user, b["courseId"], b["name"] or "Pasted paper", b["text"])


add("POST", "/api/study/papers", _fair(study_paper), auth="user", rate={"name": "study-paper", "limit": 10, "windowSec": 3600, "by": "user"})
add("GET", "/api/study/papers", lambda ctx: study.paper_summary(ctx.user, _cid(ctx)), auth="user")
add("DELETE", "/api/study/papers/{id}", lambda ctx: (study.delete_paper(ctx.user, safe_id(ctx.params["id"])), {"ok": True})[1], auth="user")
_TURNS = array(obj(role=enum("you", "student"), text=string(max=1500)), max=24)
add("POST", "/api/study/teachback", _fair(lambda ctx: (lambda b: study.teachback(ctx.user, b["courseId"], b["topicId"], b["history"] or [], bool(b["finish"])))(
    ctx.json(obj(courseId=string(min=1, max=100), topicId=optional(string(max=100)), history=optional(_TURNS), finish=optional(boolean()))))), auth="user",
    rate={"name": "study-teach", "limit": 40, "windowSec": 3600, "by": "user"})
add("POST", "/api/study/viva", _fair(lambda ctx: (lambda b: study.viva(ctx.user, b["courseId"], b["topicId"], b["question"] or "", b["answer"] or ""))(
    ctx.json(obj(courseId=string(min=1, max=100), topicId=optional(string(max=100)), question=optional(string(max=300)), answer=optional(string(max=1500)))))), auth="user",
    rate={"name": "study-viva", "limit": 40, "windowSec": 3600, "by": "user"})


def study_scan(ctx: Ctx):
    antifraud.gate(ctx.req, ctx.user)
    f = _file(ctx)
    if not f:
        raise ApiError(400, "no_file", "Add a photo.")
    mode = "canvas" if ctx.req.form.get("mode") == "canvas" else "lesson"
    cv = (ctx.req.form.get("canvasId") or "").strip()
    return study.scan(ctx.user, f[0], f[1], f[2], mode, safe_id(cv) if cv else None, (ctx.req.form.get("courseId") or "").strip()[:100])


add("POST", "/api/study/scan", _fair(study_scan), auth="user", rate={"name": "study-scan", "limit": 15, "windowSec": 3600, "by": "user"})
add("GET", "/api/study/pack", lambda ctx: study.offline_pack(ctx.user, _cid(ctx), int(ctx.req.query.get("days") or 7)), auth="user")


# ---- real-world photographs for slides (free licences, with their credit)
add("GET", "/api/example", lambda ctx: example.find(ctx.req.query.get("q", ""), int(ctx.req.query.get("n") or 0)), auth="user", rate={"name": "example-photo", "limit": 60, "windowSec": 600, "by": "user"})
add("GET", "/api/example-image/{bid}", lambda ctx: _ctype(*example.read(safe_id(ctx.params["bid"]))), auth="user")


# ---------------------------------------------------------------- play: points, streak, hearts, gems, the weekly league
add("GET", "/api/play/me", lambda ctx: rewards.get(ctx.user), auth="user")
add("GET", "/api/play/league", lambda ctx: rewards.league(ctx.user, ctx.req.query.get("scope") or "week", ctx.req.query.get("education") or "", ctx.req.query.get("category") or ""), auth="user")
add("GET", "/api/referral", lambda ctx: referral.summary(ctx.user), auth="user")
add("PUT", "/api/play/profile", lambda ctx: (lambda b: rewards.profile(ctx.user, b["alias"], b["board"]))(ctx.json(obj(alias=optional(string(max=24)), board=optional(boolean())))), auth="user")
add("POST", "/api/play/shop", lambda ctx: rewards.buy(ctx.user, ctx.json(obj(item=enum(*rewards.SHOP)))["item"]), auth="user", rate={"name": "play-shop", "limit": 30, "windowSec": 600, "by": "user"})
add("POST", "/api/play/round", lambda ctx: (lambda b: {"round": rewards.complete_round(ctx.user, b["correct"], b["total"]), "me": rewards.get(ctx.user)})(
    ctx.json(obj(correct=number(min=0, max=40, int_=True), total=number(min=0, max=40, int_=True)))), auth="user", rate={"name": "play-round", "limit": 60, "windowSec": 3600, "by": "user"})
add("GET", "/api/play/shop", lambda ctx: {"items": [{"id": k, **v} for k, v in rewards.SHOP.items()]}, auth="user")

# ---- the AI chain: what is set up, and a live check of every route (owner only)
add("GET", "/api/admin/ai", lambda ctx: (_admin(ctx), llm.overview())[1], auth="user")
add("POST", "/api/admin/ai/test", lambda ctx: (_admin(ctx), {"results": llm.diagnose()})[1], auth="user", rate={"name": "ai-test", "limit": 6, "windowSec": 600, "by": "user"})

# ---- the backdrop library: any signed-in learner reads the active queue; only the owner changes it
add("GET", "/api/backdrops", lambda ctx: {"items": backdrops.list_items(True)}, auth="user")
add("GET", "/api/admin/backdrops", lambda ctx: (_admin(ctx), {"items": backdrops.list_items(False)})[1], auth="user")
add("POST", "/api/admin/backdrops", lambda ctx: (_admin(ctx), (lambda b: {"item": backdrops.add(b["title"], b["kind"], b["src"], int(b["seconds"] or 90))})(
    ctx.json(obj(title=string(min=1, max=80), kind=enum(*backdrops.KINDS), src=string(min=1, max=500), seconds=optional(number(min=20, max=1800, int_=True))))))[1], auth="user")
add("PUT", "/api/admin/backdrops/{id}", lambda ctx: (_admin(ctx), (lambda b: {"item": backdrops.update(safe_id(ctx.params["id"]), b)})(
    ctx.json(obj(title=optional(string(min=1, max=80)), seconds=optional(number(min=20, max=1800, int_=True)), active=optional(boolean()), order=optional(number(min=0, max=1000, int_=True))))))[1], auth="user")
add("DELETE", "/api/admin/backdrops/{id}", lambda ctx: (_admin(ctx), backdrops.remove(safe_id(ctx.params["id"])), {"ok": True})[2], auth="user")
add("GET", "/api/admin/feedback", admin_feedback, auth="user")


# ---------------------------------------------------------------- the learner's own AI key
_AI_KEY = obj(provider=string(max=20), key=string(min=1, max=400), model=optional(string(max=80)))


def ai_key_put(ctx: Ctx):
    b = ctx.json(_AI_KEY)
    out = byok.connect(ctx.user["id"], b["provider"], b["key"], b["model"] or "")
    abuse.audit(ctx.user["id"], "byok.connect", ctx.user["id"], {"provider": b["provider"]})  # never the key
    return _private(out)


def ai_key_delete(ctx: Ctx):
    out = byok.disconnect(ctx.user["id"])
    abuse.audit(ctx.user["id"], "byok.disconnect", ctx.user["id"], {})
    return _private(out)


add("GET", "/api/me/ai-key", lambda ctx: _private(byok.public(ctx.user["id"])), auth="user")
add("PUT", "/api/me/ai-key", ai_key_put, auth="user", rate={"name": "ai-key", "limit": 12, "windowSec": 3600, "by": "user"})
add("DELETE", "/api/me/ai-key", ai_key_delete, auth="user", rate={"name": "ai-key-del", "limit": 30, "windowSec": 3600, "by": "user"})


def admin_feedback_delete(ctx: Ctx):
    admin = _adm(ctx)
    fid = safe_id(ctx.params["id"])
    st = storemod.get_store()
    row = st.get("feedback", fid)
    if row is None:
        raise not_found("That feedback")
    st.delete("feedback", fid)
    abuse.audit(admin["id"], "admin.feedback_delete", fid, {"rating": row.get("rating"), "learner": row.get("uid")})
    return {"ok": True}


_FB_BULK = obj(ids=array(string(min=1, max=80), min=1, max=200))


def admin_feedback_bulk_delete(ctx: Ctx):
    admin = _adm(ctx)
    st = storemod.get_store()
    gone = []
    for raw in dict.fromkeys(ctx.json(_FB_BULK)["ids"]):
        fid = safe_id(raw)
        row = st.get("feedback", fid)
        if row is None:
            continue
        st.delete("feedback", fid)
        gone.append(fid)
    if gone:
        abuse.audit(admin["id"], "admin.feedback_delete", f"{len(gone)} entries", {"ids": gone})
    return {"ok": True, "removed": len(gone)}


add("POST", "/api/admin/feedback/delete", admin_feedback_bulk_delete, auth="user", rate=_rate_user("adm-fb-bulk", 60, 3600))
add("DELETE", "/api/admin/feedback/{id}", admin_feedback_delete, auth="user", rate=_rate_user("adm-fb-del", 200, 3600))
add("GET", "/api/admin/tickets", admin_tickets, auth="user")
add("POST", "/api/admin/tickets/{id}", admin_ticket_close, auth="user")
add("GET", "/api/admin/users", admin_users, auth="user")
add("POST", "/api/admin/users/{id}", admin_user_act, auth="user", rate=_rate("admin-act", 120, 600))


# ---------------------------------------------------------------- automation and cron

_N8N = obj(action=enum("ping", "create_job", "grant_plan", "close_ticket"), email=optional(string(max=200, lower=True)), courseId=optional(string(max=100)),
           topicIds=optional(array(string(max=100), max=60)), images=optional(boolean()), instructions=optional(string(max=1000)),
           plan=optional(enum("learner", "classroom")), days=optional(number(int_=True, min=1, max=366)), ticketId=optional(string(max=40)))


def _user_by_email(email):
    if not email:
        raise ApiError(422, "invalid_input", "email is required.")
    st = storemod.get_store()
    idx = st.get("emails", email)
    u = st.get("users", idx["uid"]) if idx else None
    if not u:
        raise not_found("That user")
    return u


def n8n(ctx: Ctx):
    raw = ctx.req.body.decode("utf-8", "replace")
    if not integ.verify_inbound(ctx.req, raw):
        raise ApiError(401, "unauthenticated", "Bad automation credentials.")
    try:
        parsed = json.loads(raw or "{}")
    except ValueError:
        raise ApiError(400, "bad_json", "Body is not JSON.") from None
    b = _N8N(parsed, "")
    st = storemod.get_store()
    if b["action"] == "ping":
        return {"ok": True}
    if b["action"] == "create_job":
        u = _user_by_email(b["email"])
        if not b["courseId"]:
            raise ApiError(422, "invalid_input", "courseId is required.")
        job = jobs.create_job(u, b["courseId"], b["topicIds"], bool(b["images"]), b["instructions"])
        bg.background(lambda: jobs.run_job(job["id"]))
        return json_out({"job": jobs.public_job(job)}, 202)
    if b["action"] == "grant_plan":
        u = _user_by_email(b["email"])
        if not b["plan"] or not b["days"]:
            raise ApiError(422, "invalid_input", "plan and days are required.")
        now = time.time() * 1000
        frm = u["planUntil"] if authmod.effective_plan(u) == b["plan"] and u.get("planUntil") else now
        until = frm + b["days"] * 86_400_000
        st.update("users", u["id"], lambda c: {**c, "plan": b["plan"], "planUntil": until} if c else c)
        log("info", "automation.grant_plan", uid=u["id"], plan=b["plan"], days=b["days"])
        return {"ok": True, "planUntil": until}
    if not b["ticketId"]:
        raise ApiError(422, "invalid_input", "ticketId is required.")
    if not st.update("tickets", b["ticketId"], lambda c: {**c, "status": "closed"} if c else c):
        raise not_found("That ticket")
    return {"ok": True}


add("POST", "/api/automation/n8n", n8n, auth="none", csrf=False, max_body=64 * 1024, rate={"name": "n8n", "limit": 120, "windowSec": 60})


def cron(ctx: Ctx):
    if not _trusted(ctx):
        raise ApiError(401, "unauthenticated", "Bad cron credentials.")
    return maintenance.tick()


add("GET", "/api/internal/cron", cron, auth="none", csrf=False)
add("POST", "/api/internal/cron", cron, auth="none", csrf=False)


# ---------------------------------------------------------------- community: posts, comments, messages, reports
_POST = obj(text=string(min=1, max=community.POST_MAX, trim=False), topic=optional(string(max=80)))
_COMMENT = obj(text=string(min=1, max=community.COMMENT_MAX, trim=False))
_DM = obj(text=string(min=1, max=community.DM_MAX, trim=False))
_REPORT = obj(kind=enum("post", "comment", "message"), targetId=string(min=1, max=120), reason=enum(*community.REASONS), detail=optional(string(max=500)))


def feed_get(ctx: Ctx):
    q = ctx.req.query
    try:
        before = float(q["before"]) if q.get("before") else None
    except ValueError:
        before = None
    return community.feed(ctx.user, "following" if q.get("scope") == "following" else "all", before, 20)


add("GET", "/api/posts", feed_get, auth="user")
add("POST", "/api/posts", lambda ctx: (lambda b: json_out(community.create_post(ctx.user, b["text"], b["topic"]), 201))(ctx.json(_POST)), auth="user", rate=_rate("post", 20, 3600))
add("GET", "/api/posts/{id}", lambda ctx: community.get_post(ctx.user, safe_id(ctx.params["id"])), auth="user")
add("DELETE", "/api/posts/{id}", lambda ctx: community.delete_post(ctx.user, safe_id(ctx.params["id"])), auth="user")
add("POST", "/api/posts/{id}/like", lambda ctx: community.toggle_like(ctx.user, safe_id(ctx.params["id"])), auth="user", rate=_rate("like", 300, 3600))
add("POST", "/api/posts/{id}/comments", lambda ctx: (lambda b: json_out(community.add_comment(ctx.user, safe_id(ctx.params["id"]), b["text"]), 201))(ctx.json(_COMMENT)),
    auth="user", rate=_rate("comment", 60, 3600))
add("DELETE", "/api/comments/{id}", lambda ctx: community.delete_comment(ctx.user, safe_id(ctx.params["id"])), auth="user")
add("POST", "/api/people/{handle}/block", lambda ctx: community.toggle_block(ctx.user, ctx.params["handle"]), auth="user", rate=_rate("block", 60, 3600))
add("POST", "/api/reports", lambda ctx: (lambda b: community.report(ctx.user, b["kind"], b["targetId"], b["reason"], b["detail"] or ""))(ctx.json(_REPORT)), auth="user")
add("GET", "/api/messages", lambda ctx: {"conversations": community.inbox(ctx.user)}, auth="user")
add("GET", "/api/messages/{handle}", lambda ctx: community.thread(ctx.user, ctx.params["handle"]), auth="user")
add("POST", "/api/messages/{handle}", lambda ctx: (lambda b: json_out(community.send_message(ctx.user, ctx.params["handle"], b["text"]), 201))(ctx.json(_DM)),
    auth="user", rate=_rate("dm", 60, 3600))


def admin_reports_get(ctx: Ctx):
    _admin(ctx)
    return {"reports": community.admin_reports("closed" if ctx.req.query.get("status") == "closed" else "open")}


def admin_report_act(ctx: Ctx):
    _admin(ctx)
    b = ctx.json(obj(action=enum("dismiss", "hide", "remove", "block_author")))
    return community.admin_act(ctx.user, safe_id(ctx.params["id"]), b["action"])


add("GET", "/api/admin/reports", admin_reports_get, auth="user")
add("POST", "/api/admin/reports/{id}", admin_report_act, auth="user", rate=_rate("admin-report", 200, 600))


add("GET", "/api/network", lambda ctx: netquality.assess(ctx.req), auth="none")
