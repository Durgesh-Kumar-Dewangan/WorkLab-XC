import unittest
from unittest import mock

from .helpers import Base, get, post

PAPER = {
    "title": "Trial paper",
    "instructions": "Answer all questions.",
    "questions": [
        {"type": "mcq", "q": "Which structure does merge sort use?", "marks": 1, "options": ["Divide and conquer", "Greedy", "Brute force", "Backtracking"],
         "answer": 0, "why": "Merge sort splits the list, sorts the halves and merges them."},
        {"type": "short", "q": "Explain what Big O notation describes.", "marks": 4,
         "modelAnswer": "How running time or space grows as the input size grows.", "rubric": ["growth with input size", "ignores constants"]},
    ],
}


def course(cookie):
    r = post("/api/courses", {"text": "# Algorithms\n\n## Unit 1\n- Big O notation\n- Merge sort", "title": ""}, cookie=cookie)
    assert r.status == 201, r.text
    return r.json()["id"]


class TestExams(Base):
    def make(self, cookie, cid):
        with mock.patch("wlxc.exams.complete_json", return_value={"value": __import__("wlxc.exams", fromlist=["x"]).validate_paper(PAPER, 2, ["mcq", "short"])}):
            return post("/api/exams", {"courseId": cid, "count": 5, "minutes": 20, "kinds": ["mcq", "short"]}, cookie=cookie)

    def test_paper_hides_answers_until_marked_then_reveals_them(self):
        cookie, _ = self.sign_up()
        self.upgrade("asha@example.com")
        cid = course(cookie)
        r = self.make(cookie, cid)
        self.assertEqual(r.status, 201)
        ex = r.json()["exam"]
        self.assertEqual(ex["totalMarks"], 5)
        self.assertNotIn("answer", ex["questions"][0])
        self.assertNotIn("modelAnswer", ex["questions"][1])
        self.assertEqual(get(f"/api/exams/{ex['id']}", cookie=cookie).json()["exam"]["status"], "open")

        graded = [{"index": 2, "marks": 3.4, "feedback": "Good, but you forgot to mention constants."}]
        with mock.patch("wlxc.exams.complete_json", return_value={"value": graded}):
            res = post(f"/api/exams/{ex['id']}/submit", {"answers": [{"i": 0, "choice": 0}, {"i": 1, "text": "How the time grows with the input."}], "seconds": 300}, cookie=cookie)
        self.assertEqual(res.status, 200)
        done = res.json()["exam"]
        self.assertEqual(done["status"], "marked")
        self.assertEqual(done["result"]["scored"], 4.5)  # 1 for the multiple choice, 3.4 rounded to the nearest half mark
        self.assertEqual(done["questions"][0]["answer"], 0)  # the answers appear once it is marked
        self.assertIn("modelAnswer", done["questions"][1])
        # a marked exam cannot be sat or marked again
        again = post(f"/api/exams/{ex['id']}/submit", {"answers": [], "seconds": 1}, cookie=cookie).json()["exam"]
        self.assertEqual(again["result"]["scored"], 4.5)

    def test_only_the_owner_can_open_an_exam(self):
        a, _ = self.sign_up("a@example.com")
        self.upgrade("a@example.com")
        b, _ = self.sign_up("b@example.com")
        ex = self.make(a, course(a)).json()["exam"]
        self.assertEqual(get(f"/api/exams/{ex['id']}", cookie=b).status, 403)

    def test_free_plan_has_no_exams_and_a_failed_paper_does_not_use_the_daily_limit(self):
        cookie, _ = self.sign_up()
        cid = course(cookie)
        free = self.make(cookie, cid)
        self.assertEqual((free.status, free.json()["error"]), (402, "plan_required"))
        self.upgrade("asha@example.com")
        with mock.patch("wlxc.exams.complete_json", side_effect=RuntimeError("provider down")):
            try:
                post("/api/exams", {"courseId": cid, "count": 5, "minutes": 20, "kinds": ["mcq"]}, cookie=cookie)
            except RuntimeError:
                pass
        for _ in range(12):
            self.assertEqual(self.make(cookie, cid).status, 201)
        over = self.make(cookie, cid)
        self.assertEqual(over.status, 429)
        self.assertEqual(over.json()["error"], "quota_exceeded")

    def test_free_plan_keeps_one_subject_beta_has_more(self):
        cookie, _ = self.sign_up()
        course(cookie)
        text = "# Physics\n\n## Unit 1\n- Velocity\n- Acceleration"
        r = post("/api/courses", {"text": text, "title": ""}, cookie=cookie)
        self.assertEqual((r.status, r.json()["error"]), (402, "plan_required"))
        self.upgrade("asha@example.com")
        self.assertEqual(post("/api/courses", {"text": text, "title": ""}, cookie=cookie).status, 201)


class TestActivityAndUsage(Base):
    def test_activity_counts_answers_and_study_minutes_per_day(self):
        cookie, _ = self.sign_up()
        for score in (1, 1, 0):
            self.assertEqual(post("/api/learn/progress", {"title": "Big O notation", "event": "quiz", "score": score}, cookie=cookie).status, 200)
        self.assertEqual(post("/api/learn/time", {"minutes": 12}, cookie=cookie).status, 200)
        days = get("/api/learn/activity", cookie=cookie).json()["days"]
        self.assertEqual(len(days), 1)
        d = days[0]
        self.assertEqual((d["answered"], d["correct"], d["minutes"]), (3, 2, 12))
        self.assertEqual(d["events"], 3)  # study time is not an extra event

    def test_me_reports_todays_usage_against_the_plan(self):
        cookie, _ = self.sign_up()
        me = get("/api/me", cookie=cookie).json()
        self.assertEqual(me["today"]["sessions"], [0, 9999])
        self.assertFalse(me["limits"]["classroom"])
        self.upgrade("asha@example.com")
        me = get("/api/me", cookie=cookie).json()
        self.assertTrue(me["limits"]["classroom"])
        self.assertEqual(me["today"]["sessions"][1], 9999)

    def test_free_plan_gets_one_classroom_topic_a_month_and_paid_is_unlimited(self):
        cookie, _ = self.sign_up()
        enter = lambda t: post("/api/classroom/enter", {"courseId": "c1", "topicId": t}, cookie=cookie)
        self.assertEqual(enter("t1").status, 200)
        self.assertEqual(enter("t1").status, 200)  # reopening the same topic is free
        blocked = enter("t2")
        self.assertEqual((blocked.status, blocked.json()["error"]), (429, "classroom_limit"))
        self.assertEqual(get("/api/me", cookie=cookie).json()["month"]["classroom"], [1, 1])
        self.upgrade("asha@example.com")
        self.assertEqual(enter("t2").status, 200)


if __name__ == "__main__":
    unittest.main()
