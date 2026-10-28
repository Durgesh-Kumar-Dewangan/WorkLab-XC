import datetime as dt
import unittest
from unittest import mock

from wlxc import study, usage
from wlxc.store import get_store

from .helpers import Base, delete, get, post, put, setup

TEXT = "# Algorithms\n\n## Unit 1\n- Big O notation\n- Merge sort\n- Binary search\n- Hash tables\n- Graph traversal"


class TestStudy(Base):
    def start(self, email="asha@example.com"):
        self.w = setup()
        cookie, _ = self.sign_up(email)
        self.upgrade(email)
        r = post("/api/courses", {"text": TEXT, "title": ""}, cookie=cookie)
        cid = r.json()["id"]
        doc = get_store().get("courses", cid)["course"]
        return cookie, cid, self.user_doc(email), doc

    def test_cards_follow_a_spaced_schedule(self):
        cookie, cid, u, doc = self.start()
        c = post("/api/study/cards", {"front": "What does Big O describe?", "back": "Growth of cost with input size", "courseId": cid}, cookie=cookie).json()["card"]
        self.assertEqual(get("/api/study/cards", cookie=cookie).json()["due"], 1)
        good = post(f"/api/study/cards/{c['id']}/review", {"grade": "good"}, cookie=cookie).json()["card"]
        self.assertEqual(good["interval"], 1)
        again = post(f"/api/study/cards/{c['id']}/review", {"grade": "again"}, cookie=cookie).json()["card"]
        self.assertEqual(again["interval"], 0)
        self.assertEqual(again["lapses"], 1)
        self.assertEqual(get("/api/study/cards", cookie=cookie).json()["due"], 0)
        self.assertEqual(get("/api/study/cards?all=1", cookie=cookie).json()["total"], 1)
        other, _ = self.sign_up("b@example.com")
        self.assertEqual(post(f"/api/study/cards/{c['id']}/review", {"grade": "good"}, cookie=other).status, 404)
        self.assertEqual(delete(f"/api/study/cards/{c['id']}", cookie=cookie).status, 200)

    def test_every_wrong_answer_lands_on_the_error_map_and_makes_a_card(self):
        cookie, cid, u, doc = self.start()
        t = doc["topics"][doc["order"][1]]["title"]
        study.log_miss(u["id"], t, "drill", "Which sort splits the list in half?", "Merge sort", "It divides then merges.", cid)
        study.log_miss(u["id"], t, "exam", "State the time of merge sort.", "O(n log n)", "", cid)
        rows = {r["title"]: r for r in get(f"/api/study/map?courseId={cid}", cookie=cookie).json()["topics"]}
        self.assertEqual(rows[t]["misses"], 2)
        self.assertEqual(rows[t]["sources"], {"drill": 1, "exam": 1})
        first = doc["topics"][doc["order"][0]]["title"]
        self.assertGreater(rows[t]["weak"], 0)
        self.assertEqual(rows[first]["misses"], 0)
        self.assertEqual(get("/api/study/cards", cookie=cookie).json()["due"], 2)
        # asking the same question again does not make a second card
        study.log_miss(u["id"], t, "drill", "Which sort splits the list in half?", "Merge sort", "", cid)
        self.assertEqual(get("/api/study/cards?all=1", cookie=cookie).json()["total"], 2)

    def test_exam_countdown_planner_builds_days_and_moves_missed_work_forward(self):
        cookie, cid, u, doc = self.start()
        soon = (dt.date.fromisoformat(usage.day_key()) + dt.timedelta(days=9)).isoformat()
        self.assertEqual(put("/api/study/plan", {"courseId": cid, "examDate": "2020-01-01"}, cookie=cookie).status, 400)
        r = put("/api/study/plan", {"courseId": cid, "examDate": soon, "minutes": 80}, cookie=cookie).json()["plan"]
        self.assertEqual(r["daysLeft"], 9)
        self.assertEqual(len(r["days"]), 9)
        planned = [it["topicId"] for d in r["days"] for it in d["items"] if it["kind"] == "learn"]
        self.assertEqual(sorted(planned), sorted(doc["order"]))  # every unseen topic is scheduled once
        self.assertEqual(r["days"][-1]["items"][0]["kind"], "review") if r["days"][-1]["items"] else None
        self.assertEqual(r["missed"], 0)
        # pretend yesterday had a plan nobody followed: the work is counted as missed and is still on today's plan
        plan = get_store().get("studyplans", f"{u['id']}:{cid}")
        yesterday = (dt.date.fromisoformat(usage.day_key()) - dt.timedelta(days=1)).isoformat()
        get_store().put("studyplans", plan["id"], {**plan, "sched": {yesterday: [doc["order"][0]]}})
        again = get(f"/api/study/plan?courseId={cid}", cookie=cookie).json()["plan"]
        self.assertEqual(again["missed"], 1)
        self.assertIn(doc["order"][0], [it["topicId"] for d in again["days"] for it in d["items"]])

    def test_past_papers_rank_topics_by_how_often_and_how_heavily_they_are_asked(self):
        cookie, cid, u, doc = self.start()
        a, b = doc["order"][0], doc["order"][1]
        qs = [{"q": "Explain Big O.", "topicId": a, "marks": 10, "verb": "explain"}, {"q": "Define Big O.", "topicId": a, "marks": 5, "verb": "define"},
              {"q": "Sort with merge sort.", "topicId": b, "marks": 5, "verb": "calculate"}]
        with mock.patch("wlxc.study.llm.complete_json", return_value={"value": qs, "usage": {}}):
            r = post("/api/study/papers", {"courseId": cid, "name": "2024", "text": "Question 1. Explain Big O notation. " * 10}, cookie=cookie)
        self.assertEqual(r.status, 200)
        s = get(f"/api/study/papers?courseId={cid}", cookie=cookie).json()
        self.assertEqual(s["topics"][0]["id"], a)
        self.assertEqual(s["topics"][0]["likelihood"], 1.0)
        self.assertEqual(s["verbs"][0], {"word": "explain", "n": 1}) if s["verbs"][0]["word"] == "explain" else None
        rows = {x["id"]: x for x in get(f"/api/study/map?courseId={cid}", cookie=cookie).json()["topics"]}
        self.assertGreater(rows[a]["priority"], rows[doc["order"][3]]["priority"])
        self.assertEqual(delete(f"/api/study/papers/{s['papers'][0]['id']}", cookie=cookie).status, 200)

    def test_teach_back_scores_the_explanation_and_logs_the_gaps(self):
        cookie, cid, u, doc = self.start()
        tid = doc["order"][1]
        title = doc["topics"][tid]["title"]
        out = {"reply": "So why does it merge?", "covered": ["splits in half"], "missing": ["the merge step"], "wrong": [], "score": 55, "done": True}
        with mock.patch("wlxc.study.llm.complete_json", return_value={"value": out, "usage": {}}):
            r = post("/api/study/teachback", {"courseId": cid, "topicId": tid, "history": [{"role": "you", "text": "It splits the list and sorts each half."}], "finish": True}, cookie=cookie).json()
        self.assertTrue(r["done"])
        self.assertEqual(r["score"], 55)
        rows = {x["id"]: x for x in get(f"/api/study/map?courseId={cid}", cookie=cookie).json()["topics"]}
        self.assertEqual(rows[tid]["sources"], {"teachback": 1})
        self.assertTrue(rows[tid]["seen"])
        # the opening turn needs no AI, and an empty explanation is refused
        first = post("/api/study/teachback", {"courseId": cid, "topicId": tid, "history": []}, cookie=cookie).json()
        self.assertIn(title, first["reply"])
        self.assertEqual(post("/api/study/teachback", {"courseId": cid, "topicId": tid, "history": [{"role": "student", "text": "hi"}]}, cookie=cookie).status, 400)

    def test_viva_grades_an_answer_then_asks_again(self):
        cookie, cid, u, doc = self.start()
        tid = doc["order"][2]
        out = {"feedback": {"score": 3, "comment": "Missing the sorted precondition.", "model": "Binary search needs a sorted list."}, "next": "What is its time complexity?"}
        with mock.patch("wlxc.study.llm.complete_json", return_value={"value": out, "usage": {}}):
            r = post("/api/study/viva", {"courseId": cid, "topicId": tid, "question": "When can you use binary search?", "answer": "On any list."}, cookie=cookie).json()
        self.assertEqual(r["feedback"]["score"], 3)
        self.assertEqual(r["next"], "What is its time complexity?")
        self.assertEqual(get("/api/study/cards", cookie=cookie).json()["due"], 1)  # the missed question became a card

    def test_photo_becomes_cards_or_connected_canvas_cards(self):
        cookie, cid, u, doc = self.start()
        lesson = {"title": "Sorting", "summary": "Sorting puts items in order. Merge sort divides then merges.", "sections": [
            {"heading": "Merge sort", "text": "It splits the list. It sorts each half. It merges the halves."}, {"heading": "Quick sort", "text": "It picks a pivot. It partitions around it."}],
            "questions": [{"q": f"Question number {i}?", "options": ["a", "b", "c", "d"], "answer": 1, "why": "Because."} for i in range(5)]}
        with mock.patch("wlxc.study.llm.complete_json", return_value={"value": lesson, "usage": {}}):
            r = study.scan(u, "page.jpg", b"\xff\xd8\xff" + b"x" * 50, "image/jpeg", "canvas", None, cid)
        self.assertEqual(r["cards"], 5)
        board = get("/api/canvases/" + r["canvasId"], cookie=cookie).json()["canvas"]
        self.assertEqual(len(board["nodes"]), 3)
        self.assertEqual(sum(1 for n in board["nodes"] if n["parent"]), 2)
        with self.assertRaises(Exception):
            study.scan(u, "x.gif", b"GIF89a", "image/gif", "lesson", None, cid)

    def test_offline_pack_has_the_plan_topics_and_due_cards(self):
        cookie, cid, u, doc = self.start()
        soon = (dt.date.fromisoformat(usage.day_key()) + dt.timedelta(days=6)).isoformat()
        put("/api/study/plan", {"courseId": cid, "examDate": soon}, cookie=cookie)
        study.log_miss(u["id"], doc["topics"][doc["order"][0]]["title"], "drill", "What is O(1)?", "Constant time", "", cid)
        pack = get(f"/api/study/pack?courseId={cid}&days=7", cookie=cookie).json()
        self.assertGreaterEqual(len(pack["topics"]), 3)
        self.assertEqual(len(pack["cards"]), 1)
        self.assertEqual(pack["courseTitle"], doc["title"])

    def test_free_plan_has_a_monthly_cap_on_coach_turns(self):
        self.w = setup()
        cookie, _ = self.sign_up("free@example.com")
        cid = post("/api/courses", {"text": TEXT, "title": ""}, cookie=cookie).json()["id"]
        out = {"feedback": None, "next": "Q?"}
        with mock.patch("wlxc.study.llm.complete_json", return_value={"value": out, "usage": {}}):
            for _ in range(15):
                self.assertEqual(post("/api/study/viva", {"courseId": cid}, cookie=cookie).status, 200)
            self.assertEqual(post("/api/study/viva", {"courseId": cid}, cookie=cookie).status, 402)


if __name__ == "__main__":
    unittest.main()
