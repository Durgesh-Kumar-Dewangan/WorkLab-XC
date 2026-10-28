"""A receipt for every paid order, in any currency, whichever gateway took the money. Indian rupee payments also get the GST tax invoice (invoices.py);
this is the plain proof of payment: who paid, what for, how much, the country it was priced for, the payment id, and whether it renews."""
from __future__ import annotations

import html
import time
from datetime import datetime, timezone

from .addons import SKU_INFO
from .config import env
from .errors import forbidden, not_found
from .geo import COUNTRIES
from .store import get_store

PLAN_NAMES = {"learner": "Beta", "plus": "Beta Plus", "classroom": "Classroom", "prototype": "Free"}


def _amount(minor: int, cur: str) -> str:
    return f"₹{minor / 100:,.2f}" if cur == "INR" else f"${minor / 100:,.2f} {cur}"


def _date(ms: float | None) -> str:
    return datetime.fromtimestamp((ms or time.time() * 1000) / 1000, timezone.utc).strftime("%d %b %Y")


def get_for(user: dict, order_id: str) -> dict:
    st = get_store()
    o = st.get("orders", order_id)
    if not o:
        raise not_found("That receipt")
    if o["uid"] != user["id"]:
        raise forbidden()
    if o.get("status") != "paid":
        raise not_found("That receipt")
    p = st.get("purchases", order_id) or {}
    what = SKU_INFO[o["sku"]]["name"] if o.get("sku") else f"{PLAN_NAMES.get(o['plan'], o['plan'])} plan ({'yearly' if o.get('billing') == 'year' else 'monthly'})"
    c = o.get("country") or ""
    return {"number": f"RCP-{order_id[-10:].upper()}", "orderId": order_id, "item": what, "amountMinor": o["amountPaise"], "currency": o["currency"],
            "country": c, "countryName": COUNTRIES.get(c, ("", 0, 0))[0], "gateway": o.get("gateway") or "razorpay", "paymentId": o.get("paymentId") or p.get("paymentId") or "",
            "paidAt": o.get("paidAt"), "activeUntil": p.get("activeUntil"), "renews": bool(o.get("subscriptionId")), "renewal": bool(o.get("renewal")),
            "discountPct": o.get("discountPct") or 0, "name": user["name"], "email": user["email"]}


def render_html(r: dict) -> str:
    e = html.escape
    seller = env().gst.seller_name
    rows = [("Receipt number", r["number"]), ("Date", _date(r["paidAt"])), ("Billed to", f"{r['name']} ({r['email']})"),
            ("Region", f"{r['countryName']} ({r['country']})" if r["country"] else "Not recorded"), ("Item", r["item"])]
    if r["activeUntil"]:
        rows.append(("Active until", _date(r["activeUntil"])))
    if r["discountPct"]:
        rows.append(("Discount", f"{r['discountPct']}% referral discount"))
    rows += [("Paid with", "PayPal" if r["gateway"] == "paypal" else "Razorpay"), ("Payment id", r["paymentId"] or "Confirming"), ("Order", r["orderId"])]
    if r["renews"]:
        rows.append(("Renewal", "This plan renews automatically each period until you cancel it in Settings. You keep access until the end of the paid period."))
    body = "".join(f"<tr><th>{e(k)}</th><td>{e(v)}</td></tr>" for k, v in rows)
    return f"""<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Receipt {e(r['number'])}</title>
<style>body{{font:15px/1.5 system-ui,sans-serif;max-width:640px;margin:32px auto;padding:0 16px;color:#0f172a}}h1{{font-size:22px;margin:0}}.tot{{font-size:30px;font-weight:700;margin:16px 0}}
table{{width:100%;border-collapse:collapse}}th,td{{text-align:left;padding:8px 0;border-bottom:1px solid #e2e8f0;vertical-align:top}}th{{width:160px;color:#475569;font-weight:600}}
.tag{{display:inline-block;padding:2px 10px;border-radius:99px;background:#e0e7ff;font-size:12px}}@media print{{button{{display:none}}}}</style>
<h1>{e(seller)}</h1><p>Receipt for your payment <span class=tag>{e(r['country'] or 'no region')}</span></p>
<div class=tot>{e(_amount(r['amountMinor'], r['currency']))}</div><table>{body}</table>
<p style="margin-top:24px">To keep a copy, use your browser's Print and choose Save as PDF.</p></html>"""
