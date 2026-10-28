import time
import unittest
from datetime import datetime, timedelta, timezone

from wlxc import abuse, addons, ipintel
from wlxc.errors import ApiError
from wlxc.store import get_store

from .helpers import Base, get, post, setup


class AbuseBase(Base):
    def sign(self, email="asha@example.com", headers=None):
        r = post("/api/auth/register", {"name": "Asha", "email": email, "password": "S3cure-pass!"}, headers=headers)
        idx = get_store().get("emails", email)
        from .helpers import cookie_of
        return cookie_of(r), (idx["uid"] if idx else ""), r.status

    def upgrade_uid(self, uid):
        get_store().update("users", uid, lambda c: {**c, "plan": "learner", "planUntil": time.time() * 1000 + 1e9} if c else c)

    def start(self, cookie, headers=None):
        return post("/api/sessions", {}, cookie=cookie, headers=headers)


class TestSessionAllowance(AbuseBase):
    def test_learning_sessions_are_unlimited_on_free_and_paid(self):
        cookie, uid, _ = self.sign()
        for _ in range(6):
            r = self.start(cookie)
            self.assertEqual(r.status, 201)
            post("/api/feedback", {"sessionId": r.json()["session"]["id"], "rating": 5}, cookie=cookie)


    def test_gate_refusal_does_not_use_allowance(self):
        cookie, uid, _ = self.sign()
        self.upgrade_uid(uid)
        self.start(cookie)
        for _ in range(3):
            self.assertEqual(self.start(cookie).status, 403)
        day = (datetime.now(timezone.utc) + timedelta(minutes=330)).strftime("%Y-%m-%d")
        self.assertEqual(get_store().get("usage", f"{uid}:sessions:{day}")["n"], 1)


class TestBlocking(AbuseBase):
    def test_block_unblock_by_hand_keeps_account_and_support_reachable(self):
        cookie, uid, _ = self.sign()
        abuse.block_user(uid, "Shared an account.", "admin", None, "boss")
        r = self.start(cookie)
        self.assertEqual(r.status, 403)
        j = r.json()
        self.assertEqual(j["error"], "account_blocked")
        self.assertEqual(j["appeal"], "support@worklabxc.com")
        self.assertEqual(get("/api/me", cookie=cookie).status, 200)
        self.assertEqual(post("/api/support", {"message": "Please review my block"}, cookie=cookie).status, 201)
        abuse.unblock_user(uid, "boss")
        self.assertEqual(self.start(cookie).status, 201)
        self.assertEqual(sorted(a["action"] for a in get_store().find("audit")), ["block", "unblock"])

    def test_timed_block_lifts_itself(self):
        _, uid, _ = self.sign()
        abuse.block_user(uid, "x", "auto", 15)
        self.assertIsNotNone(abuse.active_block(uid))
        get_store().update("blocks", uid, lambda c: {**c, "until": time.time() * 1000 - 1})
        self.assertIsNone(abuse.active_block(uid))

    def test_auto_block_after_repeated_hits_and_escalates(self):
        self.w = setup(AUTO_BLOCK_HITS_PER_HOUR="3")
        _, uid, _ = self.sign()
        ms = lambda: time.time() * 1000  # noqa: E731
        for _ in range(3):
            abuse.note_limit_hit(uid)
        first = abuse.active_block(uid)
        self.assertEqual(first["by"], "auto")
        self.assertLess(first["until"] - ms(), 16 * 60_000)
        for _ in range(3):
            abuse.note_limit_hit(uid)
        self.assertGreater(abuse.active_block(uid)["until"] - ms(), 59 * 60_000)
        for _ in range(3):
            abuse.note_limit_hit(uid)
        self.assertGreater(abuse.active_block(uid)["until"] - ms(), 23 * 3600_000)

    def test_over_limit_loop_earns_block_through_routes(self):
        self.w = setup(AUTO_BLOCK_HITS_PER_HOUR="3")
        cookie, _, _ = self.sign()
        self.assertEqual(self.start(cookie).status, 201)
        codes = [self.start(cookie).status for _ in range(6)]
        self.assertIn(403, codes)
        self.assertIn(self.start(cookie).json()["error"], ["account_blocked", "feedback_required"])


