from wlxc import courses

from .helpers import Base, get, post, put, setup

SYL = "Unit 1: Motion\nVelocity\nAcceleration\nUnit 2: Forces\nNewton's laws\nFriction\n"


class TestPublicSyllabus(Base):
    def test_publish_browse_copy_and_report(self):
        self.w = setup()
        ca, _ = self.sign_up("a@example.com")
        cb, _ = self.sign_up("b@example.com")
        a, b = self.user_doc("a@example.com"), self.user_doc("b@example.com")
        doc = courses.ingest_syllabus(a, text=SYL, title="Physics 101")
        self.assertEqual(get("/api/syllabi", cookie=cb).json()["syllabi"], [])  # private until published
        r = put(f"/api/courses/{doc['id']}/public", {"public": True}, cookie=ca)
        self.assertTrue(r.json()["public"])
        rows = get("/api/syllabi", cookie=cb).json()["syllabi"]
        self.assertEqual([x["title"] for x in rows], ["Physics 101"])
        self.assertNotIn("@", rows[0]["publisher"])  # a league name, never an email
        self.assertEqual(len(get("/api/syllabi?q=chem", cookie=cb).json()["syllabi"]), 0)
        units = get(f"/api/syllabi/{doc['id']}", cookie=cb).json()["units"]
        self.assertEqual([u["title"] for u in units][:1], ["Unit 1: Motion"])
        self.assertEqual(post(f"/api/syllabi/{doc['id']}/add", {}, cookie=cb).status, 201)
        self.assertEqual(len(get("/api/courses", cookie=cb).json()["courses"]), 1)
        self.assertEqual(get("/api/syllabi", cookie=cb).json()["syllabi"][0]["adds"], 1)
        # someone else cannot publish or unpublish a course that is not theirs
        self.assertEqual(put(f"/api/courses/{doc['id']}/public", {"public": False}, cookie=cb).status, 403)
        self.assertFalse(put(f"/api/courses/{doc['id']}/public", {"public": False}, cookie=ca).json()["public"])
        self.assertEqual(get(f"/api/syllabi/{doc['id']}", cookie=cb).status, 404)
