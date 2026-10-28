from wlxc import billing, referral, rewards
from wlxc.profile import update_profile
from wlxc.store import get_store

from .helpers import Base, get, setup


class TestReferral(Base):
    def two(self):
        self.w = setup()
        ca, _ = self.sign_up("a@example.com")
        cb, _ = self.sign_up("b@example.com")
        return self.user_doc("a@example.com"), self.user_doc("b@example.com"), ca, cb

    def test_friend_gets_ten_percent_and_sharer_earns_a_voucher_only_after_payment(self):
        a, b, ca, cb = self.two()
        self.assertTrue(referral.attach(b["id"], referral.code_of(a["id"])))
        b = self.user_doc("b@example.com")
        self.assertEqual(referral.price_paise(b, 100), (9000, 10, "friend"))
        self.assertEqual(referral.pending_discount(a), (0, ""))  # nothing before the friend pays
        referral.on_paid({"uid": b["id"], "discountKind": "friend"})
        referral.on_paid({"uid": b["id"], "discountKind": ""})
        self.assertEqual(referral.pending_discount(self.user_doc("b@example.com")), (0, ""))  # used once
        self.assertEqual(referral.pending_discount(a), (10, "voucher"))
        referral.on_paid({"uid": a["id"], "discountKind": "voucher"})
        self.assertEqual(referral.pending_discount(a), (0, ""))

    def test_bad_or_own_code_is_ignored(self):
        a, b, *_ = self.two()
        self.assertFalse(referral.attach(b["id"], "NOPE1234"))
        self.assertFalse(referral.attach(a["id"], referral.code_of(a["id"])))

    def test_summary_endpoint(self):
        a, b, ca, cb = self.two()
        referral.attach(b["id"], referral.code_of(a["id"]))
        r = get("/api/referral", cookie=ca).json()
        self.assertEqual((r["percent"], r["joined"]), (10, 1))
        self.assertIn("/register?ref=", r["link"])

    def test_leaderboard_filters_by_learner_type_and_syllabus(self):
        a, b, ca, cb = self.two()
        update_profile(a, {"education": "school", "category": "cbse"})
        update_profile(b, {"education": "college", "category": "university"})
        rewards.on_answer(a, True)
        rewards.on_answer(b, True)
        both = get("/api/play/league", cookie=ca).json()
        self.assertEqual(both["total"], 2)
        school = get("/api/play/league?education=school", cookie=ca).json()
        self.assertEqual([r["you"] for r in school["top"]], [True])
        uni = get("/api/play/league?category=university&scope=all", cookie=ca).json()
        self.assertEqual((uni["total"], uni["rank"]), (1, None))
