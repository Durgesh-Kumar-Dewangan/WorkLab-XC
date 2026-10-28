import time
import unittest

from wlxc import addons
from wlxc.learn import answer_matches
from wlxc.store import get_store

from .helpers import Base, STATS, cookie_of, get, post, put, setup

FAIL_HOSTS = ["az.test", "api.groq.com", "generativelanguage.googleapis.com", "api.mistral.ai", "openrouter.ai", "api.openai.com", "api.cloudflare.com"]


class Learn(Base):
    def ai_calls(self):
        return len([c for c in self.w.calls if "az.test" in c["url"] and "chat" in c["url"]])

    def user(self, email="asha@example.com", category="ncert"):
        cookie, _ = self.sign_up(email)
        self.upgrade(email)
        put("/api/profile", {"category": category}, cookie=cookie)
        sid = post("/api/sessions", {}, cookie=cookie).json()["session"]["id"]
        return {"cookie": cookie, "uid": self.user_doc(email)["id"], "sid": sid}

    def break_ai(self):
        self.w.fail |= set(FAIL_HOSTS)


class TestLesson(Learn):
    def test_write_once_reuse_then_share(self):
        a = self.user()
        first = post("/api/learn/prepare", {"sessionId": a["sid"], "title": "Newton laws of motion"}, cookie=a["cookie"]).json()
        self.assertEqual(first["state"], "generated")
        self.assertGreater(len(first["draft"]["slides"]), 3)
        n = self.ai_calls()
        again = post("/api/learn/prepare", {"sessionId": a["sid"], "title": "Laws of Motion (Newton)"}, cookie=a["cookie"]).json()
        self.assertEqual(again["state"], "reused")
        self.assertEqual(self.ai_calls(), n)
        b = self.user("b@example.com", "ncert")
        shared = post("/api/learn/prepare", {"sessionId": b["sid"], "title": "Newton laws of motion"}, cookie=b["cookie"]).json()
        self.assertEqual(shared["state"], "shared")
        self.assertEqual(self.ai_calls(), n)
        o = self.user("c@example.com", "university")
        self.assertEqual(post("/api/learn/prepare", {"sessionId": o["sid"], "title": "Newton laws of motion"}, cookie=o["cookie"]).json()["state"], "generated")

    def test_other_session_refused_and_allowance_returned_on_ai_failure(self):
        a = self.user()
        b = self.user("b@example.com")
        self.assertEqual(post("/api/learn/prepare", {"sessionId": a["sid"], "title": "Photosynthesis"}, cookie=b["cookie"]).status, 403)
        self.break_ai()
        r = post("/api/learn/prepare", {"sessionId": b["sid"], "title": "Photosynthesis"}, cookie=b["cookie"])
        self.assertGreaterEqual(r.status, 500)
        day = time.strftime("%Y-%m-%d", time.gmtime(time.time() + 330 * 60))
        doc = get_store().get("usage", f"{b['uid']}:gen:{day}")
        self.assertEqual((doc or {}).get("n"), 0)


