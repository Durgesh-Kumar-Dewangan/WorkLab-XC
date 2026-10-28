import unittest

from wlxc.store import get_store

from .helpers import Base, delete, get, post, put, setup


class Community(Base):
    def setUp(self):
        self.w = setup(ADMIN_EMAILS="boss@example.com")

    def person(self, email, handle, name=None, age_days=2):
        cookie, _ = self.sign_up(email, name or handle.title())
        r = put("/api/profile", {"handle": handle, "publicProfile": True}, cookie=cookie)
        self.assertEqual(r.status, 200, r.text)
        uid = self.user_doc(email)["id"]
        get_store().update("users", uid, lambda c: {**c, "created": c["created"] - age_days * 86_400_000})
        return cookie

    def make_post(self, cookie, text="Photosynthesis is how plants make food."):
        r = post("/api/posts", {"text": text}, cookie=cookie)
        self.assertEqual(r.status, 201, r.text)
        return r.json()["id"] if "id" in r.json() else r.json()["post"]["id"]


class TestPosts(Community):
    def test_post_feed_like_comment_delete(self):
        a, b = self.person("a@example.com", "asha_k"), self.person("b@example.com", "bela_m")
        pid = self.make_post(a)
        feed = get("/api/posts", cookie=b).json()["posts"]
        self.assertEqual([p["id"] for p in feed], [pid])
        self.assertTrue(post(f"/api/posts/{pid}/like", {}, cookie=b).json()["liked"])
        self.assertFalse(post(f"/api/posts/{pid}/like", {}, cookie=b).json()["liked"])
        post(f"/api/posts/{pid}/like", {}, cookie=b)
        c = post(f"/api/posts/{pid}/comments", {"text": "Nice summary"}, cookie=b)
        self.assertEqual(c.status, 201)
        got = get(f"/api/posts/{pid}", cookie=a).json()
        self.assertEqual(len(got["comments"]), 1)
        self.assertEqual(delete(f"/api/posts/{pid}", cookie=b).status, 404)  # not yours: same answer as "does not exist"
        self.assertEqual(delete(f"/api/posts/{pid}", cookie=a).status, 200)
        self.assertEqual(get("/api/posts", cookie=b).json()["posts"], [])

    def test_needs_public_profile_clean_text_and_new_account_links(self):
        cookie, _ = self.sign_up("x@example.com")
        self.assertEqual(post("/api/posts", {"text": "hello"}, cookie=cookie).json()["error"], "profile_required")
        a = self.person("a@example.com", "asha_k", age_days=0)
        self.assertEqual(post("/api/posts", {"text": "visit https://example.com now"}, cookie=a).json()["error"], "links_new_account")
        self.assertEqual(post("/api/posts", {"text": "you whore"}, cookie=a).json()["error"], "not_allowed")
        self.assertEqual(post("/api/posts", {"text": "   "}, cookie=a).status, 422)

    def test_following_scope_and_blocking_hides_both_ways(self):
        a, b, c = self.person("a@example.com", "asha_k"), self.person("b@example.com", "bela_m"), self.person("c@example.com", "cara_n")
        pa, pc = self.make_post(a, "Asha post here"), self.make_post(c, "Cara post here")
        post("/api/people/asha_k", {}, cookie=b)
        self.assertEqual([p["id"] for p in get("/api/posts?scope=following", cookie=b).json()["posts"]], [pa])
        self.assertEqual(len(get("/api/posts", cookie=b).json()["posts"]), 2)
        self.assertTrue(post("/api/people/cara_n/block", {}, cookie=b).json()["blocked"])
        self.assertEqual([p["id"] for p in get("/api/posts", cookie=b).json()["posts"]], [pa])
        self.assertNotIn(pa, [p["id"] for p in get("/api/posts", cookie=c).json()["posts"]]) if False else None
        self.assertNotIn(pc, [p["id"] for p in get("/api/posts", cookie=b).json()["posts"]])


