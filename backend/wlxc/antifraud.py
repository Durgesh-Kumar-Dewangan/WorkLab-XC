"""Sign-up abuse controls beyond the IP rules: one account per real mailbox, disposable-mail blocking, a cap on accounts per
device, country allow/block lists, and optional phone (SMS code) verification with one account per phone number.

None of this is perfect: a device id lives in a cookie and a client-side fingerprint is only a hint, so a determined person
can still get around them. They raise the cost of making many accounts; they do not make it impossible."""
from __future__ import annotations

import hmac
import re
import secrets
import time

from . import abuse, ipintel
from .auth import effective_plan
from .config import env
from .crypto import sha256
from .errors import ApiError
from .net import http
from .store import get_store
from .web import Req, log, rate_limit

DID_COOKIE = "wlxc_did"
OTP_TTL_MS = 10 * 60_000
OTP_MAX_TRIES = 5

DISPOSABLE = frozenset("""mailinator.com guerrillamail.com guerrillamail.net guerrillamail.org guerrillamailblock.com sharklasers.com grr.la
10minutemail.com 10minutemail.net 20minutemail.com temp-mail.org temp-mail.io tempmail.com tempmail.net tempmailo.com tempail.com
throwawaymail.com trashmail.com trashmail.net yopmail.com yopmail.net yopmail.fr getnada.com nada.email maildrop.cc mailnesia.com
dispostable.com fakeinbox.com mintemail.com mytemp.email emailondeck.com burnermail.io spamgourmet.com mohmal.com moakt.com
discard.email discardmail.com anonbox.net harakirimail.com tmail.ws tmpmail.org tmpmail.net minuteinbox.com fakemail.net
inboxkitten.com mailcatch.com mail-temp.com cs.email emailfake.com email-fake.com luxusmail.org byom.de jetable.org""".split())


def canonical_email(email: str) -> str:
    """One mailbox, one account: strips +tags everywhere and dots/googlemail aliasing for Gmail."""
    e = email.strip().lower()
    local, _, domain = e.rpartition("@")
    local = local.split("+", 1)[0]
    if domain in ("gmail.com", "googlemail.com"):
        local, domain = local.replace(".", ""), "gmail.com"
    return f"{local}@{domain}"


def assert_real_email(email: str) -> None:
    f = env().fraud
    domain = email.rpartition("@")[2].lower()
    if f.block_disposable and (domain in DISPOSABLE or domain in f.disposable_extra or any(domain.endswith("." + d) for d in DISPOSABLE)):
        raise ApiError(422, "disposable_email", "Please use a permanent email address (not a temporary-mail service).")


# ------------------------------------------------------------------ devices
def device_id(req: Req) -> str | None:
    h = req.header("cookie") or ""
    for part in h.split(";"):
        k, _, v = part.strip().partition("=")
        if k == DID_COOKIE and re.fullmatch(r"[A-Za-z0-9_-]{20,64}", v):
            return v
    return None


def device_keys(req: Req) -> list[str]:
    keys = []
    d = device_id(req)
    if d:
        keys.append("d:" + sha256(d))
    fp = (req.header("x-wlxc-fp") or "").strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{16,128}", fp):
        keys.append("f:" + sha256(fp))
    return keys


def new_device_cookie(req: Req) -> tuple[str, str]:
    """Returns (device id, Set-Cookie value). Reuses the id the browser already has."""
    d = device_id(req) or secrets.token_urlsafe(24)
    secure = "; Secure" if env().app_url.startswith("https://") else ""
    return d, f"{DID_COOKIE}={d}; Path=/; HttpOnly; SameSite=Lax; Max-Age={2 * 365 * 86400}{secure}"


def check_device_before_signup(req: Req, extra_key: str | None = None) -> None:
    cap = env().fraud.device_max_accounts
    if cap <= 0:
        return
    st = get_store()
    for k in device_keys(req):
        doc = st.get("devices", k)
        if doc and len(doc.get("uids", [])) >= cap:
            raise ApiError(403, "device_limit", f"This device already has {cap} accounts. Sign in to one of them, or write to {env().mail.support}.",
                           {"appeal": env().mail.support})


def record_device(req: Req, uid: str, did: str) -> None:
    st = get_store()
    keys = device_keys(req) or []
    if "d:" + sha256(did) not in keys:
        keys.append("d:" + sha256(did))
    for k in keys:
        st.update("devices", k, lambda c: {"uids": sorted(set((c or {}).get("uids", [])) | {uid}), "last": time.time() * 1000})


# ------------------------------------------------------------------ country
def country_of(req: Req) -> str | None:
    for h in ("cf-ipcountry", "x-vercel-ip-country", "cloudfront-viewer-country", "x-country-code", "x-appengine-country"):
        v = (req.header(h) or "").strip().upper()
        if re.fullmatch(r"[A-Z]{2}", v) and v not in ("XX", "T1"):
            return v
    return None


def assert_country_ok(req: Req) -> None:
    f = env().fraud
    if not f.country_allow and not f.country_block:
        return
    c = country_of(req)
    if c is None:
        if f.country_fail_closed:
            raise ApiError(403, "country_unknown", "We could not tell where you are connecting from.", {"appeal": env().mail.support})
        return
    if c in f.country_block or (f.country_allow and c not in f.country_allow):
        raise ApiError(403, "country_blocked", "WorkLab XC is not available in your region right now.", {"country": c, "appeal": env().mail.support})