class TestVpn(AbuseBase):
    IP = {"x-forwarded-for": "203.0.113.7"}

    def test_refuses_flagged_address_for_free_account(self):
        self.w = setup(IPINTEL_PROVIDER="ipapi", IPINTEL_KEY="k")
        self.w.intel = {"is_vpn": True}
        cookie, _, _ = self.sign()
        r = self.start(cookie, self.IP)
        self.assertEqual(r.status, 403)
        self.assertEqual(r.json()["error"], "vpn_blocked")
        self.assertEqual(r.json()["appeal"], "support@worklabxc.com")

    def test_clean_addresses_pass_verdicts_cached_paid_exempt(self):
        self.w = setup(IPINTEL_PROVIDER="ipapi", IPINTEL_KEY="k")
        self.w.intel = {"is_vpn": False}
        cookie, _, _ = self.sign()
        self.assertEqual(self.start(cookie, self.IP).status, 201)
        ipintel.verdict_for("203.0.113.7")
        self.assertEqual(len([c for c in self.w.calls if "ipapi.is" in c["url"]]), 1)
        self.w.intel = {"is_tor": True}
        bc, buid, _ = self.sign("b@example.com")
        self.upgrade_uid(buid)
        self.assertEqual(self.start(bc, {"x-forwarded-for": "198.51.100.9"}).status, 201)

    def test_understands_each_provider(self):
        for provider, answer, host in [("ipqs", {"success": True, "vpn": True}, "ipqualityscore.com"),
                                       ("proxycheck", {"status": "ok", "203.0.113.50": {"proxy": "yes", "type": "VPN"}}, "proxycheck.io"),
                                       ("ipapi", {"is_datacenter": True}, "api.ipapi.is")]:
            self.w = setup(IPINTEL_PROVIDER=provider, IPINTEL_KEY="k")
            self.w.intel = answer
            v = ipintel.verdict_for("203.0.113.50")
            self.assertTrue(v and (v["vpn"] or v["hosting"]), provider)
            self.assertTrue(any(host in c["url"] for c in self.w.calls))

    def test_allowlist_private_and_fail_modes(self):
        self.w = setup(IPINTEL_PROVIDER="ipapi", IP_ALLOWLIST="203.0.113.*", IPINTEL_KEY="k")
        self.w.intel = {"is_vpn": True}
        self.assertIsNone(ipintel.verdict_for("203.0.113.8"))
        self.assertIsNone(ipintel.verdict_for("192.168.1.5"))
        self.w = setup(IPINTEL_PROVIDER="ipapi", IPINTEL_KEY="k")
        self.w.fail.add("api.ipapi.is")
        self.assertIsNone(ipintel.verdict_for("203.0.113.9"))  # fail open
        self.w = setup(IPINTEL_PROVIDER="ipapi", IPINTEL_KEY="k", IPINTEL_FAIL="closed")
        self.w.fail.add("api.ipapi.is")
        with self.assertRaises(ApiError):
            ipintel.verdict_for("203.0.113.9")

    def test_signup_and_signin_covered_only_when_policy_all(self):
        self.w = setup(IPINTEL_PROVIDER="ipapi", IPINTEL_KEY="k")
        self.w.intel = {"is_proxy": True}
        self.assertEqual(self.sign("x@example.com", self.IP)[2], 201)
        self.w = setup(IPINTEL_PROVIDER="ipapi", IPINTEL_KEY="k", VPN_POLICY="all")
        self.w.intel = {"is_proxy": True}
        self.assertEqual(self.sign("y@example.com", {"x-forwarded-for": "203.0.113.99"})[2], 403)
        self.assertEqual(post("/api/auth/login", {"email": "x@example.com", "password": "S3cure-pass!"}, headers={"x-forwarded-for": "203.0.113.99"}).status, 403)

    def test_signups_capped_per_address_per_day(self):
        self.w = setup(SIGNUPS_PER_IP_DAY="2")
        h = {"x-forwarded-for": "203.0.113.200"}
        self.assertEqual(self.sign("a1@example.com", h)[2], 201)
        self.assertEqual(self.sign("a2@example.com", h)[2], 201)
        self.assertEqual(self.sign("a3@example.com", h)[2], 429)


class TestAddons(AbuseBase):
    def refused(self, uid):
        try:
            addons.consume_notes(uid)
            return "ok"
        except ApiError:
            return "refused"

    def test_grant_spend_monthly_first_then_run_out(self):
        _, uid, _ = self.sign()
        self.assertEqual(self.refused(uid), "refused")
        addons.grant(uid, "unit_notes")
        addons.grant(uid, "monthly_notes", quantity=1)
        self.assertEqual(addons.consume_notes(uid), "monthly_notes")
        self.assertEqual(addons.consume_notes(uid), "unit_notes")
        self.assertEqual(self.refused(uid), "refused")
        self.assertEqual(sorted(e["sku"] for e in addons.entitlements_of(uid)), ["monthly_notes", "unit_notes"])

    def test_chatbot_expires_and_renews(self):
        _, uid, _ = self.sign()
        self.assertFalse(addons.has(uid, "chatbot"))
        addons.grant(uid, "chatbot", days=30)
        self.assertTrue(addons.has(uid, "chatbot"))
        get_store().update("entitlements", f"{uid}:chatbot", lambda c: {**c, "validUntil": time.time() * 1000 - 1})
        self.assertFalse(addons.has(uid, "chatbot"))
        addons.grant(uid, "chatbot", days=30)
        self.assertTrue(addons.has(uid, "chatbot"))


if __name__ == "__main__":
    unittest.main()
