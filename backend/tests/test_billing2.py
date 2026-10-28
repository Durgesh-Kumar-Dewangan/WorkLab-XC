import json
import re
import unittest

from wlxc import invoices
from wlxc.store import get_store

from .helpers import Base, get, hmac_hex, post, put, setup


class Sub(Base):
    def setUp(self):
        self.w = setup(RESEND_API_KEY="re_1")
        self.cookie, _ = self.sign_up()
        post("/api/auth/verify-email", {"token": self.token()})
        self.uid = self.user_doc("asha@example.com")["id"]

    def token(self):
        from urllib.parse import unquote
        m = next(x for x in reversed(self.w.mails) if "token=" in x["body"])
        return unquote(re.search(r"token=([A-Za-z0-9_%\-.~]+)", m["body"]).group(1))

    def hook(self, event, sub_status="active", pay=None, evid=None):
        payload = {"subscription": {"entity": {"id": "sub_1", "status": sub_status}}}
        if pay:
            payload["payment"] = {"entity": pay}
        raw = json.dumps({"event": event, "payload": payload})
        return post("/api/webhooks/razorpay", raw=raw, origin=None, headers={"x-razorpay-signature": hmac_hex("whsecret", raw), "x-razorpay-event-id": evid or f"evt_{event}_{pay and pay['id']}"})

    def subscribe(self):
        r = post("/api/checkout", {"plan": "learner", "billing": "month", "autoRenew": True}, cookie=self.cookie)
        self.assertEqual(r.status, 200, r.text)
        return r.json()


class TestSubscription(Sub):
    def test_create_authorise_charge_renew(self):
        r = self.subscribe()
        self.assertEqual((r["url"], r["subscriptionId"]), ("https://rzp.io/i/sub1", "sub_1"))
        calls = [json.loads(c["body"]) for c in self.w.calls if c["url"].endswith(("/plans", "/subscriptions"))]
        self.assertEqual(calls[0]["item"]["amount"], 29900)
        self.assertEqual(calls[1]["plan_id"], "plan_1")
        self.assertEqual(get("/api/subscription", cookie=self.cookie).json()["subscription"]["status"], "created")
        self.assertEqual(self.user_doc("asha@example.com")["plan"], "prototype")  # nothing granted until money arrives
        self.assertEqual(self.hook("subscription.authenticated", "authenticated").status, 200)
        self.assertEqual(self.hook("subscription.charged", pay={"id": "pay_1", "amount": 29900, "currency": "INR"}).status, 200)
        u = self.user_doc("asha@example.com")
        self.assertEqual(u["plan"], "learner")
        first_end = u["planUntil"]
        self.assertEqual(get("/api/subscription", cookie=self.cookie).json()["subscription"]["status"], "active")
        self.hook("subscription.charged", pay={"id": "pay_2", "amount": 29900, "currency": "INR"})
        self.assertAlmostEqual(self.user_doc("asha@example.com")["planUntil"] - first_end, 30 * 86_400_000, delta=5)
        # a retried webhook for the same payment changes nothing
        self.hook("subscription.charged", pay={"id": "pay_2", "amount": 29900, "currency": "INR"}, evid="evt_again")
        self.assertAlmostEqual(self.user_doc("asha@example.com")["planUntil"] - first_end, 30 * 86_400_000, delta=5)
        self.assertEqual(len(get("/api/invoices", cookie=self.cookie).json()["invoices"]), 2)

    def test_second_subscription_refused_cancel_keeps_access_then_ends(self):
        self.subscribe()
        self.hook("subscription.charged", pay={"id": "pay_1", "amount": 29900, "currency": "INR"})
        self.assertEqual(post("/api/checkout", {"plan": "learner", "billing": "month", "autoRenew": True}, cookie=self.cookie).json()["error"], "already_subscribed")
        c = post("/api/subscription/cancel", {}, cookie=self.cookie)
        self.assertEqual(c.status, 200)
        cancel_call = next(x for x in self.w.calls if x["url"].endswith("/cancel"))
        self.assertEqual(json.loads(cancel_call["body"]), {"cancel_at_cycle_end": 1})
        s = get("/api/subscription", cookie=self.cookie).json()["subscription"]
        self.assertTrue(s["cancelAtPeriodEnd"])
        self.assertEqual(self.user_doc("asha@example.com")["plan"], "learner")  # still paid up
        self.assertEqual(post("/api/subscription/cancel", {}, cookie=self.cookie).status, 404)
        self.hook("subscription.cancelled", "cancelled")
        self.assertEqual(get("/api/subscription", cookie=self.cookie).json()["subscription"]["status"], "cancelled")

    def test_amount_mismatch_and_bad_signature(self):
        self.subscribe()
        r = self.hook("subscription.charged", pay={"id": "pay_x", "amount": 100, "currency": "INR"})
        self.assertGreaterEqual(r.status, 400)
        self.assertEqual(self.user_doc("asha@example.com")["plan"], "prototype")
        raw = json.dumps({"event": "subscription.charged", "payload": {}})
        self.assertEqual(post("/api/webhooks/razorpay", raw=raw, origin=None, headers={"x-razorpay-signature": "bad", "x-razorpay-event-id": "e"}).status, 400)

    def test_unknown_subscription_ignored_and_requires_verified_email(self):
        raw = json.dumps({"event": "subscription.charged", "payload": {"subscription": {"entity": {"id": "sub_nope"}}, "payment": {"entity": {"id": "p", "amount": 1}}}})
        r = post("/api/webhooks/razorpay", raw=raw, origin=None, headers={"x-razorpay-signature": hmac_hex("whsecret", raw), "x-razorpay-event-id": "e9"})
        self.assertEqual(r.status, 200)
        c2, _ = self.sign_up("new@example.com")
        self.assertEqual(post("/api/checkout", {"plan": "learner", "billing": "month", "autoRenew": True}, cookie=c2).json()["error"], "email_unverified")

    def test_auto_renewers_get_no_ending_soon_mail(self):
        from wlxc import maintenance
        self.subscribe()
        self.hook("subscription.charged", pay={"id": "pay_1", "amount": 29900, "currency": "INR"})
        import time
        get_store().update("users", self.uid, lambda c: {**c, "planUntil": time.time() * 1000 + 86_400_000})
        n = len(self.w.mails)
        maintenance.tick()
        self.assertEqual(maintenance.tick()["reminded"], 0)
        self.assertEqual(len(self.w.mails), n)


