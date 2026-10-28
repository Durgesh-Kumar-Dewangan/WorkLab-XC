import io
import json
import re
import unittest
import zipfile
from urllib.parse import unquote, urlparse

from wlxc import jobs, llm
from wlxc.mail import flush_mail, send_mail
from wlxc.mailtpl import T
from wlxc.store import get_store
from wlxc.styles import STYLES, infer_style, mix, resolve_style

from .helpers import AUTH_CRON, Base, STATS, call, cookie_of, delete, get, post, setup

PROMPT = ("Reply with the word ok.", "go")


class Mail(Base):
    def last_token(self):
        m = next(x for x in reversed(self.w.mails) if "token=" in x["body"])
        return unquote(re.search(r"token=([A-Za-z0-9_%\-.~]+)", m["body"]).group(1))


class TestProviderChain(Base):
    def test_each_provider_gets_its_own_request_shape(self):
        self.w = setup(GROQ_API_KEY="g1", MISTRAL_API_KEY="m1", GEMINI_API_KEY="ge1", OPENROUTER_API_KEY="or1", OPENAI_API_KEY="oa1")
        for p in ["groq", "mistral", "gemini", "openrouter", "openai"]:
            self.w.calls.clear()
            out = llm.complete(*PROMPT, lambda t: t, [p], json_mode=True)
            self.assertGreater(len(out["text"]), 0)
            c = self.w.calls[0]
            b = json.loads(c["body"])
            self.assertTrue(c["headers"]["authorization"].startswith("Bearer "))
            if p == "groq": self.assertEqual(c["url"], "https://api.groq.com/openai/v1/chat/completions")
            if p == "mistral": self.assertEqual(c["url"], "https://api.mistral.ai/v1/chat/completions")
            if p == "gemini": self.assertIn("generativelanguage.googleapis.com/v1beta/openai/chat/completions", c["url"])
            if p == "openrouter":
                self.assertEqual(c["url"], "https://openrouter.ai/api/v1/chat/completions")
                self.assertNotIn("response_format", b)
            else:
                self.assertEqual(b["response_format"]["type"], "json_object")
            if p == "openai":
                self.assertGreater(b["max_completion_tokens"], 0)
                self.assertNotIn("max_tokens", b)
            else:
                self.assertGreater(b["max_tokens"], 0)

    def test_falls_through_groq_mistral_gemini_to_openrouter(self):
        self.w = setup(GROQ_API_KEY="g1", MISTRAL_API_KEY="m1", GEMINI_API_KEY="ge1", OPENROUTER_API_KEY="or1", LLM_ORDER="groq,mistral,gemini,openrouter")
        self.w.fail |= {"api.groq.com", "api.mistral.ai", "generativelanguage.googleapis.com"}
        out = llm.complete(*PROMPT, lambda t: t)
        self.assertEqual(out["usage"]["provider"], "openrouter")
        hosts = [urlparse(c["url"]).netloc for c in self.w.calls]
        self.assertIn("api.groq.com", hosts)
        self.assertIn("api.mistral.ai", hosts)
        self.assertEqual(hosts[-1], "openrouter.ai")

    def test_rotates_keys_when_rate_limited(self):
        self.w = setup(GROQ_API_KEYS="k1,k2,k3", MISTRAL_API_KEY="m1", LLM_ORDER="groq,mistral")
        self.w.limited["k1"] = 99
        out = llm.complete(*PROMPT, lambda t: t)
        self.assertEqual(out["usage"]["provider"], "groq")
        self.assertEqual([c["headers"]["authorization"] for c in self.w.calls][:2], ["Bearer k1", "Bearer k2"])
        self.w.calls.clear()
        llm.complete(*PROMPT, lambda t: t)
        self.assertNotIn("Bearer k1", [c["headers"]["authorization"] for c in self.w.calls])

    def test_skips_failing_provider(self):
        self.w = setup(GROQ_API_KEY="g1", MISTRAL_API_KEY="m1", LLM_ORDER="groq,mistral")
        self.w.fail.add("api.groq.com")
        for _ in range(4):
            llm.complete(*PROMPT, lambda t: t)
        self.w.calls.clear()
        llm.complete(*PROMPT, lambda t: t)
        self.assertEqual([urlparse(c["url"]).netloc for c in self.w.calls], ["api.mistral.ai"])

    def test_plain_503_names_no_provider(self):
        self.w = setup(GROQ_API_KEY="g1", MISTRAL_API_KEY="m1", LLM_ORDER="groq,mistral")
        self.w.fail |= {"api.groq.com", "api.mistral.ai"}
        with self.assertRaises(Exception) as cm:
            llm.complete(*PROMPT, lambda t: t)
        self.assertEqual(cm.exception.status, 503)
        self.assertNotRegex((cm.exception.code + cm.exception.message).lower(), r"groq|mistral|openai|gemini|azure")

    def test_lists_only_configured_providers_in_order(self):
        self.w = setup(MISTRAL_API_KEY="m1", GROQ_API_KEY="g1", LLM_ORDER="groq,gemini,mistral,azure")
        self.assertEqual(llm.provider_names(), ["groq", "mistral", "azure"])
        self.assertGreaterEqual(len(llm.routes()), 3)

    def test_json_extraction(self):
        self.assertEqual(llm.extract_json('```json\n{"a": 1,}\n```'), {"a": 1})
        self.assertEqual(llm.extract_json('Sure! Here you go: {"a": [1, 2]} hope it helps'), {"a": [1, 2]})
        with self.assertRaises(ValueError):
            llm.extract_json("no json here")

    def test_repairs_an_invalid_reply_once(self):
        self.w = setup(GROQ_API_KEY="g1", LLM_ORDER="groq")
        n = {"v": 0}

        def parse(t):
            n["v"] += 1
            if n["v"] == 1:
                raise ValueError("too short")
            return t
        out = llm.complete(*PROMPT, parse)
        self.assertEqual(n["v"], 2)
        self.assertIn("Your previous reply was rejected: too short", self.w.calls[1]["body"])
        self.assertTrue(out["text"])

    def test_no_provider_names_leak_in_finished_run_or_image_response(self):
        self.w = setup(GROQ_API_KEY="g1")
        cookie, _ = self.sign_up()
        self.upgrade("asha@example.com")
        c = post("/api/courses", {"text": STATS}, cookie=cookie).json()
        job = post("/api/jobs", {"courseId": c["id"], "topicIds": c["course"]["order"][:1]}, cookie=cookie).json()["job"]
        jobs.run_job(job["id"], 120_000)
        raw = get(f"/api/jobs/{job['id']}", cookie=cookie).text
        self.assertNotRegex(raw.lower(), r"groq|azure|openai|gemini|mistral|cloudflare|notebooklm|chatgpt")
        img = post("/api/images", {"prompt": "a cell"}, cookie=cookie)
        self.assertEqual(img.status, 200)
        self.assertNotIn("provider", ",".join(img.headers))


