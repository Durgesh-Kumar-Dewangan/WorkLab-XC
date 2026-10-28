"""GST tax invoices for every paid order: gapless-per-year numbering, CGST+SGST (same state) or IGST (other state), HTML and PDF.

Check the SAC code, rate, place-of-supply rules and wording with your chartered accountant before charging real customers;
the defaults here (18%, SAC 998439, price includes GST) are common for online content but are yours to confirm."""
from __future__ import annotations

import io
import re
import time
from datetime import datetime, timedelta, timezone
from html import escape

from .config import env
from .errors import ApiError, not_found
from .store import get_store

IST = timezone(timedelta(hours=5, minutes=30))
STATE_NAMES = {"01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
               "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
               "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
               "24": "Gujarat", "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala",
               "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh"}
GSTIN = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")


def fy_of(ms: float) -> str:
    d = datetime.fromtimestamp(ms / 1000, IST)
    y = d.year if d.month >= 4 else d.year - 1
    return f"{y}-{str(y + 1)[2:]}"


def split_tax(total_paise: int, rate: float, inclusive: bool, intra: bool) -> dict:
    """All amounts in paise, rounded so the parts always add up to the total."""
    if inclusive:
        taxable = round(total_paise * 100 / (100 + rate))
        tax = total_paise - taxable
        total = total_paise
    else:
        taxable = total_paise
        tax = round(total_paise * rate / 100)
        total = taxable + tax
    if intra:
        cgst = tax // 2
        return {"taxable": taxable, "cgst": cgst, "sgst": tax - cgst, "igst": 0, "total": total}
    return {"taxable": taxable, "cgst": 0, "sgst": 0, "igst": tax, "total": total}


def buyer_details(user: dict) -> dict:
    b = user.get("billingDetails") or {}
    return {"name": b.get("name") or user["name"], "gstin": b.get("gstin") or "", "stateCode": b.get("stateCode") or "", "address": b.get("address") or "", "email": user["email"]}


def save_billing_details(user: dict, name: str, gstin: str, state_code: str, address: str) -> dict:
    gstin = gstin.strip().upper()
    if gstin:
        if not GSTIN.match(gstin):
            raise ApiError(422, "bad_gstin", "That GSTIN does not look right. It has 15 characters, like 07AABCU9603R1ZX.")
        state_code = state_code or gstin[:2]
        if gstin[:2] != state_code:
            raise ApiError(422, "gstin_state_mismatch", "The first two digits of the GSTIN must match the state.")
    if state_code and state_code not in STATE_NAMES:
        raise ApiError(422, "bad_state", "Choose a valid state.")
    d = {"name": name.strip()[:120], "gstin": gstin, "stateCode": state_code, "address": address.strip()[:300]}
    get_store().update("users", user["id"], lambda c: {**c, "billingDetails": d} if c else c)
    return d


def _next_number(fy: str) -> str:
    c = env().gst
    n = get_store().update("counters", f"invoice:{fy}", lambda x: {"n": (x or {}).get("n", 0) + 1})["n"]
    return f"{c.prefix}/{fy}/{n:06d}"


def create_for_order(order: dict, user: dict | None, payment_id: str | None = None) -> dict | None:
    """Idempotent: one invoice per order. Returns None when invoicing is switched off or there is no one to bill."""
    cfg = env().gst
    if not cfg.enabled or not user:
        return None
    st = get_store()
    existing = st.get("invoices", order["id"])
    if existing:
        return existing
    now = time.time() * 1000
    buyer = buyer_details(user)
    seller_state = cfg.seller_state
    place = buyer["stateCode"] or seller_state
    amounts = split_tax(order["amountPaise"], cfg.rate, cfg.inclusive, place == seller_state)
    label = (order.get("sku") and f"Add-on: {order['sku'].replace('_', ' ')}") or f"WorkLab XC {order['plan']} plan ({'monthly' if order.get('billing') == 'month' else 'yearly'})"
    inv = {"id": order["id"], "uid": user["id"], "number": _next_number(fy_of(now)), "issuedAt": now, "orderId": order["id"], "paymentId": payment_id or order.get("paymentId"),
           "description": label, "sac": cfg.sac, "ratePercent": cfg.rate, "placeOfSupply": place, "intra": place == seller_state, **amounts,
           "seller": {"name": cfg.seller_name, "gstin": cfg.seller_gstin, "address": cfg.seller_address, "stateCode": seller_state},
           "buyer": buyer, "currency": "INR", "created": now}
    if not st.insert("invoices", order["id"], inv):
        return st.get("invoices", order["id"])
    return inv


def list_for(user: dict) -> list[dict]:
    rows = get_store().find("invoices", where={"uid": user["id"]}, order_by="issuedAt", desc=True, limit=200)
    return [{k: r[k] for k in ("id", "number", "issuedAt", "description", "total", "currency")} for r in rows]


def get_for(user: dict, id: str) -> dict:
    inv = get_store().get("invoices", id)
    if not inv or inv["uid"] != user["id"]:
        raise not_found("That invoice")
    return inv


def _rs(p: int) -> str:
    return f"{p // 100:,}.{p % 100:02d}"