class TestGameProblems(Learn):
    def test_hides_answers_checks_server_side_reopens_saved(self):
        a = self.user()
        g = post("/api/learn/game", {"title": "Newton laws"}, cookie=a["cookie"]).json()
        self.assertEqual(g["state"], "generated")
        self.assertNotIn('"answer"', str(g).replace("'", '"'))
        self.assertEqual(sorted(g["rounds"][2]["steps"]), ["Conclude", "Hypothesise", "Observe", "Test"])
        n = self.ai_calls()
        self.assertEqual(post("/api/learn/game", {"title": "newton laws"}, cookie=a["cookie"]).json()["state"], "saved")
        self.assertEqual(self.ai_calls(), n)
        win = put("/api/learn/game", {"title": "Newton laws", "answers": [True, False, ["Observe", "Hypothesise", "Test", "Conclude"], {"F": "force", "m": "mass", "a": "acceleration"}]}, cookie=a["cookie"]).json()
        self.assertEqual(win["score"], 1)
        lose = put("/api/learn/game", {"title": "Newton laws", "answers": [False, True, [], {}]}, cookie=a["cookie"]).json()
        self.assertEqual(lose["score"], 0)

    def test_generated_content_goes_to_the_main_database_for_every_category_and_rewrites_update_it(self):
        a = self.user("a@example.com", "other")  # a category that used to be kept private
        self.assertEqual(post("/api/learn/game", {"title": "Entropy basics"}, cookie=a["cookie"]).json()["state"], "generated")
        n = self.ai_calls()
        b = self.user("b@example.com", "other")
        self.assertEqual(post("/api/learn/game", {"title": "Entropy basics"}, cookie=b["cookie"]).json()["state"], "shared")
        self.assertEqual(self.ai_calls(), n)  # nothing was written again
        self.assertEqual(post("/api/learn/game", {"title": "Entropy basics", "fresh": True}, cookie=b["cookie"]).json()["state"], "generated")
        pooled = get_store().find("shared_assets", limit=10)
        self.assertEqual([p["version"] for p in pooled], [2])  # the rewrite replaced the shared copy
        c = self.user("c@example.com", "other")
        self.assertEqual(post("/api/learn/game", {"title": "Entropy basics"}, cookie=c["cookie"]).json()["version"], 2)

    def test_personal_titles_and_opted_out_learners_are_never_shared(self):
        a = self.user("a@example.com", "other")
        post("/api/learn/game", {"title": "Notes for asha@example.com roll 20231234"}, cookie=a["cookie"])
        self.assertEqual(get_store().find("shared_assets", limit=10), [])
        post("/api/me/privacy", {"shareContent": False}, cookie=a["cookie"])
        post("/api/learn/game", {"title": "Entropy basics"}, cookie=a["cookie"])
        self.assertEqual(get_store().find("shared_assets", limit=10), [])
        post("/api/me/privacy", {"shareContent": True}, cookie=a["cookie"])
        post("/api/learn/game", {"title": "Entropy basics", "fresh": True}, cookie=a["cookie"])
        self.assertEqual(len(get_store().find("shared_assets", limit=10)), 1)

    def test_practice_round_hides_answers_checks_on_the_server_and_feeds_the_estimate(self):
        a = self.user("a@example.com")
        r = post("/api/learn/drill", {"title": "Newton laws"}, cookie=a["cookie"]).json()
        self.assertEqual(len(r["cards"]), 5)
        self.assertNotIn("answer", str(r))
        self.assertNotIn("why", str(r))
        hit = put("/api/learn/drill", {"title": "Newton laws", "index": 1, "choice": 1}, cookie=a["cookie"]).json()
        self.assertEqual((hit["ok"], hit["answer"]), (True, 1))
        self.assertIn("F = m a", hit["why"])
        miss = put("/api/learn/drill", {"title": "Newton laws", "index": 0, "choice": 0}, cookie=a["cookie"]).json()
        self.assertFalse(miss["ok"])
        self.assertEqual(put("/api/learn/drill", {"title": "Newton laws", "index": 9, "choice": 0}, cookie=a["cookie"]).status, 404)

    def test_numeric_tolerance_and_withheld_solution(self):
        a = self.user()
        p = post("/api/learn/problems", {"title": "Newton laws"}, cookie=a["cookie"]).json()
        self.assertEqual(len(p["worked"]), 1)
        self.assertNotIn("solution", str(p["practice"]))
        chk = lambda **b: put("/api/learn/problems", {"title": "Newton laws", **b}, cookie=a["cookie"]).json()  # noqa: E731
        wrong = chk(index=0, value="19")
        self.assertFalse(wrong["ok"])
        self.assertNotIn("solution", wrong)
        self.assertTrue(chk(index=0, value="20.1")["ok"])
        self.assertTrue(chk(index=1, value=" Second Law. ")["ok"])
        self.assertIn("2.5", chk(index=2, value="x", reveal=True)["solution"])

    def test_answer_matching(self):
        self.assertTrue(answer_matches(100, "100"))
        self.assertFalse(answer_matches(100, "101.5"))
        self.assertTrue(answer_matches("1,000", 1000))
        self.assertTrue(answer_matches("Newton", "newton!"))

    def test_free_plan_allowance_stops_and_says_so(self):
        cookie, _ = self.sign_up("f@example.com", "Free")
        post("/api/sessions", {}, cookie=cookie)
        r = post("/api/learn/game", {"title": "Topic number 1"}, cookie=cookie)  # games are part of Beta
        self.assertEqual((r.status, r.json()["error"]), (402, "plan_required"))
        q = post("/api/learn/problems", {"title": "Topic number 1"}, cookie=cookie)
        self.assertEqual((q.status, q.json()["error"]), (402, "plan_required"))