class TestStyles(Base):
    def test_style_words_and_paid_accent(self):
        self.assertEqual(infer_style("dark minimal deck with orange accents"), {"style": "midnight", "accent": "EA580C"})
        self.assertEqual(resolve_style(instructions="warm and friendly")["id"], "sunrise")
        self.assertEqual(resolve_style("forest", "#112233")["accent"], STYLES["forest"]["accent"])
        self.assertEqual(resolve_style("forest", "#112233", allow_custom_accent=True)["accent"], "112233")
        self.assertEqual(resolve_style("nonsense", allow_custom_accent=True)["id"], "clean")
        self.assertEqual(mix("000000", "FFFFFF", 0.5), "808080")

    def test_lists_presets(self):
        ids = [s["id"] for s in get("/api/styles", origin=None).json()["styles"]]
        for i in ("clean", "midnight", "academic"):
            self.assertIn(i, ids)

    def test_validates_style_input_and_gates_accent(self):
        cookie, _ = self.sign_up()
        c = post("/api/courses", {"text": STATS}, cookie=cookie).json()
        t = c["course"]["order"][:1]
        mk = lambda **e: post("/api/jobs", {"courseId": c["id"], "topicIds": t, **e}, cookie=cookie).status  # noqa: E731
        self.assertEqual(mk(style="neon"), 422)
        self.assertEqual(mk(accent="red-ish"), 422)
        self.assertEqual(mk(accent="#FF8800"), 402)
        self.assertEqual(mk(style="midnight"), 202)

    def test_deck_uses_chosen_theme_colours(self):
        cookie, _ = self.sign_up()
        self.upgrade("asha@example.com")
        c = post("/api/courses", {"text": STATS}, cookie=cookie).json()
        j = post("/api/jobs", {"courseId": c["id"], "topicIds": c["course"]["order"][:1], "style": "midnight", "accent": "#FF8800"}, cookie=cookie).json()["job"]
        jobs.run_job(j["id"], 120_000)
        res = get(f"/api/jobs/{j['id']}/download?format=pptx", cookie=cookie)
        self.assertEqual(res.status, 200)
        z = zipfile.ZipFile(io.BytesIO(res.body))
        found = "".join(z.read(n).decode() for n in z.namelist() if n.startswith("ppt/slides/slide") and n.endswith(".xml"))
        self.assertIn("FF8800", found)
        self.assertIn(STYLES["midnight"]["bg"], found)


