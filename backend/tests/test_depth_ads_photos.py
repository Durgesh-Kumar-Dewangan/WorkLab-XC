import json
import unittest
from unittest import mock

from wlxc import addons, lesson
from wlxc.net import Resp
from wlxc.store import get_store

from .helpers import PNG, Base, get, post, put, setup, topic_draft


class TestDepth(Base):
    def test_each_depth_has_its_own_limits_and_prompt(self):
        d = topic_draft("Newton laws of motion")
        three = {**d, "slides": d["slides"][:3]}
        lesson.validate_draft(three, "quick")  # a quick overview may have 3 slides
        with self.assertRaises(ValueError):
            lesson.validate_draft(three, "standard")
        self.assertIn("quick overview", lesson.build_prompt("C", "U", "T", depth="quick"))
        self.assertIn("in depth", lesson.build_prompt("C", "U", "T", depth="deep"))
        self.assertNotIn("Depth:", lesson.build_prompt("C", "U", "T"))
        self.assertEqual(lesson.validate_draft(d, "quick")["depth"], "quick")

    def test_a_slide_can_name_a_real_world_photo_and_it_is_cleaned(self):
        d = topic_draft("Bridges")
        d["slides"][0]["example"] = "suspension bridge <script>alert(1)</script>"
        out = lesson.validate_draft(d)
        ex = out["slides"][0]["example"]
        self.assertNotIn("<", ex)
        self.assertIn("suspension bridge", ex)

    def test_a_lesson_saved_at_one_depth_is_rewritten_for_another(self):
        w = setup()
        cookie, _ = self.sign_up("a@example.com")
        self.upgrade("a@example.com")
        put("/api/profile", {"category": "ncert"}, cookie=cookie)
        sid = post("/api/sessions", {}, cookie=cookie).json()["session"]["id"]
        a = post("/api/learn/prepare", {"sessionId": sid, "title": "Newton laws of motion"}, cookie=cookie).json()
        self.assertEqual(a["state"], "generated")
        again = post("/api/learn/prepare", {"sessionId": sid, "title": "Newton laws of motion"}, cookie=cookie).json()
        self.assertEqual(again["state"], "reused")
        quick = post("/api/learn/prepare", {"sessionId": sid, "title": "Newton laws of motion", "depth": "quick"}, cookie=cookie).json()
        self.assertEqual(quick["state"], "generated")
        self.assertEqual(quick["draft"]["depth"], "quick")


class TestAds(Base):
    def test_the_ad_free_add_on_turns_ads_off_for_a_free_account(self):
        setup()
        cookie, _ = self.sign_up("free@example.com")
        self.assertTrue(get("/api/me", cookie=cookie).json()["limits"]["ads"])
        self.assertIn("noads", [c["sku"] for c in get("/api/addons", cookie=cookie).json()["catalogue"]])
        addons.grant(self.user_doc("free@example.com")["id"], "noads")
        self.assertFalse(get("/api/me", cookie=cookie).json()["limits"]["ads"])
        self.assertTrue(addons.has(self.user_doc("free@example.com")["id"], "noads"))


WIKI = {"query": {"pages": {
    "1": {"index": 1, "title": "File:Golden Gate Bridge.jpg", "imageinfo": [{"mime": "image/jpeg", "width": 4000, "thumburl": "https://upload.wikimedia.org/a.jpg", "descriptionurl": "https://commons.wikimedia.org/wiki/File:A", "extmetadata": {"LicenseShortName": {"value": "CC BY-SA 4.0"}, "Artist": {"value": "<a href='x'>Jane Doe</a>"}}}]},
    "2": {"index": 2, "title": "File:Company logo.png", "imageinfo": [{"mime": "image/png", "width": 4000, "thumburl": "https://upload.wikimedia.org/b.png", "extmetadata": {"LicenseShortName": {"value": "CC BY 4.0"}}}]},
    "3": {"index": 3, "title": "File:Restricted photo.jpg", "imageinfo": [{"mime": "image/jpeg", "width": 4000, "thumburl": "https://upload.wikimedia.org/c.jpg", "extmetadata": {"LicenseShortName": {"value": "All rights reserved"}}}]},
}}}


