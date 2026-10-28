"""Every feature, checked as a Free, a Beta and a Beta Plus learner through the real API. The table is printed at the end: yes means allowed."""
import time

from wlxc import addons, courses
from wlxc.errors import ApiError

from .helpers import Base, STATS, get, post, put, setup

ROWS: list[tuple[str, bool, bool, bool]] = []


def yn(v: bool) -> str:
    return "yes" if v else "no"


class TestPlanMatrix(Base):
    def setUp(self):
        self.w = setup(FREE_CHAT_PER_MONTH="2", FREE_NOTES_PER_MONTH="2")
        self.who = {}
        for name, plan, extras in (("free", None, ()), ("beta", "learner", ()), ("plus", "learner", ("chatbot", "monthly_notes"))):
            email = f"{name}@example.com"
            cookie, _ = self.sign_up(email)
            if plan:
                self.upgrade(email, plan)
            uid = self.user_doc(email)["id"]
            for sku in extras:
                addons.grant(uid, sku, days=30)
            sid = post("/api/sessions", {}, cookie=cookie).json()["session"]["id"]
            self.who[name] = {"cookie": cookie, "uid": uid, "sid": sid, "email": email}

    def all(self, feature, probe, expect):
        """Runs the same probe as each kind of learner and checks it against what the plan promises."""
        vals = [probe(self.who[n]) for n in ("free", "beta", "plus")]
        got = tuple(v if (isinstance(v, int) and not isinstance(v, bool)) else bool(v) for v in vals)
        ROWS.append((feature, *got))
        self.assertEqual(got, expect, f"{feature}: free/beta/plus came out {got}, expected {expect}")

    # ---- what the plan allows
    def test_matrix(self):
        ok = lambda r: r.status < 300  # noqa: E731
        post_ = lambda path, body: (lambda w: ok(post(path, body, cookie=w["cookie"])))  # noqa: E731

        # subjects and syllabus files
        def second_course(w):
            a = post("/api/courses", {"text": STATS}, cookie=w["cookie"])
            b = post("/api/courses", {"text": STATS.replace("Statistics", "Probability")}, cookie=w["cookie"])
            w["course"] = a.json()["id"]
            return ok(a) and ok(b)

        self.all("More than one subject", second_course, (False, True, True))
        self.all("Learning sessions", lambda w: bool(w["sid"]), (True, True, True))

        def pdf(w):
            u = self.user_doc(w["email"])
            try:
                courses.ingest_syllabus(u, file=("a.pdf", b"%PDF-1.4\n%x"))
            except ApiError as e:
                return e.code != "plan_required"
            return True

        self.all("PDF and Word syllabi", pdf, (False, True, True))

        # games, practice rounds, problems, exams
        self.all("Games", post_("/api/learn/game", {"title": "Newton laws"}), (False, True, True))
        self.all("Practice rounds (Play)", post_("/api/learn/drill", {"title": "Newton laws"}), (False, True, True))
        self.all("Practice problems", post_("/api/learn/problems", {"title": "Newton laws"}), (False, True, True))

        def exam(w):
            cid = w["course"]
            ids = courses.get_course_doc(self.user_doc(w["email"]), cid)["course"]["order"][:3]
            r = post("/api/exams", {"courseId": cid, "topicIds": ids, "count": 5}, cookie=w["cookie"])
            return r.status != 402

        self.all("Practice exams", exam, (False, True, True))

        # classroom, ads, images, custom instructions
        def classroom(w):
            cid = w["course"]
            first = post("/api/classroom/enter", {"courseId": cid, "topicId": "t1"}, cookie=w["cookie"])
            second = post("/api/classroom/enter", {"courseId": cid, "topicId": "t2"}, cookie=w["cookie"])
            return ok(first) and ok(second)

        self.all("3D classroom, every topic", classroom, (False, True, True))
        self.all("No ads", lambda w: not get("/api/me", cookie=w["cookie"]).json()["limits"]["ads"], (False, True, True))

        def job(**extra):
            def run(w):
                cid = w["course"]
                ids = courses.get_course_doc(self.user_doc(w["email"]), cid)["course"]["order"][:1]
                return post("/api/jobs", {"courseId": cid, "topicIds": ids, **extra}, cookie=w["cookie"]).status < 300
            return run

        self.all("AI illustrations", job(images=True), (False, True, True))
        self.all("Custom instructions for decks", job(instructions="Use simple words."), (False, True, True))

        # monthly allowances
        def asks(n):
            def run(w):
                post("/api/learn/prepare", {"sessionId": w["sid"], "title": "Newton laws of motion"}, cookie=w["cookie"])
                last = None
                for i in range(n):
                    last = post("/api/learn/chat", {"title": "Newton laws of motion", "question": f"What is force number {i}?"}, cookie=w["cookie"])
                return last is not None and ok(last)
            return run

        self.all("Tutor chat: 2 questions", asks(2), (True, True, True))
        self.all("Tutor chat: a 3rd question", asks(1), (False, False, True))

        def notes(w):
            cid = w["course"]
            doc = courses.get_course_doc(self.user_doc(w["email"]), cid)["course"]
            unit = doc["units"][0]
            body = {"courseId": cid, "unitId": unit["id"], "weights": [{"topic": doc["topics"][unit["topics"][0]]["title"], "marks": 5}]}
            res = [post("/api/learn/notes", {**body, "weights": [{**body["weights"][0], "marks": 5 + i}]}, cookie=w["cookie"]) for i in range(4)]
            return all(ok(r) for r in res)

        self.all("Unit notes: 4 in a month", notes, (False, False, True))

        # support sessions a month
        def support(w):
            made = 0
            for i in range(6):
                r = post("/api/support/session", {"topic": f"t{i}", "wanted": time.time() * 1000 + 3 * 86_400_000 + i * 3_600_000}, cookie=w["cookie"])
                if not ok(r):
                    break
                made += 1
                post(f"/api/support/session/{r.json()['session']['id']}/cancel", {}, cookie=w["cookie"])
            w["support"] = made
            return made

        self.all("Support sessions (count a month)", support, (1, 4, 4))
        print("\n\nFeature".ljust(42) + "Free   Beta   Beta Plus")
        for f, a, b, c in ROWS:
            show = (lambda v: str(v)) if isinstance(a, int) and not isinstance(a, bool) and f.startswith("Support") else yn
            print(f"{f:<40}{show(a):<7}{show(b):<7}{show(c)}")