class TestEmail(Mail):
    def test_resend_escapes_hostile_text(self):
        self.w = setup(RESEND_API_KEY="re_1")
        send_mail("x@example.com", "ticket", T.ticket_received("<script>alert(1)</script>", None))
        self.assertEqual(len(self.w.mails), 1)
        sent = json.loads(self.w.mails[0]["body"])
        self.assertNotIn("<script>", sent["html"])
        self.assertIn("@worklabxc.com", sent["from"])
        self.assertEqual(sent["reply_to"], "support@worklabxc.com")

    def test_strips_line_breaks_from_subjects(self):
        self.w = setup(RESEND_API_KEY="re_1")
        send_mail("x@example.com", "jobdone", T.job_done("A", "Intro\r\nBcc: evil@example.com", 1, "j1"))
        self.assertIsNone(re.search(r"[\r\n]", json.loads(self.w.mails[0]["body"])["subject"]))

    def test_falls_back_to_brevo_then_mailgun(self):
        self.w = setup(RESEND_API_KEY="re_1", BREVO_API_KEY="br_1", MAILGUN_API_KEY="mg_1", MAILGUN_DOMAIN="mg.worklabxc.com")
        self.w.fail |= {"api.resend.com", "api.brevo.com"}
        send_mail("x@example.com", "a", T.password_changed("Asha"))
        self.assertEqual([m["host"] for m in self.w.mails], ["api.mailgun.net"])

    def test_retries_from_cron_after_total_outage(self):
        self.w = setup(RESEND_API_KEY="re_1")
        self.w.fail.add("api.resend.com")
        send_mail("x@example.com", "a", T.password_changed("Asha"))
        self.assertEqual(len(self.w.mails), 0)
        self.w.fail.clear()
        st = get_store()
        for m in st.find("mail_outbox"):
            st.update("mail_outbox", m["id"], lambda c: {**c, "next": 0} if c else c)
        self.assertEqual(flush_mail()["sent"], 1)
        self.assertEqual(len(self.w.mails), 1)
        self.assertEqual(flush_mail()["sent"], 0)

    def test_no_duplicate_within_a_minute(self):
        self.w = setup(RESEND_API_KEY="re_1")
        send_mail("x@example.com", "a", T.password_changed("Asha"))
        send_mail("x@example.com", "a", T.password_changed("Asha"))
        self.assertEqual(len(self.w.mails), 1)

    def test_silent_with_no_provider(self):
        send_mail("x@example.com", "a", T.password_changed("Asha"))
        self.assertEqual(len(self.w.mails), 0)
        self.assertEqual(flush_mail()["sent"], 0)

    def test_included_in_cron_tick(self):
        self.w = setup(RESEND_API_KEY="re_1")
        r = get("/api/internal/cron", origin=None, headers=AUTH_CRON)
        self.assertEqual(r.status, 200)
        self.assertIn("mail", r.json())


