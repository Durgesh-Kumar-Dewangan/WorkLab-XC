import unittest

from wlxc.store import get_store

from .helpers import Base, get, post, put, setup


class People(Base):
    def setUp(self):
        self.w = setup(ADMIN_EMAILS="boss@example.com")

    def up(self, email, name="Asha", **extra):
        cookie, r = self.sign_up(email, name, **extra)
        return cookie, r


class TestConsentProfile(People):
    def test_consent_required_and_version_recorded(self):
        self.w = setup(REQUIRE_CONSENT="1")
        _, no = self.up("a@example.com")
        self.assertEqual(no.status, 400)
        self.assertEqual(no.json()["error"], "consent_required")
        cookie, yes = self.up("a@example.com", consent=True)
        self.assertEqual(yes.status, 201)
        self.assertTrue(get("/api/profile", cookie=cookie).json()["consent"]["version"])

    def test_profile_cleaned(self):
        cookie, _ = self.up("b@example.com")
        j = put("/api/profile", {"category": "ncert", "label": "Class 11 <b>", "institute": "Delhi Public School", "rank": "12", "hacker": "x", "ageBand": "nope"}, cookie=cookie).json()
        p = j["profile"]
        self.assertEqual(p["category"], "ncert")
        self.assertEqual(p["label"], "Class 11 b")
        self.assertEqual(p["ageBand"], "")
        self.assertNotIn("hacker", p)

    def test_unique_handles_and_institute_suggestions(self):
        a, _ = self.up("c@example.com")
        b, _ = self.up("d@example.com")
        self.assertEqual(put("/api/profile", {"handle": "asha_k", "institute": "Delhi Public School"}, cookie=a).status, 200)
        self.assertEqual(put("/api/profile", {"handle": "asha_k"}, cookie=b).status, 409)
        self.assertEqual(put("/api/profile", {"handle": "x"}, cookie=b).status, 400)
        self.assertEqual(put("/api/profile", {"publicProfile": True}, cookie=b).status, 400)
        self.assertEqual(get("/api/institutes?q=delhi pub", cookie=b).json()["institutes"], ["Delhi Public School"])


class TestAdminUsers(People):
    def test_closed_to_non_admins(self):
        cookie, _ = self.up("e@example.com")
        self.assertEqual(get("/api/admin/users", cookie=cookie).status, 403)
        self.assertEqual(post("/api/admin/users/x", {"action": "unblock"}, cookie=cookie).status, 403)

    def test_table_search_sort_csv(self):
        boss, _ = self.up("boss@example.com", "Boss")
        a, ar = self.up("f@example.com", "Farah")
        self.up("g@example.com", "Gita")
        put("/api/profile", {"category": "university", "label": "B.Tech Y2", "institute": "IIT Delhi", "rank": '=HYPERLINK("x")'}, cookie=a)
        post("/api/sessions", {}, cookie=a)
        j = get("/api/admin/users?q=farah", cookie=boss).json()
        self.assertEqual(j["total"], 1)
        row = j["rows"][0]
        self.assertEqual([row["name"], row["email"], row["category"], row["label"], row["institute"]], ["Farah", "f@example.com", "university", "B.Tech Y2", "IIT Delhi"])
        self.assertEqual(row["today"]["sessions"], 1)
        self.assertEqual(row["id"], ar.json()["id"])
        self.assertEqual(len(get("/api/admin/users?sort=name&dir=asc", cookie=boss).json()["rows"]), 3)
        csv = get("/api/admin/users?format=csv", cookie=boss).text
        self.assertIn("institute", csv.split("\n")[0])
        self.assertIn("'=HYPERLINK", csv)
        self.assertNotIn(",=HYPERLINK", csv)

    def test_actions_and_audit(self):
        boss, br = self.up("boss@example.com", "Boss")
        a, ar = self.up("h@example.com", "Hari")
        act = lambda b, uid=None: post(f"/api/admin/users/{uid or ar.json()['id']}", b, cookie=boss)  # noqa: E731
        self.assertEqual(act({"action": "block", "reason": "Abuse", "minutes": 60}).status, 200)
        self.assertEqual(get("/api/me", cookie=a).status, 401)
        self.assertEqual(act({"action": "unblock"}).status, 200)
        self.assertEqual(act({"action": "grant_plan", "plan": "learner", "days": 30}).status, 200)
        self.assertEqual(act({"action": "grant_addon", "sku": "chatbot", "days": 30}).status, 200)
        self.assertEqual(act({"action": "reset_quota"}).status, 200)
        row = get("/api/admin/users?q=hari", cookie=boss).json()["rows"][0]
        self.assertEqual(row["plan"], "learner")
        self.assertEqual(row["addons"], ["chatbot"])
        audit = sorted(x["action"] for x in get_store().find("audit"))
        self.assertEqual(audit, ["block", "grant_addon", "grant_plan", "reset_quota", "unblock"])
        self.assertEqual(act({"action": "block", "reason": "x"}).status, 200)
        self.assertEqual(act({"action": "block", "reason": "x"}, br.json()["id"]).status, 400)


class TestSocial(People):
    def test_opt_in_profiles_follow_leaderboard(self):
        a, _ = self.up("s1@example.com", "Sia")
        b, _ = self.up("s2@example.com", "Sam")
        put("/api/profile", {"handle": "sia_k", "bio": "Physics fan"}, cookie=a)
        self.assertEqual(get("/api/people/sia_k", cookie=b).status, 404)
        put("/api/profile", {"publicProfile": True, "leaderboard": True}, cookie=a)
        self.assertEqual(get("/api/people/sia_k", cookie=b).json()["name"], "Sia")
        self.assertTrue(post("/api/people/sia_k", {}, cookie=b).json()["following"])
        self.assertEqual(get("/api/people/sia_k", cookie=b).json()["followers"], 1)
        self.assertFalse(post("/api/people/sia_k", {}, cookie=b).json()["following"])
        self.assertEqual(post("/api/people/sia_k", {}, cookie=a).status, 400)
        self.assertEqual([r["handle"] for r in get("/api/leaderboard", cookie=b).json()["rows"]], ["sia_k"])


if __name__ == "__main__":
    unittest.main()