class TestPhotos(Base):
    def test_a_free_licensed_photo_is_found_credited_and_kept(self):
        setup()
        cookie, _ = self.sign_up("a@example.com")

        def fake(url, method="GET", headers=None, body=None, json_body=None, timeout=30):
            if "wikimedia.org/w/api.php" in url:
                return Resp(200, json.dumps(WIKI).encode(), {"content-type": "application/json"})
            return Resp(200, PNG, {"content-type": "image/png"})

        with mock.patch("wlxc.example.http", fake):
            r = get("/api/example?q=suspension%20bridge", cookie=cookie)
            self.assertEqual(r.status, 200)
            j = r.json()
            self.assertEqual(j["credit"], "Jane Doe, CC BY-SA 4.0")  # the logo and the all-rights-reserved file are left out
            self.assertEqual(j["count"], 1)
            img = get(f"/api/example-image/{j['id']}", cookie=cookie)
            self.assertEqual(img.status, 200)
        self.assertEqual(get("/api/example?q=ab", cookie=cookie).status, 400)
        self.assertEqual(get("/api/example-image/not-a-photo", cookie=cookie).status, 404)


if __name__ == "__main__":
    unittest.main()


class TestDeepFromScratch(Base):
    def test_a_deep_draft_must_build_from_zero_and_a_standard_one_may_not(self):
        from wlxc.lesson import DEPTHS, score_draft, validate_draft
        from .helpers import topic_draft
        raw = {**topic_draft("Newton's second law"), "notes": "## Newton's second law\n\n" + ("Force, mass and acceleration are tied together by one rule. " * 20)}
        deep = validate_draft(raw, "deep")
        self.assertEqual((len(deep["scratch"]), len(deep["glossary"]), deep["diagrams"][0]["kind"]), (4, 4, "flow"))
        bare = {k: v for k, v in raw.items() if k not in ("scratch", "glossary", "mistakes", "diagrams")}
        with self.assertRaises(ValueError):
            validate_draft(bare, "deep")  # a deep lesson with nothing built from scratch is sent back for another try
        self.assertNotIn("scratch", validate_draft(bare, "standard"))
        self.assertEqual(DEPTHS["deep"]["questions"], 8)
        rich, plain = score_draft(deep, "Newton's second law", "deep"), score_draft({**deep, "scratch": [], "glossary": [], "diagrams": [], "mistakes": []}, "Newton's second law", "deep")
        self.assertGreater(rich, plain)

    def test_diagrams_are_checked_and_only_the_good_ones_survive(self):
        from wlxc.lesson import _diagram
        self.assertIsNone(_diagram({"kind": "flow", "title": "x", "steps": [{"label": "one"}]}))  # a flow needs two steps
        self.assertIsNone(_diagram({"kind": "spiral", "title": "x"}))
        self.assertEqual(_diagram({"kind": "plot", "title": "F against a", "xLabel": "a", "yLabel": "F", "points": [[0, 0], [1, 2], [2, 4]]})["kind"], "plot")
        self.assertIsNone(_diagram({"kind": "plot", "title": "bad", "points": [[0, "x"], [1, 2], [2, 3]]}))
        self.assertEqual(len(_diagram({"kind": "compare", "title": "A vs B", "columns": [{"title": "A", "points": ["p"]}, {"title": "B", "points": ["q"]}]})["columns"]), 2)

    def test_practice_is_written_from_what_was_taught(self):
        from wlxc.learn import topic_block
        from wlxc.lesson import validate_draft
        from .helpers import topic_draft
        draft = {**topic_draft("Newton's second law"), "notes": "## Newton's second law\n\n" + ("Force, mass and acceleration are tied together by one rule. " * 20)}
        block = topic_block("Newton's second law", validate_draft(draft, "deep"))
        self.assertIn("Taught from scratch", block)
        self.assertIn("Terms:", block)
        self.assertIn("Notes (excerpt)", block)

    def test_the_subject_tag_is_kept_only_when_it_is_one_the_screen_knows(self):
        from wlxc.lesson import validate_draft
        from .helpers import topic_draft
        raw = topic_draft("Newton's second law")
        self.assertEqual(validate_draft({**raw, "subject": "Physics"})["subject"], "physics")
        self.assertNotIn("subject", validate_draft({**raw, "subject": "astrology"}))
        self.assertNotIn("subject", validate_draft(raw))
