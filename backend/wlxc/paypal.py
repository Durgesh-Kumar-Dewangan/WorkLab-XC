"""PayPal, for customers outside India: one-off payments (Orders v2) and auto-renewing plans (Billing Subscriptions).

The customer pays on PayPal's own page, so no card data reaches this server. Every payment is confirmed with PayPal before a plan is switched on:
a one-off order is captured by us and checked against the amount we stored; renewals arrive as webhooks whose signature PayPal itself verifies."""
from __future__ import annotations

import base64
import time

from .config import env
from .errors import ApiError
from .net import http
from .store import get_store

_token: dict = {"v": "", "exp": 0.0}


def _base() -> str:
    return "https://api-m.paypal.com" if env().paypal.live else "https://api-m.sandbox.paypal.com"


def _auth() -> str:
    now = time.time()
    if _token["v"] and _token["exp"] > now + 30:
        return _token["v"]
    c = env().paypal
    basic = base64.b64encode(f"{c.client_id}:{c.client_secret}".encode()).decode()
    try:
        r = http(f"{_base()}/v1/oauth2/token", "POST", {"authorization": f"Basic {basic}", "content-type": "application/x-www-form-urlencoded"}, body="grant_type=client_credentials", timeout=15)
    except Exception:  # noqa: BLE001
        raise ApiError(502, "payments_unreachable", "The payment provider did not respond. Try again in a moment.") from None
    if not r.ok:
        raise ApiError(502, "payments_error", "The payment provider rejected the request.")
    j = r.json()
    _token.update(v=j["access_token"], exp=now + int(j.get("expires_in", 300)))
    return _token["v"]


def call(path: str, method: str = "GET", body: dict | None = None, extra: dict | None = None) -> dict:
    try:
        r = http(f"{_base()}{path}", method, {"authorization": f"Bearer {_auth()}", "content-type": "application/json", "prefer": "return=representation", **(extra or {})}, json_body=body, timeout=20)
    except ApiError:
        raise
    except Exception:  # noqa: BLE001
        raise ApiError(502, "payments_unreachable", "The payment provider did not respond. Try again in a moment.") from None
    if not r.ok:
        raise ApiError(502, "payments_error", "The payment provider rejected the request.", {} if env().prod else {"detail": r.text[:300]})
    return r.json() if r.text else {}


def _money(minor: int) -> str:
    return f"{minor / 100:.2f}"


def _link(j: dict, rel: str) -> str:
    return next((x["href"] for x in j.get("links", []) if x.get("rel") == rel), "")


def create_order(order: dict, description: str) -> dict:
    """A one-off payment. Returns the page to send the customer to."""
    app = env().app_url
    j = call("/v2/checkout/orders", "POST", {
        "intent": "CAPTURE",
        "purchase_units": [{"reference_id": order["id"], "custom_id": order["id"], "description": description[:120],
                            "amount": {"currency_code": order["currency"], "value": _money(order["amountPaise"])}}],
        "payment_source": {"paypal": {"experience_context": {"return_url": f"{app}/api/billing/paypal/return?order={order['id']}",
                                                             "cancel_url": f"{app}/app/settings?paid=0", "user_action": "PAY_NOW", "brand_name": "WorkLab XC"}}}})
    return {"id": j["id"], "url": _link(j, "payer-action") or _link(j, "approve")}


def capture_order(paypal_order_id: str) -> dict:
    return call(f"/v2/checkout/orders/{paypal_order_id}/capture", "POST", {})


def _plan_id(plan: str, billing: str, currency: str, amount_minor: int) -> str:
    """One PayPal plan per product, period, currency and price, made the first time it is needed."""
    st = get_store()
    key = f"{plan}:{billing}:{currency}:{amount_minor}"
    hit = st.get("pp_plans", key)
    if hit:
        return hit["id"]
    prod = st.get("pp_plans", "product")
    if not prod:
        p = call("/v1/catalogs/products", "POST", {"name": "WorkLab XC", "type": "SERVICE", "category": "EDUCATIONAL_AND_TEXTBOOKS"})
        prod = {"id": p["id"]}
        st.put("pp_plans", "product", prod)
    r = call("/v1/billing/plans", "POST", {
        "product_id": prod["id"], "name": f"WorkLab XC {plan} ({'monthly' if billing == 'month' else 'yearly'})", "status": "ACTIVE",
        "billing_cycles": [{"frequency": {"interval_unit": "MONTH" if billing == "month" else "YEAR", "interval_count": 1}, "tenure_type": "REGULAR", "sequence": 1, "total_cycles": 0,
                            "pricing_scheme": {"fixed_price": {"value": _money(amount_minor), "currency_code": currency}}}],
        "payment_preferences": {"auto_bill_outstanding": True, "payment_failure_threshold": 3}})
    st.put("pp_plans", key, {"id": r["id"], "created": time.time() * 1000})
    return r["id"]


def create_subscription(user: dict, plan: str, billing: str, currency: str, amount_minor: int, country: str) -> dict:
    app = env().app_url
    j = call("/v1/billing/subscriptions", "POST", {
        "plan_id": _plan_id(plan, billing, currency, amount_minor), "custom_id": user["id"], "subscriber": {"email_address": user["email"]},
        "application_context": {"brand_name": "WorkLab XC", "user_action": "SUBSCRIBE_NOW", "return_url": f"{app}/app/settings?paid=1", "cancel_url": f"{app}/app/settings?paid=0",
                                "shipping_preference": "NO_SHIPPING"}})
    return {"id": j["id"], "status": str(j.get("status", "APPROVAL_PENDING")).lower(), "url": _link(j, "approve")}


def cancel_subscription(sub_id: str, reason: str = "Cancelled by the customer") -> None:
    call(f"/v1/billing/subscriptions/{sub_id}/cancel", "POST", {"reason": reason[:120]})


def verify_webhook(headers, body: dict) -> bool:
    """Asks PayPal whether this notification really came from PayPal and was addressed to our webhook."""
    c = env().paypal
    if not c.webhook_id:
        return False
    try:
        j = call("/v1/notifications/verify-webhook-signature", "POST", {
            "auth_algo": headers.get("paypal-auth-algo", ""), "cert_url": headers.get("paypal-cert-url", ""), "transmission_id": headers.get("paypal-transmission-id", ""),
            "transmission_sig": headers.get("paypal-transmission-sig", ""), "transmission_time": headers.get("paypal-transmission-time", ""), "webhook_id": c.webhook_id,
            "webhook_event": body})
    except ApiError:
        return False
    return j.get("verification_status") == "SUCCESS"
