from wlxc import geo, pricing
from wlxc.plans import server_plans
from wlxc.store import get_store

from .helpers import Base, get, post, setup


class TestRegionalPricing(Base):
    def test_india_pays_rupees_everyone_else_dollars_at_three_levels(self):
        self.assertEqual(pricing.region("IN")["currency"], "INR")
        self.assertEqual([pricing.tier(c) for c in ("US", "BR", "PK", "ZZ")], ["A", "B", "C", "B"])
        for plan in ("learner", "plus"):
            for billing in ("month", "year"):
                a, b, c = (pricing.plan_amount(x, plan, billing) for x in ("US", "BR", "PK"))
                self.assertGreater(a, b)
                self.assertGreater(b, c)
        # a year is cheaper than twelve months, at every level
        for x in ("US", "BR", "PK"):
            self.assertLess(pricing.plan_amount(x, "learner", "year"), pricing.plan_amount(x, "learner", "month") * 12)

    def test_the_lowest_price_still_covers_card_fees_and_the_rupee_price(self):
        low = pricing.plan_amount("PK", "learner", "month")
        self.assertGreaterEqual(low, 1.49)
        for sku in pricing.ADDON_USD_A:
            self.assertGreaterEqual(pricing.sku_amount("PK", sku) or 0, pricing.FLOOR_USD)
        # the bundle stays cheaper than its parts in every region
        for x in ("US", "BR", "PK"):
            self.assertLess(pricing.sku_amount(x, "pack"), pricing.sku_amount(x, "chatbot") + pricing.sku_amount(x, "monthly_notes"))

    def test_plans_payload_carries_currency_and_region_prices(self):
        us, inr = server_plans("US"), server_plans("IN")
        self.assertEqual((us["currency"], us["symbol"], us["tier"]), ("USD", "$", "A"))
        self.assertEqual(inr["currency"], "INR")
        plus = next(p for p in us["plans"] if p["id"] == "plus")
        self.assertEqual(plus["price"], 4.99)
        self.assertTrue(plus["listPrice"] > plus["price"])

    def test_country_comes_from_the_cdn_header_and_the_plans_route_is_not_shared_cached(self):
        self.w = setup()
        r = get("/api/plans", headers={"cf-ipcountry": "DE"})
        self.assertEqual(r.json()["currency"], "USD")
        self.assertIn("private", r.headers.get("cache-control", ""))
        self.assertEqual(get("/api/plans", headers={"cf-ipcountry": "IN"}).json()["currency"], "INR")

    def test_globe_counts_users_by_country_and_state_without_identities(self):
        self.w = setup()
        self.sign_up("a@example.com")
        self.sign_up("b@example.com")
        self.sign_up("c@example.com")
        st = get_store()
        for email, g in (("a@example.com", {"country": "IN", "region": "Delhi", "lat": 28.6, "lon": 77.2}), ("b@example.com", {"country": "IN", "region": "Goa"}), ("c@example.com", {"country": "US", "region": ""})):
            u = self.user_doc(email)
            st.update("users", u["id"], lambda c, g=g: {**c, "geo": g})
        out = geo.globe_points()
        self.assertEqual((out["total"], out["located"]), (3, 3))
        self.assertEqual({c["country"]: c["n"] for c in out["countries"]}, {"IN": 2, "US": 1})
        self.assertNotIn("email", str(out))

    def test_globe_marks_who_is_online_now(self):
        import time
        self.w = setup()
        ca, _ = self.sign_up("a@example.com")
        self.sign_up("b@example.com")
        st = get_store()
        for email in ("a@example.com", "b@example.com"):
            u = self.user_doc(email)
            st.update("users", u["id"], lambda c: {**c, "geo": {"country": "IN", "region": "Goa"}})
        from .helpers import post
        self.assertEqual(post("/api/presence", {}, cookie=ca, headers={"cf-ipcountry": "IN"}).status, 200)
        out = geo.globe_points()
        self.assertEqual((out["online"], out["countries"][0]["online"], out["countries"][0]["n"]), (1, 1, 2))
        a = self.user_doc("a@example.com")
        st.update("users", a["id"], lambda c: {**c, "lastSeen": time.time() * 1000 - 10 * 60_000})
        self.assertEqual(geo.globe_points()["online"], 0)  # ten minutes quiet means offline

    def test_live_snapshot_has_dots_feed_and_no_identities(self):
        self.w = setup()
        self.sign_up("a@example.com")
        st = get_store()
        u = self.user_doc("a@example.com")
        import time
        st.update("users", u["id"], lambda c: {**c, "geo": {"country": "BR", "region": "Bahia"}, "lastSeen": time.time() * 1000})
        s = geo.live_snapshot()
        self.assertEqual((s["online"], s["total"], len(s["points"])), (1, 1, 1))
        self.assertEqual(s["points"][0][2], 1)
        self.assertTrue(any("Bahia, Brazil joined" in f["text"] for f in s["feed"]))
        self.assertNotIn("a@example.com", str(s))

    def test_what_a_visitor_saw_is_what_checkout_charges(self):
        self.w = setup()
        cookie, _ = self.sign_up("a@example.com")
        hints = {"x-wlxc-tz": "Europe/Berlin", "accept-language": "de-DE,de;q=0.9"}
        shown = get("/api/plans", headers=hints).json()
        self.assertEqual((shown["country"], shown["currency"], shown["detectedBy"]), ("DE", "USD", "timezone"))
        r = post("/api/checkout", {"plan": "learner", "billing": "month"}, cookie=cookie, headers=hints)
        self.assertEqual(r.status, 200, r.text)
        o = next(iter(get_store().find("orders", where={"uid": self.user_doc("a@example.com")["id"]})))
        self.assertEqual((o["currency"], o["country"], o["amountPaise"]), ("USD", "DE", 399))
        only_lang = get("/api/plans", headers={"accept-language": "pt-BR,pt;q=0.9"}).json()
        self.assertEqual((only_lang["country"], only_lang["detectedBy"]), ("BR", "language"))
