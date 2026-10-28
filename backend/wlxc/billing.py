"""Payments: hosted Razorpay Payment Links, server-verified, applied exactly once."""
from __future__ import annotations

import base64
import time

from .addons import SKU_INFO, grant, sku_price
from .config import env, integrations
from .crypto import hmac_hex, safe_equal, uuid
from .errors import ApiError, forbidden, not_found
from .integrations import emit
from .mail import send_mail
from .mailtpl import T
from .net import http
from . import paypal, pricing, referral
from .plans import period_days, price_inr
from .store import get_store
from . import invoices

API = "https://api.razorpay.com/v1"
REUSE_WINDOW_MS = 30 * 60_000


def _basic() -> str:
    r = env().razorpay
    return "Basic " + base64.b64encode(f"{r.key_id}:{r.key_secret}".encode()).decode()


def _rz(path: str, method: str = "GET", body: dict | None = None) -> dict:
    try:
        r = http(f"{API}{path}", method, {"authorization": _basic(), "content-type": "application/json"}, json_body=body, timeout=15)
    except Exception:  # noqa: BLE001
        raise ApiError(502, "payments_unreachable", "The payment provider did not respond. Try again in a moment.") from None
    if not r.ok:
        raise ApiError(502, "payments_error", "The payment provider rejected the request.", {} if env().prod else {"detail": r.text[:200]})
    return r.json()


def create_payment_link(amount_paise: int, description: str, reference_id: str, name: str, email: str, notes: dict, callback_url: str, expire_by_sec: int, currency: str = "INR") -> dict:
    """A hosted Razorpay Payment Link: the customer pays on Razorpay's page, so card data never touches this server."""
    return _rz("/payment_links", "POST", {"amount": amount_paise, "currency": currency, "accept_partial": False, "description": description[:2048],
                                          "reference_id": reference_id, "customer": {"name": name[:100], "email": email}, "notify": {"email": True, "sms": False},
                                          "reminder_enable": False, "notes": notes, "callback_url": callback_url, "callback_method": "get", "expire_by": expire_by_sec})


def fetch_payment_link(id: str) -> dict:
    from urllib.parse import quote
    return _rz(f"/payment_links/{quote(id, safe='')}")


def verify_webhook_signature(raw_body: str, signature: str | None) -> bool:
    """x-razorpay-signature = HMAC-SHA256(raw body, webhook secret), hex."""
    secret = env().razorpay.webhook_secret
    return bool(secret and signature and safe_equal(hmac_hex(secret, raw_body), signature))


def verify_return_signature(link_id: str, ref_id: str, status: str, payment_id: str, signature: str) -> bool:
    """Signature on the redirect back from a Payment Link: HMAC-SHA256("link_id|reference_id|status|payment_id", key secret)."""
    secret = env().razorpay.key_secret
    return bool(secret and signature and safe_equal(hmac_hex(secret, f"{link_id}|{ref_id}|{status}|{payment_id}"), signature))


def gateway_for(country: str) -> str:
    """Rupee payments go through Razorpay. Everyone else pays in dollars through PayPal when it is set up, and Razorpay's international cards otherwise."""
    if pricing.region(country)["currency"] == "INR":
        return "razorpay"
    return "paypal" if integrations().paypal else "razorpay"


def _need_payments(user: dict, msg_verify: str, country: str = "IN") -> None:
    if not (integrations().paypal if gateway_for(country) == "paypal" else integrations().razorpay):
        raise ApiError(503, "payments_unavailable", "Payments are not switched on yet. Contact us and we will set you up.")
    if integrations().mail and not user.get("emailVerified"):
        raise ApiError(403, "email_unverified", msg_verify)


def _new_order(user: dict, **kw) -> dict:
    return {"id": f"ord_{uuid().replace('-', '')}", "uid": user["id"], "currency": kw.pop("currency", "INR"), "gateway": kw.pop("gateway", "razorpay"), "country": kw.pop("country", ""), "status": "created", "linkId": None, "shortUrl": None,
            "paymentId": None, "activated": False, "created": time.time() * 1000, "paidAt": None, **kw}


