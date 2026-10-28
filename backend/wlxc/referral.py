"""Share the platform with friends: a personal link and QR code, 10% off a first purchase for the friend, and 10% off for the person who
shared it once that friend has paid. One discount per purchase (they do not stack); nothing is given until money has actually arrived."""
from __future__ import annotations

import base64
import hashlib
import time

from .config import env
from .errors import ApiError
from .store import get_store

PCT = 10
MAX_VOUCHERS = 12  # a ceiling on stored discounts so the programme cannot be farmed into free plans


def code_of(uid: str) -> str:
    c = base64.b32encode(hashlib.sha256(uid.encode()).digest())[:8].decode()
    get_store().insert("refcodes", c, {"id": c, "uid": uid})
    return c


def attach(new_uid: str, code: str | None) -> bool:
    """Remembers who sent a new account here. An unknown code is ignored, never an error: it must not break sign-up."""
    if not code:
        return False
    hit = get_store().get("refcodes", code.strip().upper()[:12])
    if not hit or hit["uid"] == new_uid:
        return False
    get_store().update("users", new_uid, lambda u: {**u, "referredBy": hit["uid"]} if u and not u.get("referredBy") else u)
    return True


def _vouchers(uid: str) -> int:
    return int((get_store().get("vouchers", uid) or {}).get("n", 0))


def pending_discount(user: dict) -> tuple[int, str]:
    """(percent, kind) for the next purchase: a friend's welcome discount, else a voucher earned by sharing, else nothing."""
    if user.get("referredBy") and not user.get("refUsed"):
        return PCT, "friend"
    if _vouchers(user["id"]) > 0:
        return PCT, "voucher"
    return 0, ""


def price_paise(user: dict, rupees: float) -> tuple[int, int, str]:
    pct, kind = pending_discount(user)
    return round(rupees * 100 * (100 - pct) / 100), pct, kind


def on_paid(order: dict) -> None:
    """Called once per paid order: uses the discount the order carried and credits the person who shared."""
    kind = order.get("discountKind")
    if not kind:
        return
    st = get_store()
    uid = order["uid"]
    if kind == "friend":
        u = st.get("users", uid) or {}
        st.update("users", uid, lambda c: {**c, "refUsed": True} if c else c)
        ref = u.get("referredBy")
        if ref and st.get("users", ref):
            st.update("vouchers", ref, lambda c: {"id": ref, "n": min(MAX_VOUCHERS, int((c or {}).get("n", 0)) + 1), "earned": int((c or {}).get("earned", 0)) + 1})
    else:
        st.update("vouchers", uid, lambda c: {**(c or {"id": uid, "earned": 0}), "n": max(0, int((c or {}).get("n", 0)) - 1)})


def summary(user: dict) -> dict:
    uid = user["id"]
    code = code_of(uid)
    friends = get_store().find("users", where={"referredBy": uid}, limit=500)
    pct, kind = pending_discount(user)
    v = get_store().get("vouchers", uid) or {}
    return {"code": code, "link": f"{env().app_url}/register?ref={code}", "percent": PCT, "joined": len(friends),
            "paid": int(v.get("earned", 0)), "vouchers": int(v.get("n", 0)), "next": {"percent": pct, "kind": kind}}
