from wlxc import learn, profile

from .helpers import Base, setup


class TestCurricula(Base):
    def start(self):
        self.w = setup()
        self.sign_up("lee@example.com", name="Lee")
        return self.user_doc("lee@example.com")

    def test_a_learner_anywhere_can_save_their_countrys_curriculum(self):
        u = self.start()
        for country, curriculum in (("IN", "ncert"), ("us", "us_common_core"), ("GB", "gb_gcse"), ("NG", "ng_waec"), ("BR", "br_enem"), ("JP", "jp_common_test")):
            p = profile.update_profile(u, {"country": country, "category": curriculum})
            self.assertEqual((p["country"], p["category"]), (country.upper(), curriculum))

    def test_codes_that_are_not_codes_are_dropped(self):
        u = self.start()
        p = profile.update_profile(u, {"country": "Narnia", "category": "<script>alert(1)</script>"})
        self.assertEqual((p["country"], p["category"]), ("", ""))

    def test_lessons_for_the_same_curriculum_are_shared_and_personal_study_uses_the_general_pool(self):
        u = self.start()
        profile.update_profile(u, {"category": "ib_dp"})
        self.assertEqual(learn.pool_cat(self.user_doc("lee@example.com")), "ib_dp")
        profile.update_profile(u, {"category": "self_study"})
        self.assertEqual(learn.pool_cat(self.user_doc("lee@example.com")), "general")