def _checkout(user: dict, order: dict, description: str, notes: dict) -> dict:
    st = get_store()
    st.put("orders", order["id"], order)
    try:
        if order.get("gateway") == "paypal":
            pp = paypal.create_order(order, description)
            st.update("orders", order["id"], lambda c: {**c, "linkId": pp["id"], "shortUrl": pp["url"]} if c else c)
            return {"url": pp["url"], "orderId": order["id"], "gateway": "paypal"}
        link = create_payment_link(order["amountPaise"], description, order["id"], user["name"], user["email"], notes,
                                   f"{env().app_url}/api/billing/return", int(time.time()) + 3600 * 2, order["currency"])
        st.update("orders", order["id"], lambda c: {**c, "linkId": link["id"], "shortUrl": link["short_url"]} if c else c)
        return {"url": link["short_url"], "orderId": order["id"]}
    except Exception:
        st.delete("orders", order["id"])
        raise


def _recent(user: dict, pred):
    rows = get_store().find("orders", where={"uid": user["id"], "status": "created"}, order_by="created", desc=True, limit=5)
    return next((o for o in rows if pred(o) and o.get("shortUrl") and time.time() * 1000 - o["created"] < REUSE_WINDOW_MS), None)


def start_checkout(user: dict, plan: str, billing: str, country: str = "IN") -> dict:
    """Creates (or reuses, if the person double-clicks) a hosted payment link for a plan."""
    _need_payments(user, "Confirm your email address first. We sent you a link when you signed up; you can ask for a new one in Settings.", country)
    if plan == "prototype":
        raise ApiError(400, "bad_plan", "That plan is free.")
    rupees = pricing.plan_amount(country, plan, billing)
    cur = pricing.region(country)["currency"]
    if not rupees:
        raise ApiError(400, "bad_plan", "That plan is not available for purchase.")
    paise, pct, kind = referral.price_paise(user, rupees)
    r = _recent(user, lambda o: o.get("plan") == plan and o.get("billing") == billing and not o.get("sku") and o.get("amountPaise") == paise and o.get("currency") == cur)
    if r:
        return {"url": r["shortUrl"], "orderId": r["id"]}
    order = _new_order(user, plan=plan, billing=billing, amountPaise=paise, currency=cur, gateway=gateway_for(country), country=country, discountPct=pct, discountKind=kind)
    return _checkout(user, order, f"WorkLab XC {plan} ({'monthly' if billing == 'month' else 'yearly'})", {"uid": user["id"], "plan": plan, "billing": billing})


def start_addon_checkout(user: dict, sku: str, country: str = "IN") -> dict:
    """Hosted payment link for an add-on. Same safety rules as a plan: signed webhook, amount check, applied once."""
    _need_payments(user, "Confirm your email address first. You can ask for a new link in Settings.", country)
    rupees = pricing.sku_amount(country, sku)
    cur = pricing.region(country)["currency"]
    if not rupees:
        raise ApiError(400, "bad_plan", "That add-on is not available for purchase.")
    paise, pct, kind = referral.price_paise(user, rupees)
    r = _recent(user, lambda o: o.get("sku") == sku and o.get("amountPaise") == paise and o.get("currency") == cur)
    if r:
        return {"url": r["shortUrl"], "orderId": r["id"]}
    order = _new_order(user, plan="learner", sku=sku, billing="month", amountPaise=paise, currency=cur, gateway=gateway_for(country), country=country, discountPct=pct, discountKind=kind)
    return _checkout(user, order, f"WorkLab XC add-on: {SKU_INFO[sku]['name']}", {"uid": user["id"], "sku": sku})


def _invoice(order: dict, payment_id: str | None) -> None:
    if order.get("currency", "INR") != "INR":
        return  # the GST tax invoice is for payments in rupees; a payment from abroad is an export of service, invoiced separately
    try:
        invoices.create_for_order(order, get_store().get("users", order["uid"]), payment_id)
    except Exception as e:  # noqa: BLE001  - a failed invoice must never undo a payment
        from .web import log
        log("error", "invoice.failed", order=order.get("id"), err=str(e)[:200])


def _record_purchase(order: dict, payment_id: str | None, until: float | None) -> None:
    """The permanent record of a purchase: who paid, for what, how much, the payment id, and what it switched on. One per order."""
    pid = payment_id or order.get("paymentId")
    now = time.time() * 1000
    rec = {"id": order["id"], "uid": order["uid"], "orderId": order["id"], "paymentId": pid, "kind": "addon" if order.get("sku") else ("subscription" if order.get("subscriptionId") else "plan"),
           "item": order.get("sku") or order.get("plan"), "billing": order.get("billing"), "amountPaise": order["amountPaise"], "currency": order["currency"],
           "paidAt": order.get("paidAt") or now, "country": order.get("country", ""), "gateway": order.get("gateway", "razorpay"), "renewal": bool(order.get("renewal")), "activatedAt": now, "activeUntil": until, "status": "active"}
    get_store().update("purchases", order["id"], lambda c: {**rec, **(c or {}), "paymentId": (c or {}).get("paymentId") or pid})