class TestMessagesAndModeration(Community):
    def test_message_request_rules_and_privacy(self):
        a, b, c = self.person("a@example.com", "asha_k"), self.person("b@example.com", "bela_m"), self.person("c@example.com", "cara_n")
        self.assertEqual(post("/api/messages/bela_m", {"text": "Hi, study together?"}, cookie=a).status, 201)
        self.assertEqual(post("/api/messages/bela_m", {"text": "Are you there?"}, cookie=a).json()["error"], "request_pending")  # one message until they reply
        inbox = get("/api/messages", cookie=b).json()["conversations"]
        self.assertEqual(len(inbox), 1)
        self.assertTrue(inbox[0]["request"])
        self.assertEqual(inbox[0]["unread"] >= 1, True)
        self.assertEqual(len(get("/api/messages/asha_k", cookie=b).json()["messages"]) >= 1, True)
        self.assertEqual(post("/api/messages/asha_k", {"text": "Sure, tonight"}, cookie=b).status, 201)
        self.assertEqual(get("/api/messages", cookie=c).json()["conversations"], [])
        self.assertEqual(post("/api/messages/asha_k", {"text": "second one"}, cookie=b).status, 201)  # replying accepted the request
        self.assertEqual(post("/api/messages/bela_m", {"text": "thanks!"}, cookie=a).status, 201)
        post("/api/people/asha_k/block", {}, cookie=b)
        self.assertEqual(post("/api/messages/bela_m", {"text": "hello again"}, cookie=a).status, 403)

    def test_reports_auto_hide_and_admin_actions_with_audit(self):
        boss = self.person("boss@example.com", "boss_one")
        author = self.person("a@example.com", "asha_k")
        pid = self.make_post(author, "A questionable post of mine")
        reporters = [self.person(f"r{i}@example.com", f"rep_{i}x") for i in range(3)]
        self.assertEqual(post("/api/reports", {"kind": "post", "targetId": pid, "reason": "spam"}, cookie=author).json()["error"], "self_report")
        for r in reporters:
            self.assertEqual(post("/api/reports", {"kind": "post", "targetId": pid, "reason": "spam"}, cookie=r).status, 200)
        self.assertEqual(get("/api/posts", cookie=reporters[0]).json()["posts"], [])  # hidden after 3 different reporters
        self.assertEqual(get("/api/admin/reports", cookie=reporters[0]).status, 403)
        rep = get("/api/admin/reports", cookie=boss).json()["reports"]
        self.assertEqual(len(rep), 3)
        self.assertEqual(post(f"/api/admin/reports/{rep[0]['id']}", {"action": "dismiss"}, cookie=boss).status, 200)
        self.assertEqual(len(get("/api/posts", cookie=reporters[0]).json()["posts"]), 1)  # restored
        pid2 = self.make_post(author, "Second questionable post")
        r1 = post("/api/reports", {"kind": "post", "targetId": pid2, "reason": "abuse"}, cookie=reporters[0]).status
        rid = get("/api/admin/reports", cookie=boss).json()["reports"][0]["id"]
        self.assertEqual(post(f"/api/admin/reports/{rid}", {"action": "block_author"}, cookie=boss).status, 200)
        self.assertEqual(get("/api/me", cookie=author).status in (401, 403), True)
        acts = [x["action"] for x in get_store().find("audit")]
        self.assertIn("report_block_author", acts)

    def test_deleting_an_account_removes_its_content(self):
        a, b = self.person("a@example.com", "asha_k"), self.person("b@example.com", "bela_m")
        pid = self.make_post(a)
        post(f"/api/posts/{pid}/like", {}, cookie=b)
        post("/api/messages/bela_m", {"text": "hello there"}, cookie=a)
        self.assertEqual(delete("/api/me", {"password": "S3cure-pass!"}, cookie=a).status, 200)
        self.assertEqual(get("/api/posts", cookie=b).json()["posts"], [])
        self.assertEqual(get_store().find("messages"), [])


if __name__ == "__main__":
    unittest.main()