def _date(ms: float) -> str:
    return datetime.fromtimestamp(ms / 1000, IST).strftime("%d %b %Y")


def render_html(inv: dict) -> str:
    e = escape
    s, b = inv["seller"], inv["buyer"]
    rows = [("Taxable value", inv["taxable"])]
    rows += [(f"CGST @ {inv['ratePercent'] / 2:g}%", inv["cgst"]), (f"SGST @ {inv['ratePercent'] / 2:g}%", inv["sgst"])] if inv["intra"] else [(f"IGST @ {inv['ratePercent']:g}%", inv["igst"])]
    tax_rows = "".join(f"<tr><td>{e(n)}</td><td class=r>₹{_rs(v)}</td></tr>" for n, v in rows)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tax invoice {e(inv['number'])}</title>
<style>body{{font:15px/1.5 system-ui,Segoe UI,Arial,sans-serif;color:#111;margin:0;padding:24px;background:#fff}}main{{max-width:760px;margin:auto}}h1{{font-size:22px;margin:0 0 4px}}
table{{width:100%;border-collapse:collapse;margin:16px 0}}td,th{{padding:8px;border-bottom:1px solid #ddd;text-align:left}}.r{{text-align:right}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:24px}}
@media(max-width:560px){{.grid{{grid-template-columns:1fr}}}}.muted{{color:#555;font-size:13px}}@media print{{body{{padding:0}}}}</style></head><body><main>
<h1>Tax invoice</h1><p class=muted>No. {e(inv['number'])} · Date {e(_date(inv['issuedAt']))} · Order {e(inv['orderId'])}</p>
<div class=grid><section><strong>{e(s['name'])}</strong><br>{e(s['address'])}<br>{'GSTIN ' + e(s['gstin']) if s['gstin'] else ''}<br>State: {e(STATE_NAMES.get(s['stateCode'], s['stateCode']))} ({e(s['stateCode'])})</section>
<section><strong>Billed to: {e(b['name'])}</strong><br>{e(b['address'])}<br>{e(b['email'])}<br>{'GSTIN ' + e(b['gstin']) if b['gstin'] else 'Unregistered customer'}<br>Place of supply: {e(STATE_NAMES.get(inv['placeOfSupply'], inv['placeOfSupply']))} ({e(inv['placeOfSupply'])})</section></div>
<table><tr><th>Description</th><th>SAC</th><th class=r>Amount</th></tr><tr><td>{e(inv['description'])}</td><td>{e(inv['sac'])}</td><td class=r>₹{_rs(inv['taxable'])}</td></tr></table>
<table>{tax_rows}<tr><th>Total</th><th class=r>₹{_rs(inv['total'])}</th></tr></table>
<p class=muted>Online information and database access or retrieval services. Reverse charge: No. This is a computer-generated invoice and does not need a signature. Payment reference: {e(inv.get('paymentId') or '-')}.</p>
</main></body></html>"""


def render_pdf(inv: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from reportlab.lib import colors

    ss = getSampleStyleSheet()
    s, b = inv["seller"], inv["buyer"]
    P = lambda t, st="BodyText": Paragraph(escape(t).replace("\n", "<br/>"), ss[st])  # noqa: E731
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm, title=f"Tax invoice {inv['number']}")
    story = [P("Tax invoice", "Title"), P(f"No. {inv['number']}   Date {_date(inv['issuedAt'])}   Order {inv['orderId']}"), Spacer(1, 6 * mm)]
    sel = f"{s['name']}\n{s['address']}\n" + (f"GSTIN {s['gstin']}\n" if s["gstin"] else "") + f"State: {STATE_NAMES.get(s['stateCode'], s['stateCode'])} ({s['stateCode']})"
    buy = f"Billed to: {b['name']}\n{b['address']}\n{b['email']}\n" + (f"GSTIN {b['gstin']}" if b["gstin"] else "Unregistered customer") + f"\nPlace of supply: {STATE_NAMES.get(inv['placeOfSupply'], inv['placeOfSupply'])} ({inv['placeOfSupply']})"
    t = Table([[P(sel), P(buy)]], colWidths=[87 * mm, 87 * mm])
    story += [t, Spacer(1, 6 * mm)]
    lines = [["Description", "SAC", "Amount (INR)"], [P(inv["description"]), inv["sac"], _rs(inv["taxable"])]]
    if inv["intra"]:
        lines += [[f"CGST @ {inv['ratePercent'] / 2:g}%", "", _rs(inv["cgst"])], [f"SGST @ {inv['ratePercent'] / 2:g}%", "", _rs(inv["sgst"])]]
    else:
        lines += [[f"IGST @ {inv['ratePercent']:g}%", "", _rs(inv["igst"])]]
    lines += [["Total", "", _rs(inv["total"])]]
    tb = Table(lines, colWidths=[110 * mm, 24 * mm, 40 * mm])
    tb.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.3, colors.grey), ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke), ("ALIGN", (2, 0), (2, -1), "RIGHT"),
                            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story += [tb, Spacer(1, 6 * mm), P("Online information and database access or retrieval services. Reverse charge: No. Computer-generated invoice; no signature needed. "
                                       f"Payment reference: {inv.get('paymentId') or '-'}.")]
    doc.build(story)
    return buf.getvalue()
