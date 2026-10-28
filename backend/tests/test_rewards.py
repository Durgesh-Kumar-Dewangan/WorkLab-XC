import unittest

from wlxc import addons, rewards
from wlxc.errors import ApiError
from wlxc.store import get_store

from .helpers import Base, get, post, put, setup


class TestRewards(Base):
    def free(self, email="a@example.com"):
        self.w = setup()
        cookie, _ = self.sign_up(email)
        return cookie, self.user_doc(email)

    def test_points_double_with_each_right_answer_in_a_row_and_start_again_after_a_miss(self):
        cookie, u = self.free()
        gains = [rewards.on_answer(u, True)["xp"] for _ in range(6)]
        self.assertEqual(gains, [10, 20, 40, 80, 160, 160])  # doubles, then stays at the top
        miss = rewards.on_answer(u, False)
        self.assertEqual((miss["xp"], miss["combo"]), (0, 0))
        self.assertEqual(rewards.on_answer(u, True)["xp"], 10)
        me = get("/api/play/me", cookie=cookie).json()
        self.assertEqual(me["xp"], 10 + 20 + 40 + 80 + 160 + 160 + 10)

    def test_the_daily_goal_starts_a_streak_and_pays_gems(self):
        cookie, u = self.free()
        r = [rewards.on_answer(u, True) for _ in range(3)]  # 10 + 20 + 40 = 70, past the goal of 30
        self.assertTrue(r[2]["goalHit"] or r[1]["goalHit"])
        me = rewards.get(u)
        self.assertEqual(me["streak"], 1)
        self.assertTrue(me["goal"]["met"])
        self.assertGreaterEqual(me["gems"], 3 + 3)  # 3 right answers and the goal bonus

    def test_free_hearts_run_out_paid_ones_do_not(self):
        cookie, u = self.free()
        last = {}
        for _ in range(5):
            last = rewards.on_answer(u, False)
        self.assertEqual(last["hearts"], 0)
        self.assertTrue(last["outOfHearts"])
        self.assertEqual(rewards.get(u)["hearts"]["n"], 0)
        self.upgrade("a@example.com")
        paid = self.user_doc("a@example.com")
        self.assertTrue(rewards.get(paid)["hearts"]["unlimited"])
        self.assertFalse(rewards.on_answer(paid, False)["outOfHearts"])

    def test_gems_buy_a_heart_refill_and_extras_that_the_gates_honour(self):
        cookie, u = self.free()
        for _ in range(5):
            rewards.on_answer(u, False)
        with self.assertRaises(ApiError):
            rewards.buy(u, "heart")  # no gems yet
        get_store().update("rewards", u["id"], lambda c: {**c, "gems": 100})
        self.assertEqual(rewards.buy(u, "heart")["hearts"]["n"], 5)
        rewards.buy(u, "chat")  # three tutor questions
        self.assertEqual([addons.chat_access(u["id"]) for _ in range(3)], ["bonus"] * 3)
        with self.assertRaises(ApiError):
            addons.chat_access(u["id"])  # the monthly free ones are 0 in tests, and the bought ones are used
        self.assertEqual(rewards.get(u)["gems"], 100 - 10 - 15)
        self.assertEqual(post("/api/play/shop", {"item": "freeze"}, cookie=cookie).json()["freezes"], 1)

    def test_a_round_bonus_cannot_exceed_the_answers_the_server_marked(self):
        cookie, u = self.free()
        for _ in range(6):
            rewards.on_answer(u, True)
        r = rewards.complete_round(u, 10, 10)  # claims ten, six were marked
        self.assertFalse(r["perfect"] and r["bonusXp"] > 25)
        self.assertEqual(rewards.complete_round(u, 8, 8)["bonusXp"], 0)  # nothing left to claim

    def test_the_weekly_league_shows_aliases_never_names_and_respects_opting_out(self):
        self.w = setup()
        a, _ = self.sign_up("a@example.com", name="Asha Kapoor")
        b, _ = self.sign_up("b@example.com", name="Bo Chen")
        ua, ub = self.user_doc("a@example.com"), self.user_doc("b@example.com")
        for _ in range(3):
            rewards.on_answer(ua, True)
        rewards.on_answer(ub, True)
        lg = get("/api/play/league", cookie=a).json()
        self.assertEqual([r["you"] for r in lg["top"]], [True, False])
        self.assertEqual(lg["rank"], 1)
        text = str(lg)
        self.assertNotIn("Asha", text)
        self.assertNotIn("example.com", text)
        put("/api/play/profile", {"board": False}, cookie=b)
        self.assertEqual(len(get("/api/play/league", cookie=a).json()["top"]), 1)
        self.assertEqual(put("/api/play/profile", {"alias": "x"}, cookie=a).status, 400)
        self.assertEqual(put("/api/play/profile", {"alias": "Quiet Owl"}, cookie=a).json()["alias"], "Quiet Owl")


if __name__ == "__main__":
    unittest.main()
