import unittest

from wlxc import fair
from wlxc.errors import ApiError

from .helpers import Base, get, post, setup


class TestIsolation(Base):
    def test_one_account_cannot_run_more_than_its_share_and_others_are_unaffected(self):
        with fair.slot("u_a", 1):
            with self.assertRaises(ApiError) as e:
                with fair.slot("u_a", 1):
                    pass
            self.assertEqual(e.exception.code, "busy")
            with fair.slot("u_b", 1):  # another learner is not blocked by u_a's work
                self.assertEqual(fair.snapshot()["users"], 2)
        self.assertEqual(fair.snapshot()["running"], 0)

    def test_server_wide_cap_answers_busy_not_slow(self):
        self.w = setup(FAIR_GLOBAL_HEAVY="2")
        with fair.slot("a", 1), fair.slot("b", 1):
            with self.assertRaises(ApiError) as e:
                with fair.slot("c", 1):
                    pass
            self.assertEqual((e.exception.status, e.exception.code), (503, "server_busy"))

    def test_signup_requires_every_detail_when_enabled(self):
        self.w = setup(REQUIRE_SIGNUP_PROFILE="1")
        base = {"name": "Asha Verma", "email": "asha@example.com", "password": "Passw0rd!x", "consent": True}
        r = post("/api/auth/register", base)
        self.assertEqual((r.status, r.json()["error"]), (422, "profile_required"))
        full = {**base, "age": 19, "education": "college", "category": "university", "label": "B.Tech 2nd year", "institute": "CSVTU"}
        ok = post("/api/auth/register", full)
        self.assertEqual(ok.status, 201, ok.text)

    def test_users_only_see_their_own_courses(self):
        a, _ = self.sign_up("a@example.com")
        b, _ = self.sign_up("b@example.com")
        r = post("/api/courses", {"text": "# Algorithms\n\n## Unit 1\n- Big O notation", "title": ""}, cookie=a)
        self.assertEqual(r.status, 201, r.text)
        cid = r.json()["id"]
        self.assertIn(get(f"/api/courses/{cid}", cookie=b).status, (403, 404))
        self.assertEqual(get(f"/api/courses/{cid}", cookie=a).status, 200)


class TestGoogleSignIn(Base):
    G = {"email": "gita@example.com", "name": "Gita Rao", "picture": "", "sub": "123"}

    def test_new_google_user_must_give_details_then_is_verified_and_signed_in(self):
        from unittest import mock
        self.w = setup(GOOGLE_CLIENT_ID="cid", REQUIRE_SIGNUP_PROFILE="1")
        with mock.patch("wlxc.googleauth.verify", return_value=self.G):
            first = post("/api/auth/google", {"credential": "x" * 30})
            self.assertEqual(first.status, 200)
            self.assertTrue(first.json()["needsProfile"])  # nothing is created yet
            from wlxc.store import get_store
            self.assertIsNone(get_store().get("emails", "gita@example.com"))
            full = {"credential": "x" * 30, "consent": True, "age": 20, "education": "college", "category": "university", "label": "B.Tech", "institute": "CSVTU"}
            ok = post("/api/auth/google", full)
            self.assertEqual(ok.status, 201, ok.text)
            self.assertTrue(self.user_doc("gita@example.com")["emailVerified"])
            again = post("/api/auth/google", {"credential": "x" * 30})  # an existing user simply signs in
            self.assertEqual(again.status, 200)
            self.assertEqual(again.json()["email"], "gita@example.com")

    def test_token_for_another_site_is_refused(self):
        from unittest import mock
        from wlxc import googleauth
        self.w = setup(GOOGLE_CLIENT_ID="cid")
        bad = mock.Mock(ok=True)
        bad.json.return_value = {"aud": "someone-else", "iss": "accounts.google.com", "email_verified": "true", "exp": "9999999999", "email": "a@b.co", "sub": "1"}
        with mock.patch("wlxc.googleauth.http", return_value=bad):
            with self.assertRaises(ApiError) as e:
                googleauth.verify("t" * 30)
        self.assertEqual(e.exception.code, "google_invalid")


if __name__ == "__main__":
    unittest.main()
