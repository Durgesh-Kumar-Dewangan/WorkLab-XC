import json

from wlxc import activity, stats, usage
from wlxc.store import get_store

from .helpers import Base, call, get, post, setup


def send(method, path, body, cookie):
    return call(method, path, body, cookie=cookie)


class TestAdminConsole(Base):
    def start(self):
        self.w = setup(ADMIN_EMAILS="boss@example.com", DEV_EMAILS="dev@example.com")
        self.boss, _ = self.sign_up("boss@example.com", name="The Boss")
        self.dev, _ = self.sign_up("dev@example.com", name="Dee")
        self.ann, _ = self.sign_up("ann@example.com", name="Ann Student")
        self.ann_id = self.user_doc("ann@example.com")["id"]

    def test_only_the_admin_gets_in_not_a_learner_and_not_a_developer(self):
        self.start()
        for path in ("/api/admin/report/users", "/api/admin/report/content", "/api/admin/report/syllabus", "/api/admin/audit", "/api/admin/db/collections", "/api/admin/db/browse?col=users"):
            self.assertEqual(get(path, cookie=self.ann).status, 403, path)
            self.assertEqual(get(path, cookie=self.dev).status, 403, path)  # the developer console is a different, narrower door
            self.assertEqual(get(path).status, 401, path)
            self.assertEqual(get(path, cookie=self.boss).status, 200, path)

    def test_the_users_table_has_hours_courses_and_generation_totals(self):
        self.start()
        usage.consume(self.ann_id, "gen", 3, 100)
        usage.consume(self.ann_id, "images", 2, 100)
        usage.tally(self.ann_id, "jobtopics", 4)
        activity.bump(self.ann_id, minutes=12.5)
        post("/api/courses", {"text": "# Physics\n\n## Unit 1\n- Motion\n- Force"}, cookie=self.ann)
        rows = get("/api/admin/report/users?q=ann", cookie=self.boss).json()["rows"]
        self.assertEqual(len(rows), 1)
        r = rows[0]
        self.assertEqual((r["textGens"], r["imageGens"], r["courses"], r["email"]), (7, 2, 1, "ann@example.com"))  # text = fresh lessons plus topics written in runs
        self.assertEqual(r["minutes"]["today"], 12.5)
        self.assertEqual(r["minutes"]["total"], 12.5)

    def test_clicking_a_name_shows_the_whole_picture_without_secrets(self):
        self.start()
        post("/api/courses", {"text": "# Physics\n\n## Unit 1\n- Motion\n- Force"}, cookie=self.ann)
        usage.consume(self.ann_id, "gen", 1, 100)
        d = get(f"/api/admin/report/user?id={self.ann_id}", cookie=self.boss)
        self.assertEqual(d.status, 200)
        j = d.json()
        for part in ("account", "profile", "rewards", "usage", "time", "courses", "jobs", "library", "assets", "orders", "entitlements", "feedback", "tickets", "audit"):
            self.assertIn(part, j)
        self.assertEqual(j["account"]["email"], "ann@example.com")
        self.assertEqual(len(j["courses"]), 1)
        self.assertEqual(j["usage"]["all"]["gen"], 1)
        self.assertNotIn("hash", json.dumps(j))
        self.assertEqual(get("/api/admin/report/user?id=u_nope", cookie=self.boss).status, 404)
        acts = [a["action"] for a in get_store().find("audit", where={"target": self.ann_id}, limit=20)]
        self.assertIn("admin.user_view", acts)  # looking is recorded
        seen = get("/api/me/access-log", cookie=self.ann).json()["log"]
        self.assertTrue(any("reviewed your account" in x["what"] for x in seen))  # and the learner can see that the team looked

    def test_the_reuse_dashboard_counts_what_was_made_and_what_was_reused(self):
        self.start()
        for how in ("generated", "shared", "shared", "saved"):
            stats.note("topic", how)
        stats.note("image", "generated")
        stats.note("image", "shared")
        c = get("/api/admin/report/content?days=7", cookie=self.boss).json()
        self.assertEqual((c["generated"], c["reused"]), (2, 4))
        self.assertEqual(c["reusePercent"], 66.7)
        topic = next(k for k in c["byKind"] if k["kind"] == "topic")
        self.assertEqual((topic["generated"], topic["shared"], topic["saved"]), (1, 2, 1))
        self.assertIn("pool", c)

    def test_the_database_screen_browses_creates_changes_and_deletes_with_safeguards(self):
        self.start()
        cols = get("/api/admin/db/collections", cookie=self.boss).json()["collections"]
        self.assertIn("users", [c["name"] for c in cols])
        # secrets never leave the server
        doc = get(f"/api/admin/db/doc?col=users&id={self.ann_id}", cookie=self.boss).json()
        self.assertEqual(doc["doc"]["hash"], "[hidden]")
        found = get("/api/admin/db/browse?col=users&q=ann%40example", cookie=self.boss).json()
        self.assertEqual(found["total"], 1)
        # create, change, delete a record in a plain collection
        made = send("POST", "/api/admin/db/doc", {"col": "notes_admin", "id": "n1", "data": {"text": "hello"}}, self.boss)
        self.assertEqual(made.status, 201, made.text)
        self.assertEqual(send("POST", "/api/admin/db/doc", {"col": "notes_admin", "id": "n1", "data": {}}, self.boss).status, 409)
        upd = send("PUT", "/api/admin/db/doc", {"col": "notes_admin", "id": "n1", "data": {"text": "changed", "extra": 1}}, self.boss)
        self.assertEqual(upd.json()["doc"]["text"], "changed")
        self.assertEqual(send("DELETE", "/api/admin/db/doc", {"col": "notes_admin", "id": "n1", "confirm": "wrong"}, self.boss).status, 422)
        self.assertEqual(send("DELETE", "/api/admin/db/doc", {"col": "notes_admin", "id": "n1", "confirm": "n1"}, self.boss).status, 200)
        self.assertIsNone(get_store().get("notes_admin", "n1"))
        actions = [a["action"] for a in get_store().find("audit", limit=100)]
        for a in ("admin.db_create", "admin.db_update", "admin.db_delete"):
            self.assertIn(a, actions)

    def test_the_owner_can_remove_a_feedback_entry_and_it_is_recorded(self):
        self.start()
        st = get_store()
        st.put("feedback", "fb_x", {"id": "fb_x", "uid": self.ann_id, "kind": "session", "rating": 1, "comment": "spam", "tags": [], "created": 1})
        self.assertEqual(send("DELETE", "/api/admin/feedback/fb_x", None, self.ann).status, 403)
        self.assertEqual(send("DELETE", "/api/admin/feedback/fb_x", None, self.boss).status, 200)
        self.assertIsNone(st.get("feedback", "fb_x"))
        self.assertEqual(send("DELETE", "/api/admin/feedback/fb_x", None, self.boss).status, 404)
        self.assertTrue(any(r["action"] == "admin.feedback_delete" and r["target"] == "fb_x" for r in st.find("audit", limit=50)))

    def test_several_feedback_entries_can_be_removed_at_once(self):
        self.start()
        st = get_store()
        for i in range(3):
            st.put("feedback", f"fb_{i}", {"id": f"fb_{i}", "uid": self.ann_id, "kind": "session", "rating": 1, "comment": "", "tags": [], "created": i})
        body = {"ids": ["fb_0", "fb_1", "nope"]}
        self.assertEqual(send("POST", "/api/admin/feedback/delete", body, self.ann).status, 403)
        r = send("POST", "/api/admin/feedback/delete", body, self.boss)
        self.assertEqual((r.status, r.json()["removed"]), (200, 2))
        self.assertEqual([f["id"] for f in st.find("feedback", limit=10)], ["fb_2"])
        self.assertEqual(send("POST", "/api/admin/feedback/delete", {"ids": []}, self.boss).status, 422)

    def test_secrets_and_protected_collections_cannot_be_written_or_deleted(self):
        self.start()
        h = get_store().get("users", self.ann_id)["hash"]
        bad = send("PUT", "/api/admin/db/doc", {"col": "users", "id": self.ann_id, "data": {"hash": "x"}}, self.boss)
        self.assertEqual((bad.status, bad.json()["error"]), (422, "secret_field"))
        self.assertEqual(get_store().get("users", self.ann_id)["hash"], h)
        self.assertEqual(send("PUT", "/api/admin/db/doc", {"col": "users", "id": self.ann_id, "data": {"plan": "learner"}}, self.boss).status, 200)  # a field can be changed
        self.assertEqual(get_store().get("users", self.ann_id)["hash"], h)  # and the secret next to it is untouched
        self.assertEqual(send("PUT", "/api/admin/db/doc", {"col": "users", "id": self.ann_id, "data": {"plan": "x"}, "mode": "replace"}, self.boss).status, 403)
        self.assertEqual(send("DELETE", "/api/admin/db/doc", {"col": "users", "id": self.ann_id, "confirm": self.ann_id}, self.boss).status, 403)
        self.assertEqual(send("POST", "/api/admin/db/doc", {"col": "audit", "id": "x", "data": {}}, self.boss).status, 403)  # the trail cannot be edited
        self.assertEqual(send("POST", "/api/admin/db/doc", {"col": "Bad Name!", "id": "x", "data": {}}, self.boss).status, 400)
        self.assertEqual(send("PUT", "/api/admin/db/doc", {"col": "users", "id": self.ann_id, "data": {"id": "u_other"}}, self.boss).status, 422)

    def test_every_other_learner_and_course_is_invisible_to_a_learner(self):
        self.start()
        post("/api/courses", {"text": "# Chem\n\n## Unit 1\n- Atoms\n- Bonds"}, cookie=self.ann)
        bob, _ = self.sign_up("bob@example.com")
        self.assertEqual(get("/api/courses", cookie=bob).json()["courses"], [])
        self.assertEqual(get("/api/admin/report/users", cookie=bob).status, 403)