def settle_order(order_id: str, payment_id: str | None, amount_paise: int, currency: str) -> dict:
    """Marks an order paid and switches the plan on. Safe to call any number of times from the webhook, the browser
    redirect and retries: the order flips to paid once, and the account remembers which orders it has applied."""
    st = get_store()
    cur = st.get("orders", order_id)
    if not cur:
        raise not_found("That order")
    if currency != cur["currency"] or amount_paise < cur["amountPaise"]:
        raise ApiError(409, "amount_mismatch", "The amount paid does not match the order.")
    now = time.time() * 1000
    def mark_paid(c):
        if not c:
            return c
        if c["status"] != "paid":
            return {**c, "status": "paid", "paidAt": now, "paymentId": payment_id}
        # the browser redirect may settle first without a payment id; the webhook then fills it in
        return {**c, "paymentId": payment_id} if payment_id and not c.get("paymentId") else c

    was_paid = cur["status"] == "paid"
    order = st.update("orders", order_id, mark_paid)
    if not was_paid:
        referral.on_paid(order)

    if order.get("sku"):
        first = {"v": False}

        def mark(u):
            if not u or order["id"] in u["appliedOrders"]:
                return u
            first["v"] = True
            return {**u, "appliedOrders": [*u["appliedOrders"][-49:], order["id"]]}

        st.update("users", order["uid"], mark)
        if first["v"]:
            grant(order["uid"], order["sku"])
            au = st.get("users", order["uid"])
            if au:
                send_mail(au["email"], "receipt", T.addon_receipt(au["name"], SKU_INFO[order["sku"]]["name"], order["amountPaise"], order["id"], order["currency"]))
            emit("payment.paid", {"orderId": order["id"], "email": au and au["email"], "sku": order["sku"], "amountPaise": order["amountPaise"]})
        st.update("orders", order_id, lambda c: {**c, "activated": True} if c else c)
        _record_purchase(order, payment_id, (st.get("entitlements", f"{order['uid']}:{order['sku']}") or {}).get("validUntil"))
        _invoice(order, payment_id)
        return {"order": order, "planUntil": None}

    ext = {"v": None}
    # "plus" is Beta with the Study pack switched on alongside it
    plan_id = "learner" if order["plan"] == "plus" else order["plan"]
    first = {"v": False}

    def apply(u):
        if not u or order["id"] in u["appliedOrders"]:
            return u
        first["v"] = True
        same = u["plan"] == plan_id and u.get("planUntil") and u["planUntil"] > now
        frm = u["planUntil"] if same else now
        ext["v"] = frm + period_days(order["billing"]) * 86_400_000
        return {**u, "plan": plan_id, "planUntil": ext["v"], "appliedOrders": [*u["appliedOrders"][-49:], order["id"]]}

    st.update("users", order["uid"], apply)
    if first["v"] and order["plan"] == "plus":
        grant(order["uid"], "pack", days=period_days(order["billing"]))
    st.update("orders", order_id, lambda c: {**c, "activated": True} if c else c)
    _record_purchase(order, payment_id, ext["v"] or (st.get("users", order["uid"]) or {}).get("planUntil"))
    _invoice(order, payment_id)
    if ext["v"]:
        u = st.get("users", order["uid"])
        if u:
            send_mail(u["email"], "receipt", T.receipt(u["name"], order["plan"], order["billing"], order["amountPaise"], order["id"], ext["v"], order["currency"]))
        emit("payment.paid", {"orderId": order["id"], "email": u and u["email"], "plan": order["plan"], "billing": order["billing"],
                              "amountPaise": order["amountPaise"], "planUntil": ext["v"]})
    return {"order": order, "planUntil": ext["v"]}


def settle_from_link(link_id: str, ref_id: str, user: dict | None, payment_id: str | None = None) -> dict:
    """Handles the redirect back from Razorpay: confirm with Razorpay's API rather than trusting the query string alone."""
    link = fetch_payment_link(link_id)
    if link.get("reference_id") != ref_id:
        raise forbidden()
    order = get_store().get("orders", ref_id)
    if not order:
        raise not_found("That order")
    if user and order["uid"] != user["id"]:
        raise forbidden()
    if link["status"] != "paid":
        return {"paid": False, "status": link["status"]}
    settle_order(order["id"], payment_id, link["amount_paid"], link["currency"])
    return {"paid": True, "status": link["status"]}