class TestVerifyReset(Mail):
    def setUp(self):
        self.w = setup(RESEND_API_KEY="re_1")

    def test_verification_mail_and_single_use_link(self):
        cookie, _ = self.sign_up()
        self.assertEqual(len(self.w.mails), 1)
        token = self.last_token()
        self.assertFalse(get("/api/me", cookie=cookie).json()["user"]["emailVerified"])
        self.assertEqual(post("/api/auth/verify-email", {"token": token}).status, 200)
        self.assertTrue(self.user_doc("asha@example.com")["emailVerified"])
        self.assertEqual(post("/api/auth/verify-email", {"token": token}).status, 400)
        self.assertEqual(post("/api/auth/verify-email", {"token": "x" * 40}).status, 400)

    def test_resend_verification(self):
        cookie, _ = self.sign_up()
        self.assertEqual(post("/api/auth/resend-verification", {}, cookie=cookie).status, 200)
        self.assertFalse(self.user_doc("asha@example.com").get("emailVerified"))

    def test_reset_password_flow(self):
        cookie, _ = self.sign_up()
        self.w.mails.clear()
        ghost = post("/api/auth/forgot-password", {"email": "ghost@example.com"})
        real = post("/api/auth/forgot-password", {"email": "asha@example.com"})
        self.assertEqual(ghost.status, 200)
        self.assertEqual(ghost.json(), real.json())
        self.assertEqual(len(self.w.mails), 1)
        token = self.last_token()
        self.assertEqual(post("/api/auth/reset-password", {"token": token, "password": "short"}).status, 422)
        self.assertEqual(post("/api/auth/reset-password", {"token": token, "password": "Brand-new-pass1"}).status, 200)
        self.assertEqual(post("/api/auth/reset-password", {"token": token, "password": "Another-pass-22"}).status, 400)
        self.assertEqual(get("/api/me", cookie=cookie).status, 401)
        self.assertEqual(post("/api/auth/login", {"email": "asha@example.com", "password": "S3cure-pass!"}).status, 401)
        self.assertEqual(post("/api/auth/login", {"email": "asha@example.com", "password": "Brand-new-pass1"}).status, 200)

    def test_change_password_keeps_this_device(self):
        a, _ = self.sign_up()
        other = cookie_of(post("/api/auth/login", {"email": "asha@example.com", "password": "S3cure-pass!"}))
        self.assertEqual(post("/api/auth/change-password", {"current": "wrong-pass-1", "password": "Brand-new-pass1"}, cookie=a).status, 403)
        self.assertEqual(post("/api/auth/change-password", {"current": "S3cure-pass!", "password": "Brand-new-pass1"}, cookie=a).status, 200)
        self.assertEqual(get("/api/me", cookie=a).status, 200)
        self.assertEqual(get("/api/me", cookie=other).status, 401)

    def test_checkout_blocked_until_email_confirmed(self):
        cookie, _ = self.sign_up()
        blocked = post("/api/checkout", {"plan": "learner", "billing": "month"}, cookie=cookie)
        self.assertEqual(blocked.status, 403)
        self.assertEqual(blocked.json()["error"], "email_unverified")
        post("/api/auth/verify-email", {"token": self.last_token()})
        self.assertEqual(post("/api/checkout", {"plan": "learner", "billing": "month"}, cookie=cookie).status, 200)


