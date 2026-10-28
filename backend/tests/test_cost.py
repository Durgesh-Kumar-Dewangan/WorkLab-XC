import unittest
from unittest import mock

from wlxc import lesson, image

from .helpers import Base, setup, topic_draft


class TestCost(Base):
    def test_a_good_first_draft_ends_the_search_and_a_weak_one_asks_again(self):
        setup()
        good = lesson.validate_draft(topic_draft("Newton laws of motion", False))
        calls = []

        def fake(system, prompt, parse, order=None, json_mode=False, max_tokens=None, temperature=None, images=None):
            calls.append(max_tokens)
            return {"value": good, "text": "", "usage": {"provider": "p", "model": "m", "tokensIn": 1, "tokensOut": 1}}

        with mock.patch("wlxc.lesson.complete", fake), mock.patch("wlxc.lesson.score_draft", return_value=0.95):
            lesson.generate_best("Physics", "Mechanics", "Newton laws of motion", 3)
        self.assertEqual(len(calls), 1)
        calls.clear()
        with mock.patch("wlxc.lesson.complete", fake), mock.patch("wlxc.lesson.score_draft", return_value=0.4):
            lesson.generate_best("Physics", "Mechanics", "Newton laws of motion", 3)
        self.assertEqual(len(calls), 3)

    def test_slide_pictures_try_the_free_models_first_and_at_low_quality(self):
        self.assertEqual(image.CHEAP_FIRST[:3], ["cloudflare", "huggingface", "pollinations"])
        self.assertLess(image.CHEAP_FIRST.index("cloudflare"), image.CHEAP_FIRST.index("azure"))
        import inspect

        self.assertEqual(inspect.signature(image.generate_image).parameters["quality"].default, "low")

    def test_the_lesson_prompt_stays_short(self):
        self.assertLess(len(lesson.SYSTEM), 1500)


if __name__ == "__main__":
    unittest.main()