def handle_webhook(event_id: str, body: dict) -> str:
    """Processes a verified webhook body once per event id; a failure releases the claim so Razorpay's retry can succeed."""
    st = get_store()
    if not st.insert("webhook_events", event_id, {"at": time.time() * 1000, "event": body.get("event")}):
        return "duplicate"
    try:
        payload = body.get("payload") or {}
        if str(body.get("event", "")).startswith("subscription."):
            return handle_subscription_event(body.get("event", ""), payload)
        link = (payload.get("payment_link") or {}).get("entity")
        if not link or not link.get("reference_id"):
            return "ignored"
        ev = body.get("event", "")
        if ev == "payment_link.paid":
            settle_order(link["reference_id"], ((payload.get("payment") or {}).get("entity") or {}).get("id"), link["amount_paid"], link["currency"])
            return "ok"
        if ev in ("payment_link.expired", "payment_link.cancelled"):
            st.update("orders", link["reference_id"], lambda c: {**c, "status": "expired" if ev.endswith("expired") else "cancelled"} if c and c["status"] == "created" else c)
            return "ok"
        return "ignored"
    except Exception:
        st.delete("webhook_events", event_id)
        raise


# ------------------------------------------------------------------ auto-renewing subscriptions (Razorpay Subscriptions)
LIVE = ("created", "authenticated", "active", "pending", "cancelling")


def _rz_plan_id(plan: str, billing: str, amount_paise: int) -> str:
    st = get_store()
    key = f"{plan}:{billing}:{amount_paise}"
    hit = st.get("rz_plans", key)
    if hit:
        return hit["id"]
    r = _rz("/plans", "POST", {"period": "monthly" if billing == "month" else "yearly", "interval": 1,
                                "item": {"name": f"WorkLab XC {plan} ({'monthly' if billing == 'month' else 'yearly'})", "amount": amount_paise, "currency": "INR",
                                         "description": f"WorkLab XC {plan} plan, renews automatically"}, "notes": {"plan": plan, "billing": billing}})
    st.put("rz_plans", key, {"id": r["id"], "created": time.time() * 1000})
    return r["id"]


def start_subscription(user: dict, plan: str, billing: str, country: str = "IN") -> dict:
    """Creates a Razorpay subscription. The customer approves the repeat charge (card mandate or UPI AutoPay) on Razorpay's page."""
    _need_payments(user, "Confirm your email address first. We sent you a link when you signed up; you can ask for a new one in Settings.", country)
    rupees = pricing.plan_amount(country, plan, billing)
    if plan == "prototype" or not rupees:
        raise ApiError(400, "bad_plan", "That plan is not available for purchase.")
    cur = (user.get("subscription") or {})
    if cur.get("status") in ("authenticated", "active", "pending"):
        raise ApiError(409, "already_subscribed", "You already have an auto-renewing plan. Cancel it first to change plan.")
    amount = round(rupees * 100)
    st = get_store()
    if gateway_for(country) == "paypal":
        cur = pricing.region(country)["currency"]
        pp = paypal.create_subscription(user, plan, billing, cur, amount, country)
        doc = {"id": pp["id"], "uid": user["id"], "plan": plan, "billing": billing, "amountPaise": amount, "currency": cur, "gateway": "paypal", "country": country, "status": "created", "shortUrl": pp["url"],
               "created": time.time() * 1000, "cancelAtPeriodEnd": False}
        st.put("subscriptions", pp["id"], doc)
        st.update("users", user["id"], lambda c: {**c, "subscription": {k: doc[k] for k in ("id", "plan", "billing", "status", "cancelAtPeriodEnd")}} if c else c)
        return {"url": pp["url"], "subscriptionId": pp["id"], "autoRenew": True, "gateway": "paypal"}
    sub = _rz("/subscriptions", "POST", {"plan_id": _rz_plan_id(plan, billing, amount), "total_count": 120 if billing == "month" else 10, "quantity": 1, "customer_notify": 1,
                                          "notes": {"uid": user["id"], "plan": plan, "billing": billing}})
    doc = {"id": sub["id"], "uid": user["id"], "plan": plan, "billing": billing, "amountPaise": amount, "status": sub.get("status", "created"), "shortUrl": sub.get("short_url"), "currency": "INR", "gateway": "razorpay", "country": country,
           "created": time.time() * 1000, "cancelAtPeriodEnd": False}
    st.put("subscriptions", sub["id"], doc)
    st.update("users", user["id"], lambda c: {**c, "subscription": {k: doc[k] for k in ("id", "plan", "billing", "status", "cancelAtPeriodEnd")}} if c else c)
    return {"url": sub.get("short_url"), "subscriptionId": sub["id"], "autoRenew": True}


