import json
import unittest

from wlxc import jobs
from wlxc.library import cosine, find_reusable, norm_key, word_similarity
from wlxc.store import get_store

from .helpers import Base, PNG, STATS, delete, get, patch, post, put, setup, topic_draft, call


class Lib(Base):
    def setUp(self):
        self.w = setup(AZURE_OPENAI_EMBED_DEPLOYMENT="embed")

    def acct(self, email="asha@example.com", paid=True):
        cookie, _ = self.sign_up(email)
        if paid:
            self.upgrade(email)
        return cookie, self.user_doc(email)["id"]

    def course(self, cookie):
        return post("/api/courses", {"text": STATS}, cookie=cookie).json()

    def run_job(self, cookie, cid, ids, **extra):
        j = post("/api/jobs", {"courseId": cid, "topicIds": ids, **extra}, cookie=cookie).json()["job"]
        jobs.run_job(j["id"], 120_000)
        return get(f"/api/jobs/{j['id']}", cookie=cookie).json()

    def chat_calls(self):
        return len([c for c in self.w.calls if "chat/completions" in c["url"] or "/ai/run/@cf/meta" in c["url"]])

    def items(self, cookie, q=""):
        return get(f"/api/library{q}", cookie=cookie).json()["items"]


class TestHelpers(Base):
    def test_matching_helpers(self):
        self.assertEqual(norm_key("  Photosynthesis: The Light Reactions! "), "photosynthesis the light reactions")
        self.assertGreater(word_similarity("the normal distribution", "normal distribution"), 0.6)
        self.assertEqual(word_similarity("mitosis", "gravity"), 0)
        self.assertAlmostEqual(cosine([1, 0], [1, 0]), 1)
        self.assertEqual(cosine([1, 0], [0, 1]), 0)


class TestReuse(Lib):
    def test_saves_topics_deck_and_pictures(self):
        cookie, _ = self.acct()
        c = self.course(cookie)
        j = self.run_job(cookie, c["id"], c["course"]["order"][:2], images=True)
        self.assertEqual(j["job"]["status"], "done")
        al = self.items(cookie)
        topics = [i for i in al if i["kind"] == "topic"]
        self.assertEqual(len(topics), 2)
        self.assertEqual(len([i for i in al if i["kind"] == "deck"]), 1)
        self.assertTrue(all(i["hasImage"] and i["source"] == "generated" for i in topics))
        deck = next(i for i in al if i["kind"] == "deck")
        f = get(f"/api/library/{deck['id']}/file", cookie=cookie)
        self.assertEqual(f.status, 200)
        self.assertEqual(f.body[:2], b"PK")

    def test_second_run_makes_no_model_calls(self):
        cookie, _ = self.acct()
        c = self.course(cookie)
        ids = c["course"]["order"][:2]
        self.run_job(cookie, c["id"], ids)
        before = self.chat_calls()
        again = self.run_job(cookie, c["id"], ids)
        self.assertEqual(again["job"]["status"], "done")
        self.assertTrue(all(t["reused"] for t in again["job"]["topics"]))
        self.assertEqual(self.chat_calls(), before)
        self.assertEqual(sorted(again["job"]["downloads"]), ["json", "md", "pptx"])
        topics = [i for i in self.items(cookie) if i["kind"] == "topic"]
        self.assertTrue(topics and all(i["uses"] >= 1 for i in topics))  # every reused topic is counted as used

    def test_reuse_off_writes_fresh(self):
        cookie, _ = self.acct()
        c = self.course(cookie)
        ids = c["course"]["order"][:1]
        self.run_job(cookie, c["id"], ids)
        before = self.chat_calls()
        again = self.run_job(cookie, c["id"], ids, reuse=False)
        self.assertFalse(again["job"]["topics"][0]["reused"])
        self.assertGreater(self.chat_calls(), before)

    def test_meaning_match_then_word_fallback(self):
        cookie, uid = self.acct()
        post("/api/library", {"title": "Photosynthesis", "draft": topic_draft("Photosynthesis")}, cookie=cookie)
        hit = find_reusable(uid, "How plants make food")
        self.assertEqual(hit["how"], "meaning")
        self.assertEqual(hit["item"]["title"], "Photosynthesis")
        self.assertIsNone(find_reusable(uid, "Mitosis and cell division"))
        m = post("/api/library/match", {"titles": ["How plants make food", "Newton and gravity"]}, cookie=cookie).json()["matches"]
        self.assertEqual(m["How plants make food"]["title"], "Photosynthesis")
        self.assertIsNone(m["Newton and gravity"])

    def test_word_match_without_embeddings(self):
        self.w = setup()
        cookie, uid = self.acct()
        post("/api/library", {"title": "The normal distribution", "draft": topic_draft("The normal distribution")}, cookie=cookie)
        self.assertEqual(find_reusable(uid, "Normal distribution")["how"], "words")
        self.assertIsNone(find_reusable(uid, "How plants make food"))


