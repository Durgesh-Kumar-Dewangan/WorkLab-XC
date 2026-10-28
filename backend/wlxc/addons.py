"""Things a person can buy on top of a plan: unit notes, the monthly notes plan, and the AI class chat."""
from __future__ import annotations

import time

from . import usage
from .config import env
from .errors import ApiError
from .store import get_store

SKUS = ["unit_notes", "monthly_notes", "chatbot", "noads", "pack"]
STORED = ["unit_notes", "monthly_notes", "chatbot", "noads"]  # "pack" is bought as one item and stored as its two parts
DAY = 86_400_000

SKU_INFO = {
    "unit_notes": {"name": "Unit notes by marks", "description": "Exam notes for one unit, organised by 1, 2, 3, 5 and 10 marks to your blueprint.", "priceKey": "unit_notes"},
    "monthly_notes": {"name": "Unlimited notes (monthly)", "description": "Marks-weighted notes for as many units as you like for 30 days.", "priceKey": "monthly_notes"},
    "chatbot": {"name": "AI class chat", "description": "Ask questions inside any lesson, answered from that lesson.", "priceKey": "chatbot_month"},
    "noads": {"name": "Ad-free", "description": "Hide all ads on the free plan for 30 days, in the classroom and everywhere else.", "priceKey": "noads_month"},
    "pack": {"name": "Study pack", "description": "AI class chat and unlimited notes together for 30 days, at a lower price than buying them apart.", "priceKey": "pack_month",
             "parts": ["chatbot", "monthly_notes"]},
}


def _id(uid: str, sku: str) -> str:
    return f"{uid}:{sku}"


def _now() -> float:
    return time.time() * 1000


def sku_price(sku: str):
    return getattr(env().price, SKU_INFO[sku]["priceKey"], 0) or None


def grant(uid: str, sku: str, quantity: int | None = None, days: int | None = None) -> dict:
    """Adds what a purchase (or an admin) grants. Time-based items extend from the later of now and the current end."""
    if sku == "pack":
        grant(uid, "chatbot", days=days)
        return grant(uid, "monthly_notes", quantity=quantity, days=days)
    now = _now()
    defaults = {"unit_notes": (1, 365), "monthly_notes": (env().addons.monthly_notes_units, 30), "chatbot": (0, 30), "noads": (0, 30)}[sku]
    q = defaults[0] if quantity is None else quantity
    d = defaults[1] if days is None else days

    def fn(c):
        live = c and (c.get("validUntil") or float("inf")) > now
        end = c["validUntil"] if c and (c.get("validUntil") or 0) > now else now
        return {"id": _id(uid, sku), "uid": uid, "sku": sku, "quantity": (c["quantity"] if live else 0) + q,
                "validUntil": max(now, end) + d * DAY, "updated": now}

    return get_store().update("entitlements", _id(uid, sku), fn)


def entitlements_of(uid: str) -> list[dict]:
    st, now = get_store(), _now()
    rows = [st.get("entitlements", _id(uid, s)) for s in STORED]
    return [r for r in rows if r and (r.get("validUntil") or float("inf")) > now]


def pricing(sku: str, country: str = "IN") -> dict:
    """The price in the visitor's currency, and for a bundle the price of buying its parts separately with the saving worked out."""
    from . import pricing as pr
    price = pr.sku_amount(country, sku)
    out = {"priceInr": price}
    parts = SKU_INFO[sku].get("parts")
    if parts and price:
        listed = round(sum(pr.sku_amount(country, p) or 0 for p in parts), 2)
        if listed > price:
            out.update(listPriceInr=listed, saveInr=round(listed - price, 2), savePct=round((listed - price) / listed * 100))
    return out


def has(uid: str, sku: str) -> bool:
    from . import byok

    if sku in ("chatbot", "monthly_notes", "unit_notes") and byok.active(uid):
        return True
    e = get_store().get("entitlements", _id(uid, sku))
    if not e or (e.get("validUntil") or float("inf")) <= _now():
        return False
    return sku in ("chatbot", "noads") or e["quantity"] > 0


class _Empty(Exception):
    pass


def consume_notes(uid: str) -> str:
    """Spends one unit of monthly_notes or unit_notes (monthly first, since it expires). Raises 402 when nothing is left."""
    from . import byok

    if byok.active(uid):
        return "byok"
    st = get_store()
    for sku in ("monthly_notes", "unit_notes"):
        def fn(c):
            if not c or (c.get("validUntil") or float("inf")) <= _now() or c["quantity"] < 1:
                raise _Empty()
            return {**c, "quantity": c["quantity"] - 1, "updated": _now()}

        try:
            st.update("entitlements", _id(uid, sku), fn)
            return sku
        except _Empty:
            continue
    # nothing bought: use one of the free uses each month
    if usage.consume_month(uid, "freenotes", env().addons.free_notes_per_month):
        return "free"
    from . import rewards

    if rewards.use_bonus(uid, "notes"):
        return "bonus"
    n = env().addons.free_notes_per_month
    raise ApiError(402, "addon_required", f"You have used this month's {n} free unit notes. Buy one unit, or the unlimited monthly plan, to continue.", {"sku": "unit_notes"})


def refund_notes(uid: str, sku: str) -> None:
    if sku == "bonus":
        from . import rewards

        rewards.refund_bonus(uid, "notes")
        return
    if sku == "byok":
        return
    if sku == "free":
        usage.refund_month(uid, "freenotes")
        return
    get_store().update("entitlements", _id(uid, sku), lambda c: {**c, "quantity": c["quantity"] + 1} if c else c)


def chat_access(uid: str) -> str:
    """"paid" when the chat add-on is active, "free" after spending one of this month's free questions, else 402."""
    if has(uid, "chatbot"):
        return "paid"
    if usage.consume_month(uid, "freechat", env().addons.free_chat_per_month):
        return "free"
    from . import rewards

    if rewards.use_bonus(uid, "chat"):
        return "bonus"  # a question bought with gems
    n = env().addons.free_chat_per_month
    raise ApiError(402, "addon_required", f"You have used this month's {n} free questions. Add the AI class chat to keep asking.", {"sku": "chatbot"})
