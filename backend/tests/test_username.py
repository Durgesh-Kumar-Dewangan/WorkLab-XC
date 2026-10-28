from wlxc import rewards
from wlxc.store import get_store

from .helpers import Base, call, get, post, setup


def register(email, username=None, **extra):
    body = {"name": "Asha", "email": email, "password": "Str0ng-pass!", "consent": True, **extra}
    if username is not None:
        body["username"] = username
    return call("POST", "/api/auth/register", body)


class TestUsername(Base):
    def setUp(self):
        self.w = setup(REQUIRE_USERNAME="1")

    def test_a_username_is_required_unique_and_checked_for_shape(self):
        self.assertEqual(register("a@example.com").status, 422)  # none given
        self.assertEqual(register("a@example.com", "ab").status, 422)  # too short
        self.assertEqual(register("a@example.com", "bad name!").status, 422)
        self.assertEqual(register("a@example.com", "Admin").status, 422)  # reserved
        ok = register("a@example.com", "Asha_01")
        self.assertEqual(ok.status, 201, ok.text)
        taken = register("b@example.com", "asha_01")  # the same name in other letters
        self.assertEqual((taken.status, taken.json()["error"]), (409, "username_taken"))
        self.assertIsNone(get_store().get("emails", "b@example.com"))  # and no half-made account is left behind

    def test_availability_can_be_checked_before_signing_up(self):
        register("a@example.com", "asha_01")
        self.assertEqual(get("/api/auth/username?u=asha_01").json(), {"valid": True, "reason": "", "available": False})
        self.assertTrue(get("/api/auth/username?u=fresh_name").json()["available"])
        bad = get("/api/auth/username?u=a").json()
        self.assertEqual((bad["valid"], bad["available"]), (False, False))

    def test_sign_in_works_with_the_username_or_the_email(self):
        register("a@example.com", "asha_01", goal="exam", dailyGoal=50)
        by_name = call("POST", "/api/auth/login", {"email": "Asha_01", "password": "Str0ng-pass!"})
        by_mail = call("POST", "/api/auth/login", {"email": "a@example.com", "password": "Str0ng-pass!"})
        self.assertEqual((by_name.status, by_mail.status), (200, 200))
        wrong = call("POST", "/api/auth/login", {"email": "asha_01", "password": "nope-nope"})
        nobody = call("POST", "/api/auth/login", {"email": "no_such_user", "password": "nope-nope"})
        self.assertEqual((wrong.status, nobody.status), (401, 401))
        self.assertEqual(wrong.json()["error"], nobody.json()["error"])  # a wrong name and a wrong password look the same

    def test_the_learners_goal_and_daily_target_are_kept_and_the_leaderboard_uses_the_username(self):
        r = register("a@example.com", "asha_01", goal="exam", dailyGoal=50)
        cookie = r.headers["set-cookie"].split(";")[0]
        u = self.user_doc("a@example.com")
        self.assertEqual((u["profile"]["goal"], u["profile"]["dailyGoal"], u["profile"]["handle"]), ("exam", 50, "asha_01"))
        me = rewards.get(u)
        self.assertEqual((me["goal"]["target"], me["alias"]), (50, "asha_01"))
