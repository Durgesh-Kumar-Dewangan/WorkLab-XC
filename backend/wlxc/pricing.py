"""Regional prices. India pays in rupees at the prices in the settings. Everywhere else pays in US dollars at one of three levels that follow what
people there can comfortably spend, set so every sale still covers the card fees, the AI and the servers for that learner.

The country comes from the visitor's connection, so a VPN can change it; the amount a person is charged is fixed on their order when they
start paying, and the payment is checked against that amount."""
from __future__ import annotations

import math

# level A: higher-income countries, B: middle, C: lower. A country not listed here is charged at level B.
_A = "US CA GB IE AU NZ DE FR NL BE CH AT SE NO DK FI IS IT ES PT JP KR SG HK TW AE SA QA KW BH OM IL"
_C = ("PK BD LK NP BT MV AF NG GH KE ET TZ UG ZM ZW SN CM CI EG MA DZ TN UA VN PH ID KH MM LA MN UZ BO PY VE")
TIER_A, TIER_C = set(_A.split()), set(_C.split())

# monthly and yearly, in US dollars
PLAN_USD = {
    "learner": {"A": (3.99, 29.0), "B": (2.49, 19.0), "C": (1.49, 12.0)},
    "plus": {"A": (4.99, 42.0), "B": (3.29, 28.0), "C": (2.29, 19.0)},
}
# add-ons at level A; B and C are a share of it, rounded up to a price ending in 9
ADDON_USD_A = {"unit_notes": 0.49, "monthly_notes": 1.49, "pack": 1.99, "noads": 0.49, "chatbot": 0.99}
ADDON_SHARE = {"A": 1.0, "B": 0.7, "C": 0.5}
FLOOR_USD = 0.29


def tier(country: str) -> str:
    c = (country or "").upper()
    return "A" if c in TIER_A else "C" if c in TIER_C else "B"


def region(country: str) -> dict:
    c = (country or "IN").upper()
    if c == "IN":
        return {"country": "IN", "currency": "INR", "symbol": "₹", "tier": "IN"}
    return {"country": c, "currency": "USD", "symbol": "$", "tier": tier(c)}


def _charm(v: float) -> float:
    return max(FLOOR_USD, round(math.ceil(v * 10 - 1e-9) / 10 - 0.01, 2))


def plan_amount(country: str, plan: str, billing: str):
    """What a plan costs in the visitor's currency, in whole units (rupees or dollars), or None if it is not for sale."""
    from .plans import price_inr
    r = region(country)
    if r["currency"] == "INR":
        return price_inr(plan, billing)
    row = PLAN_USD.get(plan)
    return row[r["tier"]][0 if billing == "month" else 1] if row else None


def sku_amount(country: str, sku: str):
    from .addons import sku_price
    r = region(country)
    if r["currency"] == "INR":
        return sku_price(sku)
    if not sku_price(sku):  # an add-on switched off in the settings stays off everywhere
        return None
    a = ADDON_USD_A.get(sku)
    return None if a is None else (a if r["tier"] == "A" else _charm(a * ADDON_SHARE[r["tier"]]))


def minor(amount: float) -> int:
    """Paise or cents."""
    return round(amount * 100)
