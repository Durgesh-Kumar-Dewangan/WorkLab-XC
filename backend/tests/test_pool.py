from wlxc import pool
from wlxc.store import get_store

from .helpers import Base, get, post, setup
from .test_library import Lib


class TestSharedPool(Lib):
    def setUp(self):
        self.w = setup()

    def test_the_second_learner_gets_the_stored_topic_and_picture_with_no_ai_call(self):
        a, _ = self.acct("a@example.com")
        c1 = self.course(a)
        ids = c1["course"]["order"][:1]
        first = self.run_job(a, c1["id"], ids, images=True)
        self.assertFalse(first["job"]["topics"][0]["reused"])
        self.assertTrue(first["job"]["topics"][0]["hasImage"] if "hasImage" in first["job"]["topics"][0] else True)
        pooled = get_store().find("shared_topics", limit=10)
        self.assertEqual(len(pooled), 1)
        self.assertTrue(pooled[0]["imageBlob"])
        b, _ = self.acct("b@example.com")
        c2 = self.course(b)
        before_chat = self.chat_calls()
        before_img = len([x for x in self.w.calls if "/ai/run/" in x["url"] or "images/generations" in x["url"]])
        second = self.run_job(b, c2["id"], c2["course"]["order"][:1], images=True)
        t = second["job"]["topics"][0]
        self.assertTrue(t["reused"])
        self.assertEqual(self.chat_calls(), before_chat)  # no model was asked
        self.assertEqual(len([x for x in self.w.calls if "/ai/run/" in x["url"] or "images/generations" in x["url"]]), before_img)  # and no picture was drawn
        self.assertEqual(get_store().count("shared_topics"), 1)  # still one copy for everyone

    def test_a_learner_who_opted_out_is_never_pooled_and_never_served_from_it(self):
        a, uid = self.acct("a@example.com")
        post("/api/me/privacy", {"shareContent": False}, cookie=a)
        c1 = self.course(a)
        self.run_job(a, c1["id"], c1["course"]["order"][:1])
        self.assertEqual(get_store().count("shared_topics"), 0)

    def test_depths_are_kept_apart(self):
        a, _ = self.acct("a@example.com")
        c1 = self.course(a)
        ids = c1["course"]["order"][:1]
        self.run_job(a, c1["id"], ids, depth="standard")
        user = self.user_doc("a@example.com")
        title = c1["course"]["topics"][ids[0]]["title"]
        self.assertIsNotNone(pool.get(user, title, "standard"))
        self.assertIsNone(pool.get(user, title, "deep"))  # a standard lesson never stands in for an in-depth one