def subscription_of(user: dict) -> dict | None:
    sub = (user.get("subscription") or {})
    if not sub.get("id"):
        return None
    doc = get_store().get("subscriptions", sub["id"]) or sub
    return {"id": doc["id"], "plan": doc["plan"], "billing": doc["billing"], "status": doc["status"], "cancelAtPeriodEnd": bool(doc.get("cancelAtPeriodEnd")),
            "renewsOrEndsAt": user.get("planUntil"), "amountPaise": doc.get("amountPaise"), "currency": doc.get("currency", "INR"), "gateway": doc.get("gateway", "razorpay"),
            "country": doc.get("country", "")}


def cancel_subscription(user: dict) -> dict:
    sub = (user.get("subscription") or {})
    doc = get_store().get("subscriptions", sub.get("id", "")) if sub.get("id") else None
    if not doc or doc["status"] not in LIVE or doc.get("cancelAtPeriodEnd"):
        raise ApiError(404, "no_subscription", "You do not have an auto-renewing plan to cancel.")
    if doc.get("gateway") == "paypal":
        if doc["status"] != "created":
            paypal.cancel_subscription(doc["id"])
        new = "cancelled" if doc["status"] == "created" else doc["status"]
    elif doc["status"] == "created":
        _rz(f"/subscriptions/{doc['id']}/cancel", "POST", {"cancel_at_cycle_end": 0})
        new = "cancelled"
    else:
        _rz(f"/subscriptions/{doc['id']}/cancel", "POST", {"cancel_at_cycle_end": 1})
        new = doc["status"]
    st = get_store()
    st.update("subscriptions", doc["id"], lambda c: {**c, "status": new, "cancelAtPeriodEnd": new != "cancelled"} if c else c)
    st.update("users", user["id"], lambda c: {**c, "subscription": {**(c.get("subscription") or {}), "status": new, "cancelAtPeriodEnd": new != "cancelled"}} if c else c)
    emit("subscription.cancel_requested", {"userId": user["id"], "email": user["email"], "plan": doc["plan"]})
    return {"ok": True, "message": "Your plan will not renew. You keep full access until the paid period ends."}


def handle_subscription_event(ev: str, payload: dict) -> str:
    st = get_store()
    ent = (payload.get("subscription") or {}).get("entity") or {}
    doc = st.get("subscriptions", ent.get("id", "")) if ent.get("id") else None
    if not doc:
        return "ignored"
    status = {"subscription.authenticated": "authenticated", "subscription.activated": "active", "subscription.pending": "pending", "subscription.halted": "halted",
              "subscription.cancelled": "cancelled", "subscription.completed": "completed", "subscription.paused": "paused", "subscription.resumed": "active"}.get(ev)
    if ev == "subscription.charged":
        pay = (payload.get("payment") or {}).get("entity") or {}
        if not pay.get("id"):
            return "ignored"
        oid = f"ord_sub_{pay['id']}"
        st.insert("orders", oid, {"id": oid, "uid": doc["uid"], "plan": doc["plan"], "billing": doc["billing"], "amountPaise": doc["amountPaise"], "currency": "INR", "status": "created",
                                  "subscriptionId": doc["id"], "paymentId": None, "activated": False, "created": time.time() * 1000, "paidAt": None, "gateway": "razorpay", "country": doc.get("country", ""), "renewal": True})
        settle_order(oid, pay["id"], pay.get("amount", doc["amountPaise"]), pay.get("currency", "INR"))
        status = "active"
    if status:
        keep = doc.get("cancelAtPeriodEnd") and status == "active"
        st.update("subscriptions", doc["id"], lambda c: {**c, "status": status} if c else c)
        st.update("users", doc["uid"], lambda c: {**c, "subscription": {**(c.get("subscription") or {}), "id": doc["id"], "plan": doc["plan"], "billing": doc["billing"], "status": status,
                                                                         "cancelAtPeriodEnd": bool(keep or (doc.get("cancelAtPeriodEnd") and status not in ("cancelled", "completed")))}} if c else c)
        if status in ("halted", "cancelled", "completed"):
            u = st.get("users", doc["uid"])
            emit(f"subscription.{status}", {"userId": doc["uid"], "email": u and u["email"], "plan": doc["plan"]})
        return "ok"
    return "ignored"


