import json

from wlxc import byok, llm, net, usage
from wlxc.errors import ApiError
from wlxc.store import get_store

from .helpers import Base, call, delete, get, put, setup

KEY = "sk-test-ABCDEFGHIJKLMNOP1234"


class TestOwnKey(Base):
    def start(self):
        self.w = setup(ADMIN_EMAILS="boss@example.com")
        self.ann, _ = self.sign_up("ann@example.com", name="Ann")
        self.uid = self.user_doc("ann@example.com")["id"]
        self.boss, _ = self.sign_up("boss@example.com", name="Boss")

    def connect(self, key=KEY, provider="openai", **extra):
        return put("/api/me/ai-key", {"provider": provider, "key": key, **extra}, cookie=self.ann)

    def test_a_working_key_is_saved_encrypted_and_never_shown_again(self):
        self.start()
        r = self.connect()
        self.assertEqual(r.status, 200)
        j = r.json()
        self.assertTrue(j["connected"])
        self.assertEqual((j["provider"], j["last4"]), ("openai", KEY[-4:]))
        self.assertNotIn(KEY, json.dumps(j))
        stored = get_store().get("usercreds", self.uid)
        self.assertNotIn(KEY, json.dumps(stored))
        self.assertEqual(byok.credentials(self.uid)[1], KEY)  # the server can still use it
        again = get("/api/me/ai-key", cookie=self.ann).json()
        self.assertNotIn(KEY, json.dumps(again))
        me = get("/api/me", cookie=self.ann).json()["user"]
        self.assertEqual((me["plan"], me["byok"]), ("prototype", True))  # still on the free plan, with every feature open

    def test_every_request_goes_to_their_provider_with_their_key(self):
        self.start()
        self.connect()
        before = len(self.w.calls)
        with byok.as_user(self.uid):
            llm.complete("Reply with the single word: ok", "hello")
        new = self.w.calls[before:]
        self.assertTrue(new and all("api.openai.com" in c["url"] for c in new))
        self.assertTrue(all(c["headers"]["authorization"] == f"Bearer {KEY}" for c in new))
        before = len(self.w.calls)
        llm.complete("Reply with the single word: ok", "hello")  # someone without a key uses ours
        self.assertTrue(all("api.openai.com" not in c["url"] for c in self.w.calls[before:]))

    def test_our_limits_do_not_apply_while_their_key_works(self):
        self.start()
        with self.assertRaises(ApiError):
            usage.consume(self.uid, "gen", 1, 0)
        self.connect()
        usage.consume(self.uid, "gen", 5, 0)  # no error: it is on their own account
        self.assertTrue(usage.consume_month(self.uid, "freechat", 0))
        delete("/api/me/ai-key", cookie=self.ann)
        with self.assertRaises(ApiError):
            usage.consume(self.uid, "gen", 1, 0)

    def test_a_key_the_provider_refuses_is_not_saved(self):
        self.start()
        inner = net._transport

        def refuse(method, url, headers, body, timeout):
            if (headers or {}).get("authorization", "").endswith("sk-bad-0000000000000"):
                return net.Resp(401, b'{"error":"invalid key sk-bad-0000000000000"}')
            return inner(method, url, headers, body, timeout)

        net.set_transport(refuse)
        r = self.connect(key="sk-bad-0000000000000")
        self.assertEqual((r.status, r.json()["error"]), (422, "key_rejected"))
        self.assertNotIn("sk-bad-0000000000000", r.text)
        self.assertIsNone(get_store().get("usercreds", self.uid))

    def test_a_key_that_stops_working_is_switched_off_and_they_are_told(self):
        self.start()
        self.connect()
        inner = net._transport
        net.set_transport(lambda m, u, h, b, t: net.Resp(401, b"revoked") if "api.openai.com" in u else inner(m, u, h, b, t))
        with byok.as_user(self.uid):
            with self.assertRaises(ApiError) as e:
                llm.complete("Reply with the single word: ok", "hello")
        self.assertEqual(e.exception.code, "byok_rejected")
        self.assertFalse(get("/api/me", cookie=self.ann).json()["user"]["byok"])
        self.assertEqual(get("/api/me/ai-key", cookie=self.ann).json()["status"], "rejected")

    def test_only_listed_providers_and_real_looking_keys_are_accepted(self):
        self.start()
        self.assertEqual(self.connect(provider="evil.example.com").status, 422)
        self.assertEqual(self.connect(key="short").status, 422)
        self.assertEqual(self.connect(key="has spaces in it 12345").status, 422)
        self.assertEqual(call("PUT", "/api/me/ai-key", {"provider": "openai", "key": KEY}).status, 401)
        self.assertEqual(self.connect(model="bad model!!").status, 422)

    def test_staff_cannot_read_the_key_and_the_trail_holds_no_secret(self):
        self.start()
        self.connect()
        doc = get(f"/api/admin/db/doc?col=usercreds&id={self.uid}", cookie=self.boss).json()
        self.assertEqual(doc["doc"]["keyEnc"], "[hidden]")
        self.assertTrue(doc["readOnly"])
        trail = json.dumps(get_store().find("audit", limit=200))
        self.assertNotIn(KEY, trail)
        self.assertIn("byok.connect", trail)

    def test_deleting_the_account_deletes_the_key(self):
        self.start()
        self.connect()
        get_store().put("usercreds", "u_gone", {"id": "u_gone"})
        byok.disconnect(self.uid)
        self.assertIsNone(get_store().get("usercreds", self.uid))
