import json

from wlxc.store import get_store

from .helpers import Base, get, post, setup

PP = {"PAYPAL_CLIENT_ID": "cid", "PAYPAL_CLIENT_SECRET": "csec", "PAYPAL_WEBHOOK_ID": "WH-1"}
DE = {"cf-ipcountry": "DE"}


class TestPayPal(Base):
    def start(self):
        self.w = setup(**PP)
        self.cookie, _ = self.sign_up()
        self.uid = self.user_doc("asha@example.com")["id"]

    def event(self, kind, resource, eid):
        raw = json.dumps({"id": eid, "event_type": kind, "resource": resource})
        return post("/api/webhooks/paypal", raw=raw, origin=None, headers={"paypal-transmission-id": eid, "paypal-transmission-sig": "s", "paypal-auth-algo": "a", "paypal-cert-url": "u", "paypal-transmission-time": "t"})

    def test_one_off_payment_from_germany_in_dollars_then_receipt_with_country_tag(self):
        self.start()
        r = post("/api/checkout", {"plan": "learner", "billing": "month"}, cookie=self.cookie, headers=DE)
        self.assertEqual(r.status, 200, r.text)
        self.assertEqual((r.json()["gateway"], r.json()["url"]), ("paypal", "https://paypal.test/pay/PPORD-1"))
        o = next(x for x in get_store().find("orders", where={"uid": self.uid}))
        self.assertEqual((o["currency"], o["amountPaise"], o["country"], o["gateway"]), ("USD", 399, "DE", "paypal"))
        back = get(f"/api/billing/paypal/return?order={o['id']}&token=PPORD-1", cookie=self.cookie)
        self.assertEqual(back.status, 303)
        self.assertIn("paid=1", back.headers["location"])
        self.assertEqual(self.user_doc("asha@example.com")["plan"], "learner")
        rc = get(f"/api/receipts/{o['id']}", cookie=self.cookie)
        self.assertEqual(rc.status, 200)
        self.assertIn("Germany", rc.text)
        self.assertIn("$3.99", rc.text)
        self.assertIn("CAP-1", rc.text)
        p = get("/api/purchases", cookie=self.cookie).json()["purchases"][0]
        self.assertEqual((p["country"], p["gateway"], p["currency"]), ("DE", "paypal", "USD"))

    def test_someone_elses_receipt_is_refused(self):
        self.start()
        post("/api/checkout", {"plan": "learner", "billing": "month"}, cookie=self.cookie, headers=DE)
        o = next(x for x in get_store().find("orders", where={"uid": self.uid}))
        get(f"/api/billing/paypal/return?order={o['id']}&token=PPORD-1", cookie=self.cookie)
        other, _ = self.sign_up("other@example.com")
        self.assertEqual(get(f"/api/receipts/{o['id']}", cookie=other).status, 403)

    def test_auto_renewing_plan_renews_gives_a_receipt_each_time_and_can_be_cancelled(self):
        self.start()
        r = post("/api/checkout", {"plan": "learner", "billing": "month", "autoRenew": True}, cookie=self.cookie, headers=DE).json()
        self.assertEqual((r["gateway"], r["subscriptionId"]), ("paypal", "I-SUB1"))
        self.assertEqual(self.event("BILLING.SUBSCRIPTION.ACTIVATED", {"id": "I-SUB1"}, "E1").status, 200)
        sale = {"id": "SALE1", "billing_agreement_id": "I-SUB1", "amount": {"total": "3.99", "currency": "USD"}}
        self.assertEqual(self.event("PAYMENT.SALE.COMPLETED", sale, "E2").status, 200)
        first = self.user_doc("asha@example.com")["planUntil"]
        self.assertTrue(first)
        self.event("PAYMENT.SALE.COMPLETED", sale, "E2")  # a retried notification changes nothing
        self.assertEqual(self.user_doc("asha@example.com")["planUntil"], first)
        self.event("PAYMENT.SALE.COMPLETED", {**sale, "id": "SALE2"}, "E3")
        self.assertGreater(self.user_doc("asha@example.com")["planUntil"], first)
        purchases = get("/api/purchases", cookie=self.cookie).json()["purchases"]
        self.assertEqual([p["renewal"] for p in purchases], [True, False])
        self.assertEqual(get(f"/api/receipts/{purchases[0]['id']}", cookie=self.cookie).status, 200)
        sub = get("/api/subscription", cookie=self.cookie).json()["subscription"]
        self.assertEqual((sub["status"], sub["gateway"], sub["currency"]), ("active", "paypal", "USD"))
        c = post("/api/subscription/cancel", {}, cookie=self.cookie)
        self.assertEqual(c.status, 200, c.text)
        self.assertTrue(any(x["url"].endswith("/I-SUB1/cancel") for x in self.w.calls))
        self.assertTrue(self.user_doc("asha@example.com")["planUntil"])  # access stays until the paid period ends

    def test_india_still_uses_razorpay_and_without_paypal_dollars_fall_back_to_it(self):
        self.start()
        self.assertEqual(post("/api/checkout", {"plan": "learner", "billing": "month"}, cookie=self.cookie, headers={"cf-ipcountry": "IN"}).json().get("gateway"), None)
        self.w = setup()
        cookie, _ = self.sign_up("nopp@example.com")
        r = post("/api/checkout", {"plan": "learner", "billing": "month"}, cookie=cookie, headers=DE)
        self.assertEqual(r.status, 200, r.text)
        self.assertEqual(r.json()["url"], "https://rzp.io/i/abc")