class TestExportDelete(Base):
    def test_export_without_secrets(self):
        cookie, _ = self.sign_up()
        r = get("/api/me/export", cookie=cookie)
        self.assertIn("attachment", r.headers["content-disposition"])
        self.assertIn("asha@example.com", r.text)
        self.assertIsNone(re.search(r'scrypt|"hash"', r.text))

    def test_delete_everything_after_password_check(self):
        cookie, _ = self.sign_up()
        self.upgrade("asha@example.com")
        c = post("/api/courses", {"text": STATS}, cookie=cookie).json()
        uid = self.user_doc("asha@example.com")["id"]
        post("/api/feedback", {"rating": 4, "comment": "nice"}, cookie=cookie)
        self.assertEqual(delete("/api/me", {"password": "wrong-pass-1"}, cookie=cookie).status, 403)
        d = delete("/api/me", {"password": "S3cure-pass!"}, cookie=cookie)
        self.assertEqual(d.status, 200)
        self.assertRegex(d.headers["set-cookie"], r"(?i)Max-Age=0|Expires=")
        st = get_store()
        self.assertIsNone(st.get("emails", "asha@example.com"))
        self.assertIsNone(st.get("courses", c["id"]))
        self.assertEqual(st.find("feedback")[0]["uid"], "deleted")
        self.assertEqual(get("/api/me", cookie=cookie).status, 401)
        self.assertIsNone(st.get("users", uid))
        self.assertEqual(self.sign_up()[1].status, 201)


class TestFeedbackAdmin(Base):
    def test_general_feedback_not_gated(self):
        cookie, _ = self.sign_up()
        ok = post("/api/feedback", {"rating": 5, "comment": "Love the decks", "tags": ["content"], "page": "/app/studio"}, cookie=cookie)
        self.assertEqual(ok.status, 201)
        self.assertEqual(post("/api/sessions", {}, cookie=cookie).status, 201)
        mine = get("/api/feedback", cookie=cookie).json()["feedback"]
        self.assertTrue(any(f["kind"] == "general" and f["rating"] == 5 for f in mine))
        self.assertEqual(post("/api/feedback", {"rating": 0}, cookie=cookie).status, 422)

    def test_low_rating_emails_team_and_thanks_user(self):
        self.w = setup(RESEND_API_KEY="re_1")
        cookie, _ = self.sign_up()
        self.w.mails.clear()
        post("/api/feedback", {"rating": 1, "comment": "it crashed"}, cookie=cookie)
        to = [json.dumps(json.loads(m["body"])["to"]) for m in self.w.mails]
        self.assertTrue(any("asha@example.com" in t for t in to))
        self.assertTrue(any("support@worklabxc.com" in t for t in to))

    def test_admin_routes_for_admins_only(self):
        self.w = setup(ADMIN_EMAILS="boss@example.com")
        user, _ = self.sign_up("asha@example.com")
        boss, _ = self.sign_up("boss@example.com", "Boss")
        post("/api/feedback", {"rating": 2, "comment": "slow"}, cookie=user)
        t = post("/api/support", {"message": "Need help with my plan"}, cookie=user).json()
        for p in ("/api/admin/overview", "/api/admin/feedback", "/api/admin/tickets"):
            self.assertEqual(get(p, cookie=user).status, 403)
            self.assertEqual(get(p).status, 401)
        ov = get("/api/admin/overview", cookie=boss).json()
        self.assertEqual(ov["users"]["total"], 2)
        self.assertEqual(ov["feedback"]["last30d"], 1)
        self.assertEqual(ov["openTickets"], 1)
        fb = get("/api/admin/feedback?maxRating=2", cookie=boss).json()["feedback"]
        self.assertEqual(fb[0]["comment"], "slow")
        self.assertEqual(fb[0]["from"], "asha@example.com")
        self.assertEqual(post(f"/api/admin/tickets/{t['ticketId']}", {}, cookie=user).status, 403)
        self.assertEqual(post(f"/api/admin/tickets/{t['ticketId']}", {}, cookie=boss).status, 200)
        self.assertEqual(len(get("/api/admin/tickets", cookie=boss).json()["tickets"]), 0)


if __name__ == "__main__":
    unittest.main()
