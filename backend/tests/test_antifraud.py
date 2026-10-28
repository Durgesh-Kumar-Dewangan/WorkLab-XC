import unittest

from wlxc import antifraud
from wlxc.store import get_store

from .helpers import Base, STATS, call, cookie_of, delete, get, post, setup


def ck(r, name):
    for c in r.headers.get("set-cookie", "").split("\n"):
        if c.startswith(name + "="):
            return c.split(";")[0]
    return None


class TestEmail(Base):
    def test_canonical_forms(self):
        self.assertEqual(antifraud.canonical_email("A.B.c+promo@Gmail.com"), "abc@gmail.com")
        self.assertEqual(antifraud.canonical_email("x.y+1@googlemail.com"), "xy@gmail.com")
        self.assertEqual(antifraud.canonical_email("a.b+z@school.edu"), "a.b@school.edu")

    def test_alias_of_existing_mailbox_refused_and_not_half_created(self):
        self.sign_up("john.smith@gmail.com")
        _, r = self.sign_up("johnsmith+x@gmail.com")
        self.assertEqual(r.status, 409)
        self.assertIsNone(get_store().get("emails", "johnsmith+x@gmail.com"))

    def test_disposable_domains(self):
        _, r = self.sign_up("x@mailinator.com")
        self.assertEqual((r.status, r.json()["error"]), (422, "disposable_email"))
        self.w = setup(DISPOSABLE_DOMAINS_EXTRA="bad.example")
        self.assertEqual(self.sign_up("x@bad.example")[1].status, 422)
        self.w = setup(BLOCK_DISPOSABLE_EMAIL="0")
        self.assertEqual(self.sign_up("x@mailinator.com")[1].status, 201)

    def test_delete_frees_the_mailbox(self):
        cookie, _ = self.sign_up("a.b@gmail.com")
        delete("/api/me", {"password": "S3cure-pass!"}, cookie=cookie)
        self.assertEqual(self.sign_up("ab@gmail.com")[1].status, 201)


class TestDevice(Base):
    def test_cap_per_device_cookie_and_fingerprint(self):
        self.w = setup(DEVICE_MAX_ACCOUNTS="2")
        c, r = self.sign_up("a@example.com")
        did = ck(r, "wlxc_did")
        self.assertTrue(did)
        self.assertIn("HttpOnly", r.headers["set-cookie"])
        for e in ("b@example.com",):
            r = post("/api/auth/register", {"name": "X", "email": e, "password": "S3cure-pass!"}, headers={"cookie": did})
        self.assertEqual(r.status, 201)  # second account on this device
        r = post("/api/auth/register", {"name": "X", "email": "c@example.com", "password": "S3cure-pass!"}, headers={"cookie": did})
        self.assertEqual((r.status, r.json()["error"]), (403, "device_limit"))
        # clearing cookies does not help if the browser fingerprint repeats
        fp = {"x-wlxc-fp": "F" * 32}
        post("/api/auth/register", {"name": "X", "email": "e@example.com", "password": "S3cure-pass!"}, headers=fp)
        post("/api/auth/register", {"name": "X", "email": "f@example.com", "password": "S3cure-pass!"}, headers=fp)
        r = post("/api/auth/register", {"name": "X", "email": "g@example.com", "password": "S3cure-pass!"}, headers=fp)
        self.assertEqual(r.json()["error"], "device_limit")

    def test_session_cookie_still_first(self):
        _, r = self.sign_up()
        self.assertTrue(r.headers["set-cookie"].startswith("wlxc_sid="))


class TestCountry(Base):
    def test_block_and_allow_lists(self):
        self.w = setup(COUNTRY_BLOCK="KP,IR")
        r = post("/api/auth/register", {"name": "X", "email": "a@example.com", "password": "S3cure-pass!"}, headers={"cf-ipcountry": "IR"})
        self.assertEqual((r.status, r.json()["error"]), (403, "country_blocked"))
        self.assertEqual(post("/api/auth/register", {"name": "X", "email": "a@example.com", "password": "S3cure-pass!"}, headers={"cf-ipcountry": "IN"}).status, 201)
        self.w = setup(COUNTRY_ALLOW="IN")
        r = post("/api/auth/register", {"name": "X", "email": "b@example.com", "password": "S3cure-pass!"}, headers={"x-vercel-ip-country": "US"})
        self.assertEqual(r.json()["error"], "country_blocked")
        self.assertEqual(post("/api/auth/register", {"name": "X", "email": "b@example.com", "password": "S3cure-pass!"}).status, 201)  # unknown country: open by default
        self.w = setup(COUNTRY_ALLOW="IN", COUNTRY_FAIL="closed")
        self.assertEqual(post("/api/auth/register", {"name": "X", "email": "c@example.com", "password": "S3cure-pass!"}).json()["error"], "country_unknown")

    def test_applies_to_generation_for_existing_users(self):
        cookie, _ = self.sign_up()
        self.w = setup(COUNTRY_BLOCK="IR")
        cookie, _ = self.sign_up()
        r = post("/api/courses", {"text": STATS}, cookie=cookie, headers={"cf-ipcountry": "IR"})
        self.assertEqual(r.json()["error"], "country_blocked")


