import unittest

from .helpers import Base, STATS, get, post, put, setup, call

IP = {"x-forwarded-for": "203.0.113.7"}


class TestForcedLogin(Base):
    def test_feature_routes_refuse_anonymous_visitors(self):
        for method, path, body in [("POST", "/api/courses", {"text": STATS}), ("POST", "/api/jobs", {}), ("POST", "/api/sessions", {}),
                                   ("POST", "/api/images", {"prompt": "a cell"}), ("GET", "/api/library", None), ("GET", "/api/courses", None),
                                   ("POST", "/api/learn/prepare", {}), ("POST", "/api/learn/game", {}), ("POST", "/api/learn/problems", {}),
                                   ("POST", "/api/learn/unit-answers", {}), ("POST", "/api/learn/notes", {}), ("POST", "/api/learn/chat", {}),
                                   ("GET", "/api/me", None), ("GET", "/api/addons", None), ("POST", "/api/checkout", {})]:
            r = call(method, path, body)
            self.assertEqual(r.status, 401, f"{method} {path} -> {r.status}")


class TestVpnCoversEverythingThatSpendsCredit(Base):
    def test_default_provider_is_on(self):
        from wlxc.config import env
        self.assertEqual(env().ipintel.provider, "ipapi")
        self.assertEqual(env().ipintel.policy, "generation")

    def test_blocked_on_every_ai_route_for_free_users_but_not_paid(self):
        self.w = setup(IPINTEL_KEY="k")
        self.w.intel = {"is_vpn": True}
        cookie, _ = self.sign_up()
        c = post("/api/courses", {"text": STATS}, cookie=cookie, headers={"x-forwarded-for": "10.0.0.1"}).json()  # private ip is never checked
        routes = [("/api/courses", {"text": STATS}), ("/api/sessions", {}), ("/api/jobs", {"courseId": c["id"], "topicIds": c["course"]["order"][:1]}),
                  ("/api/images", {"prompt": "a cell"}), ("/api/learn/prepare", {"sessionId": "x", "title": "Photosynthesis"}),
                  ("/api/learn/game", {"title": "Photosynthesis"}), ("/api/learn/problems", {"title": "Photosynthesis"}),
                  ("/api/learn/unit-answers", {"courseId": c["id"], "unitId": c["course"]["units"][0]["id"]}),
                  ("/api/learn/notes", {"courseId": c["id"], "unitId": c["course"]["units"][0]["id"], "weights": [{"topic": "x", "marks": 2}]}),
                  ("/api/learn/chat", {"title": "Photosynthesis", "question": "What is it?"})]
        for path, body in routes:
            r = post(path, body, cookie=cookie, headers=IP)
            self.assertEqual((r.status, r.json().get("error")), (403, "vpn_blocked"), path)
        self.upgrade("asha@example.com")
        self.assertEqual(post("/api/sessions", {}, cookie=cookie, headers=IP).status, 201)
        # reading what you already have is never blocked
        self.assertEqual(get("/api/library", cookie=cookie, headers=IP).status, 200)

    def test_clean_address_passes(self):
        self.w = setup(IPINTEL_KEY="k")
        self.w.intel = {}
        cookie, _ = self.sign_up()
        self.assertEqual(post("/api/courses", {"text": STATS}, cookie=cookie, headers=IP).status, 201)


if __name__ == "__main__":
    unittest.main()


class TestWeakConnection(Base):
    def setUp(self):
        self.w = setup()

    def test_assess_and_endpoint(self):
        ok = get("/api/network", headers={"x-wlxc-net": "ect=4g;downlink=10;rtt=50;save-data=off"}).json()
        self.assertFalse(ok["slow"])
        for hdr in ["ect=2g", "downlink=0.3", "rtt=2500", "save-data=on", "ect=slow-2g;downlink=9"]:
            r = get("/api/network", headers={"x-wlxc-net": hdr}).json()
            self.assertTrue(r["slow"], hdr)
            self.assertTrue(r["reasons"])
        self.assertTrue(get("/api/network", headers={"save-data": "on"}).json()["slow"])  # standard Client Hint
        self.assertFalse(get("/api/network", headers={"x-wlxc-net": "ect=<script>;downlink=abc"}).json()["slow"])  # junk is ignored

    def test_pictures_skipped_on_weak_link_only(self):
        cookie, _ = self.sign_up()
        self.upgrade("asha@example.com")
        c = post("/api/courses", {"text": STATS}, cookie=cookie).json()
        body = {"courseId": c["id"], "topicIds": c["course"]["order"][:1], "images": True}
        slow = post("/api/jobs", body, cookie=cookie, headers={"x-wlxc-net": "ect=2g"}).json()
        self.assertTrue(slow["lowBandwidth"]["imagesSkipped"])
        from wlxc.store import get_store
        self.assertFalse(get_store().get("jobs", slow["job"]["id"])["opts"]["images"])
        fast = post("/api/jobs", body, cookie=cookie, headers={"x-wlxc-net": "ect=4g;downlink=20"}).json()
        self.assertNotIn("lowBandwidth", fast)
        self.assertTrue(get_store().get("jobs", fast["job"]["id"])["opts"]["images"])