# ------------------------------------------------------------------ phone verification
def normalize_phone(raw: str) -> str:
    d = re.sub(r"[\s\-().]", "", raw or "")
    if d.startswith("00"):
        d = "+" + d[2:]
    if not d.startswith("+"):
        d = d.lstrip("0")
        d = "+" + (env().fraud.default_cc + d if len(d) <= 10 else d)
    if not re.fullmatch(r"\+[1-9]\d{7,14}", d):
        raise ApiError(422, "bad_phone", "Enter a valid mobile number with country code, for example +91 98765 43210.")
    return d


def sms_enabled() -> bool:
    f = env().fraud
    if f.sms_provider == "console":
        return not env().prod
    if f.sms_provider == "msg91":
        return bool(f.msg91_key and f.msg91_template)
    if f.sms_provider == "twilio":
        return bool(f.twilio_sid and f.twilio_token and f.twilio_from)
    return False


def phone_required_for(user: dict | None) -> bool:
    f = env().fraud
    if f.phone_mode not in ("generation", "signup") or not sms_enabled() or not user:
        return False
    if user.get("phoneVerified"):
        return False
    return not (f.phone_exempt_paid and effective_plan(user) != "prototype")


def send_sms(phone: str, code: str) -> None:
    f = env().fraud
    if f.sms_provider == "console":
        log("info", "sms.console", phone=phone[-4:], code=code)
        return
    if f.sms_provider == "msg91":
        r = http("https://control.msg91.com/api/v5/flow/", "POST", {"authkey": f.msg91_key, "accept": "application/json"},
                 json_body={"template_id": f.msg91_template, "short_url": "0", "recipients": [{"mobiles": phone.lstrip("+"), "otp": code}]}, timeout=10)
    elif f.sms_provider == "twilio":
        from urllib.parse import urlencode
        import base64
        auth = base64.b64encode(f"{f.twilio_sid}:{f.twilio_token}".encode()).decode()
        r = http(f"https://api.twilio.com/2010-04-01/Accounts/{f.twilio_sid}/Messages.json", "POST",
                 {"authorization": f"Basic {auth}", "content-type": "application/x-www-form-urlencoded"},
                 body=urlencode({"To": phone, "From": f.twilio_from, "Body": f"{code} is your WorkLab XC code. It works for 10 minutes. Do not share it."}), timeout=10)
    else:
        raise ApiError(503, "sms_unavailable", "Phone verification is not available right now.")
    if not r.ok:
        log("warn", "sms.send_failed", status=r.status, body=r.text[:160])
        raise ApiError(502, "sms_failed", "We could not send the code. Check the number and try again in a minute.")


def start_phone(user: dict, raw_phone: str) -> dict:
    if not sms_enabled():
        raise ApiError(503, "sms_unavailable", "Phone verification is not switched on.")
    if user.get("phoneVerified"):
        raise ApiError(409, "phone_already_verified", "Your phone is already verified.")
    phone = normalize_phone(raw_phone)
    ph = sha256("phone:" + phone)
    taken = get_store().get("phones", ph)
    if taken and taken["uid"] != user["id"]:
        raise ApiError(409, "phone_taken", "That number is already used by another account.")
    rate_limit(f"otp-user:{user['id']}", 3, 3600)
    rate_limit(f"otp-phone:{ph}", 5, 86_400)
    code = f"{secrets.randbelow(1_000_000):06d}"
    get_store().put("otp", user["id"], {"uid": user["id"], "ph": ph, "code": sha256(f"{user['id']}:{code}"), "exp": time.time() * 1000 + OTP_TTL_MS, "tries": 0, "mask": phone[:3] + "******" + phone[-3:]})
    send_sms(phone, code)
    return {"sent": True, "to": phone[:3] + "******" + phone[-3:], "expiresInSec": OTP_TTL_MS // 1000}


def verify_phone(user: dict, code: str) -> dict:
    st = get_store()
    doc = st.get("otp", user["id"])
    if not doc or doc["exp"] < time.time() * 1000:
        raise ApiError(400, "code_expired", "That code has expired. Ask for a new one.")
    if doc["tries"] >= OTP_MAX_TRIES:
        st.delete("otp", user["id"])
        raise ApiError(429, "too_many_tries", "Too many wrong codes. Ask for a new one.")
    ok = hmac.compare_digest(doc["code"], sha256(f"{user['id']}:{code.strip()}"))
    if not ok:
        st.update("otp", user["id"], lambda c: {**c, "tries": c["tries"] + 1} if c else c)
        raise ApiError(400, "wrong_code", "That code is not right.")
    if not st.insert("phones", doc["ph"], {"uid": user["id"], "at": time.time() * 1000}):
        owner = st.get("phones", doc["ph"])
        if owner and owner["uid"] != user["id"]:
            st.delete("otp", user["id"])
            raise ApiError(409, "phone_taken", "That number is already used by another account.")
    st.update("users", user["id"], lambda c: {**c, "phoneVerified": True, "phoneHash": doc["ph"], "phoneMask": doc["mask"]} if c else c)
    st.delete("otp", user["id"])
    abuse.audit(user["id"], "phone_verified", user["id"])
    return {"verified": True}


# ------------------------------------------------------------------ one gate used by the routes
def gate(req: Req, user: dict | None, scope: str = "generation") -> None:
    """Country list, then VPN check, then (for AI features) phone verification."""
    assert_country_ok(req)
    ipintel.assert_no_vpn(req, user, scope)
    if scope != "auth" and phone_required_for(user):
        raise ApiError(403, "phone_required", "Verify your mobile number to use this feature. It takes a minute and each number can be used on one account.",
                       {"verify": "/app/settings"})