class TestMastery(Learn):
    def test_mastery_and_recommendation(self):
        a = self.user()
        c = post("/api/courses", {"text": STATS}, cookie=a["cookie"]).json()
        first = get(f"/api/learn/progress?courseId={c['id']}", cookie=a["cookie"]).json()
        self.assertEqual(first["next"]["id"], c["course"]["order"][0])
        t0 = c["course"]["topics"][c["course"]["order"][0]]["title"]
        bad = post("/api/learn/progress", {"title": t0, "event": "quiz", "score": 0}, cookie=a["cookie"]).json()
        good = post("/api/learn/progress", {"title": t0, "event": "quiz", "score": 1}, cookie=a["cookie"]).json()
        self.assertLess(bad["mastery"], 0.5)
        self.assertGreater(good["mastery"], bad["mastery"])
        after = get(f"/api/learn/progress?courseId={c['id']}", cookie=a["cookie"]).json()
        self.assertTrue(after["next"]["id"])


class TestUnits(Learn):
    def unit_of(self, cookie):
        c = post("/api/courses", {"text": STATS}, cookie=cookie).json()
        unit = c["course"]["units"][0]
        return {"courseId": c["id"], "unitId": unit["id"]}, [c["course"]["topics"][t]["title"] for t in unit["topics"]]

    def test_unit_answers_on_click_versions_markdown(self):
        a = self.user()
        u, _ = self.unit_of(a["cookie"])
        q = f"courseId={u['courseId']}&unitId={u['unitId']}"
        self.assertIsNone(get(f"/api/learn/unit-answers?{q}", cookie=a["cookie"]).json()["saved"])
        v1 = post("/api/learn/unit-answers", u, cookie=a["cookie"]).json()["version"]
        v2 = post("/api/learn/unit-answers", u, cookie=a["cookie"]).json()["version"]
        self.assertEqual([v1, v2], [1, 2])
        md = get(f"/api/learn/unit-answers?{q}&format=md", cookie=a["cookie"])
        self.assertIn("markdown", md.headers["content-type"])
        self.assertIn("# Notes", md.text)

    def test_marks_notes_behind_addon_and_refund_on_failure(self):
        a = self.user()
        u, titles = self.unit_of(a["cookie"])
        weights = [{"topic": t, "marks": 10 if i else 2} for i, t in enumerate(titles[:2])]
        no = post("/api/learn/notes", {**u, "weights": weights}, cookie=a["cookie"])
        self.assertEqual(no.status, 402)
        self.assertEqual(no.json()["error"], "addon_required")
        addons.grant(a["uid"], "unit_notes", quantity=1)
        self.assertEqual(post("/api/learn/notes", {**u, "weights": weights}, cookie=a["cookie"]).status, 200)
        self.assertEqual(post("/api/learn/notes", {**u, "weights": weights}, cookie=a["cookie"]).status, 402)
        addons.grant(a["uid"], "unit_notes", quantity=1)
        self.break_ai()
        self.assertGreaterEqual(post("/api/learn/notes", {**u, "weights": weights}, cookie=a["cookie"]).status, 500)
        self.w.fail.clear()
        self.assertEqual(post("/api/learn/notes", {**u, "weights": weights}, cookie=a["cookie"]).status, 200)
        self.assertEqual(post("/api/learn/notes", {**u, "weights": [{"topic": "Not in this unit", "marks": 5}]}, cookie=a["cookie"]).status, 400)

    def test_chat_addon_cache_and_private_history(self):
        a = self.user()
        T = "Newton laws of motion"
        post("/api/learn/prepare", {"sessionId": a["sid"], "title": T}, cookie=a["cookie"])
        self.assertEqual(post("/api/learn/chat", {"title": T, "question": "What is force?"}, cookie=a["cookie"]).status, 402)
        addons.grant(a["uid"], "chatbot", days=30)
        one = post("/api/learn/chat", {"title": T, "question": "What is force?"}, cookie=a["cookie"]).json()
        self.assertIn("slide", one["answer"])
        self.assertFalse(one["cached"])
        n = self.ai_calls()
        self.assertTrue(post("/api/learn/chat", {"title": T, "question": "what is force"}, cookie=a["cookie"]).json()["cached"])
        self.assertEqual(self.ai_calls(), n)
        self.assertEqual(len(get("/api/learn/chat?title=Newton laws of motion", cookie=a["cookie"]).json()["messages"]), 4)
        b = self.user("b@example.com")
        self.assertEqual(len(get("/api/learn/chat?title=Newton laws of motion", cookie=b["cookie"]).json()["messages"]), 0)

    def test_addon_list_and_checkout(self):
        self.w = setup(RAZORPAY_KEY_ID="rzp_test", RAZORPAY_KEY_SECRET="s", PRICE_ADDON_UNIT_NOTES_INR="49")
        a = self.user()
        l = get("/api/addons", cookie=a["cookie"]).json()
        self.assertEqual([x["sku"] for x in l["catalogue"]], ["unit_notes", "monthly_notes", "chatbot", "noads", "pack"])
        self.assertEqual(l["catalogue"][0]["priceInr"], 49)
        self.assertIn("rzp.io", post("/api/addons", {"sku": "unit_notes"}, cookie=a["cookie"]).json()["url"])

    def test_free_monthly_chat_and_notes_then_paywall_and_bundle_discount(self):
        self.w = setup(FREE_CHAT_PER_MONTH="2", FREE_NOTES_PER_MONTH="2", PRICE_ADDON_CHATBOT_MONTH_INR="59", PRICE_ADDON_MONTHLY_NOTES_INR="99", PRICE_ADDON_PACK_MONTH_INR="129")
        a = self.user()
        T = "Newton laws of motion"
        post("/api/learn/prepare", {"sessionId": a["sid"], "title": T}, cookie=a["cookie"])
        ask = lambda q: post("/api/learn/chat", {"title": T, "question": q}, cookie=a["cookie"])
        self.assertEqual([ask("What is force?").status, ask("What is mass?").status], [200, 200])
        third = ask("What is inertia?")
        self.assertEqual((third.status, third.json()["error"]), (402, "addon_required"))
        self.assertEqual(get("/api/me", cookie=a["cookie"]).json()["month"]["chat"], [2, 2])
        u, titles = self.unit_of(a["cookie"])
        weights = [{"topic": t, "marks": 5} for t in titles[:2]]
        notes = lambda: post("/api/learn/notes", {**u, "weights": weights}, cookie=a["cookie"]).status
        self.assertEqual([notes(), notes(), notes()], [200, 200, 402])
        cat = {c["sku"]: c for c in get("/api/addons", cookie=a["cookie"]).json()["catalogue"]}
        self.assertEqual((cat["pack"]["listPriceInr"], cat["pack"]["saveInr"], cat["pack"]["savePct"]), (158, 29, 18))
        addons.grant(a["uid"], "pack", days=30)
        self.assertTrue(addons.has(a["uid"], "chatbot") and addons.has(a["uid"], "monthly_notes"))
        self.assertEqual(notes(), 200)


if __name__ == "__main__":
    unittest.main()
