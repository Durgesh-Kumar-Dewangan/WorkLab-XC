"""Sign in with Google. The browser gets a signed ID token from Google; the server asks Google to confirm it and checks it was
issued for this site's client id, so a token meant for another site is never accepted."""
from __future__ import annotations

import time
from urllib.parse import quote

from .config import env
from .errors import ApiError
from .net import http


def enabled() -> bool:
    return bool(env().google_client_id)


def verify(credential: str) -> dict:
    cid = env().google_client_id
    if not cid:
        raise ApiError(503, "google_off", "Sign in with Google is not set up yet. Use your email and password.")
    try:
        r = http("https://oauth2.googleapis.com/tokeninfo?id_token=" + quote(credential, safe=""), "GET", {}, timeout=8)
    except Exception:  # noqa: BLE001
        raise ApiError(502, "google_unreachable", "Could not reach Google. Try again in a moment.") from None
    if not r.ok:
        raise ApiError(401, "google_invalid", "Google could not confirm that sign-in. Please try again.")
    j = r.json()
    ok = (j.get("aud") == cid and j.get("iss") in ("accounts.google.com", "https://accounts.google.com")
          and str(j.get("email_verified")).lower() == "true" and float(j.get("exp", 0)) > time.time() and j.get("email") and j.get("sub"))
    if not ok:
        raise ApiError(401, "google_invalid", "Google could not confirm that sign-in. Please try again.")
    email = str(j["email"]).lower()
    return {"email": email, "name": (j.get("name") or email.split("@")[0])[:80], "picture": j.get("picture") or "", "sub": str(j["sub"])}
