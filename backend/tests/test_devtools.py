import time

from wlxc import abuse, devtools, usage
from wlxc.store import get_store

from .helpers import Base, get, post, setup


class TestDevConsole(Base):
    def start(self):
        self.w = setup(DEV_EMAILS="dev@example.com")
        self.dev, _ = self.sign_up("dev@example.com", name="Dee Veloper")
        self.ann, _ = self.sign_up("ann@example.com", name="Ann Secret")
        self.bob, _ = self.sign_up("bob@example.com", name="Bob Other")
        self.ann_id = self.user_doc("ann@example.com")["id"]
        self.ref = get("/api/me/support-ref", cookie=self.ann).json()["ref"]

    def open_case(self, reason="Ticket 4411: lessons will not load"):
        r = post("/api/dev/cases", {"ref": self.ref, "reason": reason}, cookie=self.dev)
        self.assertEqual(r.status, 201, r.text)
        return r.json()["id"]

    def test_only_developers_get_in(self):
        self.start()
        for path in ("/api/dev/issues", "/api/dev/actions"):
            self.assertEqual(get(path, cookie=self.ann).status, 403)
        self.assertEqual(post("/api/dev/cases", {"ref": self.ref, "reason": "just curious about her"}, cookie=self.ann).status, 403)
        self.assertEqual(get("/api/dev/issues").status, 401)
        self.assertEqual(get("/api/dev/issues", cookie=self.dev).status, 200)

    def test_a_case_needs_a_real_reason_and_a_real_reference(self):
        self.start()
        self.assertEqual(post("/api/dev/cases", {"ref": self.ref, "reason": "x"}, cookie=self.dev).status, 422)
        self.assertEqual(post("/api/dev/cases", {"ref": "WLX-NOPE00", "reason": "Ticket 1: checking a thing"}, cookie=self.dev).status, 404)
        own = get("/api/me/support-ref", cookie=self.dev).json()["ref"]
        self.assertEqual(post("/api/dev/cases", {"ref": own, "reason": "Ticket 2: looking at myself"}, cookie=self.dev).status, 400)

    def test_the_view_has_status_but_no_personal_data(self):
        self.start()
        cid = self.open_case()
        v = get(f"/api/dev/cases/{cid}", cookie=self.dev)
        self.assertEqual(v.status, 200)
        text = v.text
        for secret in ("ann@example.com", "Ann Secret", "Ann", "hash", "bob@example.com"):
            self.assertNotIn(secret, text)
        j = v.json()
        self.assertEqual(j["account"]["emailHint"], "a***@example.com")
        self.assertIn("lessons", j["hidden"])
        self.assertEqual(v.headers.get("cache-control"), "private, no-store")

    def test_another_developer_cannot_use_my_case_and_it_ends(self):
        self.start()
        cid = self.open_case()
        other, _ = self.sign_up("dev2@example.com")
        get_store().update("users", self.user_doc("dev2@example.com")["id"], lambda c: {**c, "role": "developer"})
        self.assertEqual(get(f"/api/dev/cases/{cid}", cookie=other).status, 404)
        get_store().update("cases", cid, lambda c: {**c, "until": time.time() * 1000 - 1})
        self.assertEqual(get(f"/api/dev/cases/{cid}", cookie=self.dev).status, 403)
        cid2 = self.open_case()
        post(f"/api/dev/cases/{cid2}/close", {}, cookie=self.dev)
        self.assertEqual(get(f"/api/dev/cases/{cid2}", cookie=self.dev).status, 403)

    def test_a_fix_works_and_is_recorded_for_the_learner_to_read(self):
        self.start()
        usage.consume(self.ann_id, "gen", 6, 6)
        cid = self.open_case("Ticket 4411: quota used by a failed run")
        r = post(f"/api/dev/cases/{cid}/act", {"action": "reset_usage", "note": "failed run ate the allowance"}, cookie=self.dev)
        self.assertEqual(r.status, 200, r.text)
        self.assertEqual(usage.used(self.ann_id, "gen"), 0)
        self.assertEqual(post(f"/api/dev/cases/{cid}/act", {"action": "delete_everything"}, cookie=self.dev).status, 400)
        log = get("/api/me/access-log", cookie=self.ann).json()["log"]
        whats = [x["what"] for x in log]
        self.assertIn("Support opened a case on your account", whats)
        self.assertIn("Support gave back today's allowance", whats)
        self.assertTrue(any("Ticket 4411" in x["why"] for x in log))
        self.assertNotIn("Dee", str(log))  # the learner learns that support looked, never which person
        self.assertEqual(get("/api/me/access-log", cookie=self.bob).json()["log"], [])  # and nobody else's trail

    def test_server_faults_are_kept_against_the_learner_scrubbed_and_grouped(self):
        self.start()
        u = self.user_doc("ann@example.com")
        devtools.record_issue(u, "POST", "/api/courses/c-abc-123456/public", 500, "internal", "failed for ann@example.com token AbCdEfGhIjKlMnOpQrStUvWxYz123456 id 12345678", "rid1")
        devtools.record_issue(u, "POST", "/api/courses/c-zzz-999999/public", 500, "internal", "again", "rid2")
        rows = get("/api/dev/issues", cookie=self.dev).json()["issues"]
        self.assertEqual(len(rows), 1)  # one fault, however many courses
        i = rows[0]
        self.assertEqual((i["count"], i["learners"], i["route"]), (2, 1, "POST /api/courses/{id}/public"))
        self.assertNotIn("ann@example.com", i["message"])
        self.assertNotIn("AbCdEf", i["message"])
        self.assertEqual(i["samples"], [self.ref])
        s = post(f"/api/dev/issues/{i['id']}", {"state": "resolved", "note": "fixed in the next release"}, cookie=self.dev)
        self.assertEqual(s.status, 200)
        devtools.record_issue(u, "POST", "/api/courses/c-new-111111/public", 500, "internal", "back again", "rid3")
        self.assertEqual(get("/api/dev/issues", cookie=self.dev).json()["issues"][0]["state"], "open")  # a fix that did not hold reopens it

    def test_a_crash_in_a_real_request_is_recorded(self):
        self.start()
        from wlxc import api as apimod
        orig = apimod.courses.list_course_docs
        apimod.courses.list_course_docs = lambda u: (_ for _ in ()).throw(RuntimeError("boom for ann@example.com"))
        try:
            self.assertEqual(get("/api/courses", cookie=self.ann).status, 500)
        finally:
            apimod.courses.list_course_docs = orig
        rows = get("/api/dev/issues", cookie=self.dev).json()["issues"]
        self.assertEqual([r["route"] for r in rows], ["GET /api/courses"])
        self.assertNotIn("ann@example.com", rows[0]["message"])

    def test_the_audit_trail_has_every_look(self):
        self.start()
        cid = self.open_case()
        get(f"/api/dev/cases/{cid}", cookie=self.dev)
        acts = [a["action"] for a in get_store().find("audit", where={"target": self.ann_id}, limit=20)]
        self.assertIn("dev.case_open", acts)
        self.assertIn("dev.view", acts)