# ------------------------------------------------------------------ PayPal: one-off payments and auto-renewing plans
def settle_paypal(order_id: str, paypal_order_id: str, user: dict | None) -> dict:
    """The customer came back from PayPal: capture the payment ourselves and check it against the order before switching anything on."""
    st = get_store()
    order = st.get("orders", order_id)
    if not order or order.get("gateway") != "paypal" or order.get("linkId") != paypal_order_id:
        raise not_found("That order")
    if user and order["uid"] != user["id"]:
        raise forbidden()
    if order["status"] == "paid":
        return {"paid": True}
    j = paypal.capture_order(paypal_order_id)
    cap = (((j.get("purchase_units") or [{}])[0].get("payments") or {}).get("captures") or [{}])[0]
    if cap.get("status") != "COMPLETED":
        return {"paid": False, "status": str(cap.get("status") or j.get("status") or "").lower()}
    amt = cap.get("amount") or {}
    settle_order(order_id, cap.get("id"), round(float(amt.get("value", 0)) * 100), amt.get("currency_code", ""))
    return {"paid": True}


def _set_status(doc: dict, status: str) -> None:
    st = get_store()
    st.update("subscriptions", doc["id"], lambda c: {**c, "status": status} if c else c)
    st.update("users", doc["uid"], lambda c: {**c, "subscription": {**(c.get("subscription") or {}), "id": doc["id"], "plan": doc["plan"], "billing": doc["billing"], "status": status,
                                                                     "cancelAtPeriodEnd": bool(doc.get("cancelAtPeriodEnd") and status not in ("cancelled", "completed"))}} if c else c)
    if status in ("halted", "cancelled", "completed"):
        u = st.get("users", doc["uid"])
        emit(f"subscription.{status}", {"userId": doc["uid"], "email": u and u["email"], "plan": doc["plan"]})


def handle_paypal_event(event_id: str, body: dict) -> str:
    """A verified PayPal notification, handled once per event id: a renewal becomes a paid order (and so a receipt), a cancellation ends the renewals."""
    st = get_store()
    if not st.insert("webhook_events", f"pp_{event_id}", {"at": time.time() * 1000, "event": body.get("event_type")}):
        return "duplicate"
    try:
        ev, res = body.get("event_type", ""), body.get("resource") or {}
        if ev == "PAYMENT.CAPTURE.COMPLETED":
            oid = res.get("custom_id")
            if oid and st.get("orders", oid):
                amt = res.get("amount") or {}
                settle_order(oid, res.get("id"), round(float(amt.get("value", 0)) * 100), amt.get("currency_code", ""))
                return "ok"
            return "ignored"
        if ev == "PAYMENT.SALE.COMPLETED":
            doc = st.get("subscriptions", res.get("billing_agreement_id", "")) if res.get("billing_agreement_id") else None
            if not doc or not res.get("id"):
                return "ignored"
            amt = res.get("amount") or {}
            oid = f"ord_sub_{res['id']}"
            st.insert("orders", oid, {"id": oid, "uid": doc["uid"], "plan": doc["plan"], "billing": doc["billing"], "amountPaise": doc["amountPaise"], "currency": doc["currency"],
                                      "status": "created", "subscriptionId": doc["id"], "paymentId": None, "activated": False, "created": time.time() * 1000, "paidAt": None,
                                      "gateway": "paypal", "country": doc.get("country", ""), "renewal": bool(doc.get("renewals"))})
            settle_order(oid, res["id"], round(float(amt.get("total", 0)) * 100), amt.get("currency", ""))
            st.update("subscriptions", doc["id"], lambda c: {**c, "renewals": c.get("renewals", 0) + 1} if c else c)
            _set_status(doc, "active")
            return "ok"
        status = {"BILLING.SUBSCRIPTION.ACTIVATED": "active", "BILLING.SUBSCRIPTION.RE-ACTIVATED": "active", "BILLING.SUBSCRIPTION.CANCELLED": "cancelled",
                  "BILLING.SUBSCRIPTION.SUSPENDED": "halted", "BILLING.SUBSCRIPTION.EXPIRED": "completed", "BILLING.SUBSCRIPTION.PAYMENT.FAILED": "pending"}.get(ev)
        doc = st.get("subscriptions", res.get("id", "")) if status and res.get("id") else None
        if status and doc:
            _set_status(doc, status)
            return "ok"
        return "ignored"
    except Exception:
        st.delete("webhook_events", f"pp_{event_id}")
        raise
