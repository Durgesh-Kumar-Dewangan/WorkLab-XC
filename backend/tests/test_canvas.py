import unittest

from wlxc.store import get_store

from .helpers import Base, delete, get, post, put, setup


class TestCanvas(Base):
    def test_ask_branch_note_picture_and_privacy(self):
        w = setup(AZURE_OPENAI_IMAGE_DEPLOYMENT="gpt-image-1", IMAGE_ORDER="azure")
        a, _ = self.sign_up("a@example.com")
        self.upgrade("a@example.com")
        cid = post("/api/canvases", {"title": "Habits"}, cookie=a).json()["canvas"]["id"]
        r = post(f"/api/canvases/{cid}/ask", {"question": "Why do habits compound over time?", "visual": True}, cookie=a)
        self.assertEqual(r.status, 200)
        node = r.json()["node"]
        self.assertEqual(node["a"]["points"][0]["label"], "Feedback")
        self.assertEqual(len(node["a"]["diagram"]["tiers"]), 2)
        self.assertTrue(node["image"].startswith("cv-"))
        pic = get(f"/api/canvas-image/{node['image']}", cookie=a)
        self.assertEqual(pic.status, 200)
        # a branch carries its parent and the canvas keeps every node
        b = post(f"/api/canvases/{cid}/ask", {"question": "When does compounding stop?", "parent": node["id"]}, cookie=a).json()["node"]
        self.assertEqual(b["parent"], node["id"])
        self.assertEqual(len(get(f"/api/canvases/{cid}", cookie=a).json()["canvas"]["nodes"]), 2)
        # notes and positions are saved, and a picture that is not the owner's is dropped
        board = get(f"/api/canvases/{cid}", cookie=a).json()["canvas"]
        nodes = board["nodes"] + [{"id": "n1", "kind": "note", "x": 5, "y": 6, "text": "Look for fast feedback", "color": "orange"},
                                  {"id": "bad", "kind": "question", "q": "x", "x": 0, "y": 0, "image": "cv-someone-else-1"}]
        saved = put(f"/api/canvases/{cid}", {"nodes": nodes}, cookie=a).json()["canvas"]
        self.assertEqual(len(saved["nodes"]), 4)
        self.assertIsNone(next(n for n in saved["nodes"] if n["id"] == "bad")["image"])
        # another account can read none of it
        other, _ = self.sign_up("b@example.com")
        self.assertEqual(get(f"/api/canvases/{cid}", cookie=other).status, 404)
        self.assertEqual(get(f"/api/canvas-image/{node['image']}", cookie=other).status, 404)
        self.assertEqual(delete(f"/api/canvases/{cid}", cookie=a).status, 200)

    def test_free_plan_gets_the_answer_without_a_picture_and_has_a_monthly_cap(self):
        setup()
        a, _ = self.sign_up("free@example.com")
        cid = post("/api/canvases", {}, cookie=a).json()["canvas"]["id"]
        r = post(f"/api/canvases/{cid}/ask", {"question": "Why do habits compound?", "visual": True}, cookie=a).json()
        self.assertEqual(r["imageSkipped"], "plan")
        self.assertIsNone(r["node"]["image"])
        for _ in range(5):
            post(f"/api/canvases/{cid}/ask", {"question": "Another question here"}, cookie=a)
        self.assertEqual(post(f"/api/canvases/{cid}/ask", {"question": "One more question"}, cookie=a).status, 402)


if __name__ == "__main__":
    unittest.main()


class TestCanvasFromStoredLessons(Base):
    def test_a_stored_lesson_answers_the_canvas_question_for_free_with_its_picture(self):
        from wlxc import pool
        from wlxc.lesson import validate_draft
        from .helpers import PNG, topic_draft
        w = setup()
        a, _ = self.sign_up("a@example.com")
        user = self.user_doc("a@example.com")
        draft = validate_draft({**topic_draft("Newton's second law"), "notes": "## Notes\n\n" + ("Force, mass and acceleration are tied together by one rule. " * 20)}, "deep")
        pool.put(user, "Newton's second law", "deep", draft, {"bytes": PNG, "mime": "image/png"})
        cid = post("/api/canvases", {"title": "Physics"}, cookie=a).json()["canvas"]["id"]
        before = len([c for c in w.calls if "chat/completions" in c["url"]])
        r = post(f"/api/canvases/{cid}/ask", {"question": "Newton's second law", "visual": True}, cookie=a)
        self.assertEqual(r.status, 200, r.text)
        j = r.json()
        self.assertTrue(j["fromStored"])
        self.assertEqual(len([c for c in w.calls if "chat/completions" in c["url"]]), before)  # no model was asked
        self.assertTrue(j["node"]["image"].startswith("cv-"))  # the stored picture was copied in
        self.assertGreaterEqual(len(j["node"]["a"]["points"]), 2)
        self.assertTrue(j["node"]["a"]["diagram"])
        self.assertEqual(get("/api/me", cookie=a).json()["month"].get("canvas", [0])[0], 0)  # and it used none of the month's questions