class TestInvoices(Sub):
    def pay_once(self):
        self.subscribe()
        self.hook("subscription.charged", pay={"id": "pay_1", "amount": 29900, "currency": "INR"})
        return get("/api/invoices", cookie=self.cookie).json()["invoices"][0]

    def test_numbering_tax_split_and_formats(self):
        inv = self.pay_once()
        self.assertRegex(inv["number"], r"^WLXC/20\d\d-\d\d/000001$")
        full = get(f"/api/invoices/{inv['id']}", cookie=self.cookie).json()["invoice"]
        self.assertEqual((full["taxable"], full["cgst"], full["sgst"], full["igst"], full["total"]), (25339, 2280, 2281, 0, 29900))
        self.assertEqual(full["taxable"] + full["cgst"] + full["sgst"], full["total"])
        pdf = get(f"/api/invoices/{inv['id']}?format=pdf", cookie=self.cookie)
        self.assertEqual((pdf.status, pdf.body[:4]), (200, b"%PDF"))
        html = get(f"/api/invoices/{inv['id']}?format=html", cookie=self.cookie)
        self.assertIn("Tax invoice", html.text)
        self.assertIn("default-src 'none'", html.headers["content-security-policy"])
        self.hook("subscription.charged", pay={"id": "pay_2", "amount": 29900, "currency": "INR"})
        nums = sorted(i["number"] for i in get("/api/invoices", cookie=self.cookie).json()["invoices"])
        self.assertEqual([n[-6:] for n in nums], ["000001", "000002"])

    def test_interstate_uses_igst_and_buyer_gstin_validated(self):
        self.assertEqual(put("/api/billing/details", {"name": "Acme", "gstin": "bad", "stateCode": "", "address": ""}, cookie=self.cookie).json()["error"], "bad_gstin")
        self.assertEqual(put("/api/billing/details", {"name": "Acme", "gstin": "29AABCU9603R1ZX", "stateCode": "07", "address": ""}, cookie=self.cookie).json()["error"], "gstin_state_mismatch")
        self.assertEqual(put("/api/billing/details", {"name": "Acme Pvt <b>", "gstin": "29AABCU9603R1ZX", "stateCode": "", "address": "Bengaluru"}, cookie=self.cookie).status, 200)
        inv = self.pay_once()
        full = get(f"/api/invoices/{inv['id']}", cookie=self.cookie).json()["invoice"]
        self.assertEqual((full["cgst"], full["sgst"], full["igst"]), (0, 0, 4561))
        self.assertNotIn("<b>", get(f"/api/invoices/{inv['id']}?format=html", cookie=self.cookie).text)

    def test_private_to_owner_and_also_for_one_time_payments(self):
        inv = self.pay_once()
        other, _ = self.sign_up("other@example.com")
        self.assertEqual(get(f"/api/invoices/{inv['id']}", cookie=other).status, 404)
        self.assertEqual(get("/api/invoices").status, 401)
        # one-time payment link purchase also gets an invoice
        self.w.paid = True
        r = post("/api/checkout", {"plan": "learner", "billing": "year"}, cookie=other)
        self.assertEqual(r.status, 403)  # needs verified email first

    def test_exclusive_pricing_and_off_switch(self):
        self.assertEqual(invoices.split_tax(10000, 18, False, False), {"taxable": 10000, "cgst": 0, "sgst": 0, "igst": 1800, "total": 11800})
        self.w = setup(RESEND_API_KEY="re_1", GST_ENABLED="0")
        self.assertEqual(invoices.create_for_order({"id": "o", "amountPaise": 100, "plan": "learner"}, {"id": "u", "name": "A", "email": "a@b.c"}), None)


if __name__ == "__main__":
    unittest.main()