class TestEditing(Lib):
    def seeded(self):
        cookie, uid = self.acct()
        c = self.course(cookie)
        ids = c["course"]["order"][:1]
        self.run_job(cookie, c["id"], ids)
        item = next(i for i in self.items(cookie) if i["kind"] == "topic")
        return cookie, c, ids, item

    def test_edit_then_next_run_uses_it_and_no_overwrite(self):
        cookie, c, ids, item = self.seeded()
        draft = {**get(f"/api/library/{item['id']}", cookie=cookie).json()["draft"], "summary": "My own summary, written by hand."}
        r = patch(f"/api/library/{item['id']}", {"tags": ["Exam", "exam", "unit 1"], "draft": draft}, cookie=cookie)
        self.assertEqual(r.status, 200)
        upd = r.json()["item"]
        self.assertEqual(upd["source"], "edited")
        self.assertEqual(upd["version"], item["version"] + 1)
        self.assertEqual(upd["tags"], ["exam", "unit 1"])
        again = self.run_job(cookie, c["id"], ids)
        md = get(f"/api/jobs/{again['job']['id']}/download?format=md", cookie=cookie).text
        self.assertIn("My own summary, written by hand.", md)
        self.run_job(cookie, c["id"], ids, reuse=False)
        kept = get(f"/api/library/{item['id']}", cookie=cookie).json()
        self.assertEqual(kept["draft"]["summary"], "My own summary, written by hand.")

    def test_invalid_lesson_rejected(self):
        cookie, c, ids, item = self.seeded()
        self.assertEqual(patch(f"/api/library/{item['id']}", {"draft": {"slides": []}}, cookie=cookie).status, 422)
        self.assertEqual(post("/api/library", {"title": "x", "draft": "nope"}, cookie=cookie).status, 422)

    def test_replace_picture(self):
        cookie, c, ids, item = self.seeded()
        up = lambda data, name: call("PUT", f"/api/library/{item['id']}/file", cookie=cookie, files={"file": (name, data, "image/png")})  # noqa: E731
        self.assertEqual(up(b"hello", "a.png").status, 422)
        ok = up(PNG, "mine.png")
        self.assertEqual(ok.status, 200)
        self.assertTrue(ok.json()["item"]["hasImage"])
        img = get(f"/api/library/{item['id']}/file?part=image", cookie=cookie)
        self.assertEqual(img.headers["content-type"], "image/png")

    def test_upload_and_replace_own_pptx(self):
        cookie, c, ids, item = self.seeded()
        j = self.run_job(cookie, c["id"], ids)
        pptx = get(f"/api/jobs/{j['job']['id']}/download?format=pptx", cookie=cookie).body
        send = lambda data, name: call("POST", "/api/library", cookie=cookie, files={"file": (name, data, "application/octet-stream")}, form={"title": "Lecture 1 (mine)", "tags": "lecture, week1"})  # noqa: E731
        self.assertEqual(send(b"not a deck", "x.pptx").status, 422)
        ok = send(pptx, "lecture1.pptx")
        self.assertEqual(ok.status, 201)
        it = ok.json()["item"]
        self.assertEqual((it["source"], it["tags"], it["fileName"]), ("uploaded", ["lecture", "week1"], "lecture1.pptx"))
        rep = call("PUT", f"/api/library/{it['id']}/file", cookie=cookie, files={"file": ("v2.pptx", pptx, "application/octet-stream")})
        self.assertEqual(rep.json()["item"]["version"], 2)

    def test_search_and_filter(self):
        cookie, _ = self.acct()
        post("/api/library", {"title": "Photosynthesis", "tags": ["biology"], "draft": topic_draft("Photosynthesis")}, cookie=cookie)
        post("/api/library", {"title": "Newton laws", "draft": topic_draft("Newton laws")}, cookie=cookie)
        self.assertEqual(len(self.items(cookie, "?q=biology")), 1)
        self.assertEqual(self.items(cookie, "?q=how%20plants%20make%20food")[0]["title"], "Photosynthesis")
        self.assertEqual(len(self.items(cookie, "?kind=deck")), 0)
        self.assertEqual(len(self.items(cookie)), 2)


class TestPrivacy(Lib):
    def test_library_is_private(self):
        a, _ = self.acct("a@example.com")
        b, buid = self.acct("b@example.com")
        r = post("/api/library", {"title": "Secret topic", "draft": topic_draft("Secret topic")}, cookie=a).json()
        iid = r["item"]["id"]
        self.assertEqual(get(f"/api/library/{iid}", cookie=b).status, 404)
        self.assertEqual(delete(f"/api/library/{iid}", cookie=b).status, 404)
        self.assertEqual(len(self.items(b)), 0)
        self.assertIsNone(find_reusable(buid, "Secret topic"))

    def test_plan_limit_and_delete_frees_space(self):
        cookie, _ = self.acct("free@example.com", paid=False)
        last = 0
        for i in range(26):
            if last == 402:
                break
            last = post("/api/library", {"title": f"Topic number {i} alpha{i}", "draft": topic_draft(f"Topic {i}")}, cookie=cookie).status
        self.assertEqual(last, 402)
        first = self.items(cookie)[0]
        self.assertEqual(delete(f"/api/library/{first['id']}", cookie=cookie).status, 200)
        self.assertEqual(post("/api/library", {"title": "One more", "draft": topic_draft("One more")}, cookie=cookie).status, 201)

    def test_export_and_erase(self):
        cookie, _ = self.acct()
        c = self.course(cookie)
        self.run_job(cookie, c["id"], c["course"]["order"][:1], images=True)
        exp = json.loads(get("/api/me/export", cookie=cookie).text)
        self.assertGreater(len(exp["library"]), 0)
        st = get_store()
        self.assertGreater(len(st.find("library")), 0)
        self.assertEqual(delete("/api/me", {"password": "S3cure-pass!"}, cookie=cookie).status, 200)
        self.assertEqual(len(st.find("library")), 0)


if __name__ == "__main__":
    unittest.main()