class TestPhone(Base):
    def setUp(self):
        self.w = setup(PHONE_VERIFY="generation", SMS_PROVIDER="msg91", MSG91_AUTH_KEY="k", MSG91_TEMPLATE_ID="t")
        self.codes = []
        import wlxc.antifraud as af
        self._orig = af.send_sms
        af.send_sms = lambda phone, code: self.codes.append((phone, code))
        self.addCleanup(lambda: setattr(af, "send_sms", self._orig))

    def test_required_before_ai_features_then_unlocked(self):
        cookie, _ = self.sign_up()
        self.assertTrue(get("/api/me", cookie=cookie).json()["user"]["phoneRequired"])
        r = post("/api/courses", {"text": STATS}, cookie=cookie)
        self.assertEqual((r.status, r.json()["error"]), (403, "phone_required"))
        self.assertEqual(get("/api/library", cookie=cookie).status, 200)  # reading is not gated
        s = post("/api/phone/start", {"phone": "98765 43210"}, cookie=cookie)
        self.assertEqual(s.status, 200)
        self.assertEqual(self.codes[0][0], "+919876543210")
        self.assertNotIn(self.codes[0][1], s.text)
        bad = post("/api/phone/verify", {"code": "000000" if self.codes[0][1] != "000000" else "111111"}, cookie=cookie)
        self.assertEqual(bad.json()["error"], "wrong_code")
        self.assertEqual(post("/api/phone/verify", {"code": self.codes[0][1]}, cookie=cookie).status, 200)
        self.assertEqual(post("/api/courses", {"text": STATS}, cookie=cookie).status, 201)
        self.assertFalse(get("/api/me", cookie=cookie).json()["user"]["phoneRequired"])

    def test_one_phone_one_account_and_lockout_after_wrong_codes(self):
        a, _ = self.sign_up("a@example.com")
        b, _ = self.sign_up("b@example.com")
        post("/api/phone/start", {"phone": "+919876543210"}, cookie=a)
        post("/api/phone/verify", {"code": self.codes[-1][1]}, cookie=a)
        self.assertEqual(post("/api/phone/start", {"phone": "9876543210"}, cookie=b).json()["error"], "phone_taken")
        post("/api/phone/start", {"phone": "+919000000001"}, cookie=b)
        for _ in range(5):
            post("/api/phone/verify", {"code": "999999"}, cookie=b)
        r = post("/api/phone/verify", {"code": self.codes[-1][1]}, cookie=b)
        self.assertEqual(r.json()["error"], "too_many_tries")

    def test_code_expiry_and_hashing(self):
        cookie, _ = self.sign_up()
        post("/api/phone/start", {"phone": "+919876543210"}, cookie=cookie)
        uid = self.user_doc("asha@example.com")["id"]
        doc = get_store().get("otp", uid)
        self.assertNotIn(self.codes[0][1], str(doc))
        get_store().update("otp", uid, lambda c: {**c, "exp": 1})
        self.assertEqual(post("/api/phone/verify", {"code": self.codes[0][1]}, cookie=cookie).json()["error"], "code_expired")

    def test_bad_numbers_and_rate_limit(self):
        cookie, _ = self.sign_up()
        self.assertEqual(post("/api/phone/start", {"phone": "12345"}, cookie=cookie).status, 422)
        for _ in range(3):
            post("/api/phone/start", {"phone": "+919876543210"}, cookie=cookie)
        self.assertEqual(post("/api/phone/start", {"phone": "+919876543210"}, cookie=cookie).status, 429)

    def test_paid_exempt_option_and_deletion_frees_number(self):
        self.w = setup(PHONE_VERIFY="generation", SMS_PROVIDER="msg91", MSG91_AUTH_KEY="k", MSG91_TEMPLATE_ID="t", PHONE_EXEMPT_PAID="1")
        cookie, _ = self.sign_up()
        self.upgrade("asha@example.com")
        self.assertEqual(post("/api/courses", {"text": STATS}, cookie=cookie).status, 201)
        self.w = setup(PHONE_VERIFY="generation", SMS_PROVIDER="msg91", MSG91_AUTH_KEY="k", MSG91_TEMPLATE_ID="t")
        a, _ = self.sign_up("a@example.com")
        post("/api/phone/start", {"phone": "+919876543210"}, cookie=a)
        post("/api/phone/verify", {"code": self.codes[-1][1]}, cookie=a)
        delete("/api/me", {"password": "S3cure-pass!"}, cookie=a)
        b, _ = self.sign_up("b@example.com")
        self.assertEqual(post("/api/phone/start", {"phone": "+919876543210"}, cookie=b).status, 200)

    def test_off_by_default_and_provider_calls(self):
        self.w = setup()
        cookie, _ = self.sign_up()
        self.assertFalse(get("/api/phone/status", cookie=cookie).json()["enabled"])
        self.assertEqual(post("/api/courses", {"text": STATS}, cookie=cookie).status, 201)

    def test_real_provider_requests(self):
        import wlxc.antifraud as af
        af.send_sms = self._orig
        cookie, _ = self.sign_up()
        post("/api/phone/start", {"phone": "+919876543210"}, cookie=cookie)
        self.assertEqual(self.w.calls[-1]["url"], "https://control.msg91.com/api/v5/flow/")  # unexpected host in fake -> 599 -> 502
        self.assertEqual(self.w.calls[-1]["headers"]["authkey"], "k")


if __name__ == "__main__":
    unittest.main()
