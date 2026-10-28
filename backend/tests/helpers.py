"""Test harness: an in-memory store, a fake outside world (no real network), and a tiny client that calls the real
route handlers exactly as the web server does."""
from __future__ import annotations

import base64
import hashlib
import hmac as _hmac
import json
import os
import re
import unittest
from dataclasses import dataclass, field
from urllib.parse import urlparse

from wlxc import api, bg, llm, net
from wlxc.net import Resp
from wlxc.store import SqliteStore, set_store
from wlxc.web import Out, Req

APP = "http://localhost:3000"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")

CLEAR = ["ADMIN_EMAILS", "DEV_EMAILS", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "PAYPAL_ENV", "TURNSTILE_SECRET", "COMPAT_LLM_BASE_URL", "COMPAT_LLM_MODEL", "DATABASE_URL", "SQLITE_PATH", "FEEDBACK_GRACE_SESSIONS", "HF_TOKEN",
         "OPENAI_API_KEY", "OPENAI_API_KEYS", "GEMINI_API_KEY", "GEMINI_API_KEYS", "GOOGLE_API_KEY", "GROQ_API_KEY", "GROQ_API_KEYS",
         "MISTRAL_API_KEY", "OPENROUTER_API_KEY", "RESEND_API_KEY", "BREVO_API_KEY", "MAILGUN_API_KEY", "MAILGUN_DOMAIN", "SMTP_URL",
         "ADMIN_EMAILS", "MAIL_ORDER", "IPINTEL_PROVIDER", "IPINTEL_KEY", "IPINTEL_FAIL", "VPN_POLICY", "IP_ALLOWLIST",
         "AUTO_BLOCK_HITS_PER_HOUR", "SIGNUPS_PER_IP_DAY", "AZURE_OPENAI_EMBED_DEPLOYMENT", "OPENAI_EMBED_MODEL", "WLXC_ENV", "SELLER_STATE_CODE", "GST_ENABLED",
         "COUNTRY_ALLOW", "COUNTRY_BLOCK", "COUNTRY_FAIL", "DEVICE_MAX_ACCOUNTS", "DISPOSABLE_DOMAINS_EXTRA", "BLOCK_DISPOSABLE_EMAIL", "PHONE_VERIFY", "PHONE_EXEMPT_PAID",
         "SMS_PROVIDER", "BACKUP_DAILY", "BACKUP_DIR", "BACKUP_KEEP", "BACKUP_PASSPHRASE", "BACKUP_S3_ENDPOINT", "BACKUP_S3_BUCKET", "BACKUP_S3_ACCESS_KEY", "BACKUP_S3_SECRET_KEY", "ALERT_WEBHOOK_URL", "AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "GOOGLE_TTS_API_KEY", "OPENAI_TTS_API_KEY", "ELEVENLABS_API_KEY", "TTS_ORDER", "MSG91_AUTH_KEY", "MSG91_TEMPLATE_ID", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"]


def topic_draft(topic: str, weak: bool = False) -> dict:
    def slide(i):
        s = {"title": f"{topic}: part {i + 1}",
             "bullets": ["x", "y"] if weak else [f"Key idea {i + 1} about {topic} in plain words", f"A short worked example for {topic} step {i + 1}", f"Common slip when learning {topic}"],
             "narration": f"Here is what a teacher would say about {topic}, part {i + 1}, in a friendly way."}
        if i == 2:
            s["formula"] = "y = m x + c"
        return s

    def q(i):
        return {"q": f"Question {i + 1} about {topic}?", "options": [f"{o} for {i}" for o in ("Option one", "Option two", "Option three", "Option four")],
                "answer": i % 4, "why": f"Because {topic} works that way, which is explained by the definition above."}

    return {"summary": f"{topic} explained simply: what it is, why it matters and how to use it in practice.",
            "objectives": [f"Explain {topic}", f"Work an example of {topic}", f"Avoid common mistakes with {topic}"],
            "notes": "filler text without any substance " * 12 if weak else
            f"## {topic}\n\n{(topic + ' is an important idea in this course. ') * 8}\n\n### Worked example\n\nTake a small case and apply {topic} step by step.\n\n### Common mistakes\n\n- Rushing past the definition of {topic}\n- Mixing up similar terms",
            "slides": [slide(i) for i in range(4 if weak else 6)], "questions": [q(i) for i in range(3)], "imagePrompt": f"A simple diagram showing {topic}",
            "scratch": [{"heading": f"Step {i + 1}: the idea behind {topic}", "body": (f"Start from the very first idea of {topic}. " * 4) + "Then add one small example."} for i in range(4)],
            "glossary": [{"term": f"Term {i + 1}", "meaning": f"What term {i + 1} means in {topic}, in plain words."} for i in range(4)],
            "mistakes": [f"Thinking {topic} always works the same way; it depends on the case."],
            "diagrams": [{"kind": "flow", "title": f"How {topic} fits together", "steps": [{"label": "Start"}, {"label": "Apply the rule"}, {"label": "Check the result"}]}]}


@dataclass
class World:
    calls: list = field(default_factory=list)
    fail: set = field(default_factory=set)
    weak_azure: bool = False
    paid: bool = True
    intel: dict = field(default_factory=dict)
    mails: list = field(default_factory=list)
    limited: dict = field(default_factory=dict)


def _ok(b) -> Resp:
    return Resp(200, json.dumps(b).encode(), {"content-type": "application/json"})


def setup(**over) -> World:
    env = {"NODE_ENV": "test", "APP_URL": APP, "SESSION_SECRET": "x" * 40, "CRON_SECRET": "c" * 40, "AZURE_OPENAI_ENDPOINT": "https://az.test",
           "AZURE_OPENAI_API_KEY": "k", "AZURE_OPENAI_DEPLOYMENT": "gpt-4o-mini", "CF_ACCOUNT_ID": "acc", "CF_API_TOKEN": "tok",
           "RAZORPAY_KEY_ID": "rzp_test_1", "RAZORPAY_KEY_SECRET": "keysecret", "RAZORPAY_WEBHOOK_SECRET": "whsecret",
           "N8N_WEBHOOK_URL": "https://n8n.test/hook", "N8N_SHARED_SECRET": "n8nsecret", "WHATSAPP_SUPPORT_NUMBER": "919876543210",
           "PRICE_LEARNER_MONTH_INR": "299", "PRICE_LEARNER_YEAR_INR": "2999", "LLM_ORDER": "azure,cloudflare,compat",
           "REQUIRE_SIGNUP_PROFILE": "0", "REQUIRE_USERNAME": "0", "WHATSAPP_PUBLIC_LINK": "1", "FREE_CHAT_PER_MONTH": "0", "FREE_NOTES_PER_MONTH": "0", "POLLINATIONS_ENABLED": "0", "WLXC_QUIET_MAIL": "1", "WORKER_MODE": "external", **over}
    for k in CLEAR:
        if k not in over:
            os.environ.pop(k, None)
    os.environ.update(env)
    os.environ["REQUIRE_CONSENT"] = over.get("REQUIRE_CONSENT", "0")
    set_store(SqliteStore(":memory:"))
    bg.SYNC = True
    llm.breaker.reset()
    llm.key_pool.reset()
    llm.tuning["backoff_ms"] = 0
    w = World()

    def transport(method, url, headers, body, timeout):
        text = body.decode() if isinstance(body, (bytes, bytearray)) else (body or "")
        hdrs = {k.lower(): v for k, v in (headers or {}).items()}
        w.calls.append({"url": url, "method": method, "body": text, "headers": hdrs})
        host = urlparse(url).netloc
        if host in w.fail:
            return Resp(500, b"boom")
        bearer = hdrs.get("authorization", "").replace("Bearer ", "")
        left = w.limited.get(bearer)
        if left:
            w.limited[bearer] = left - 1
            return Resp(429, b"slow down")
        if host in ("api.ipapi.is", "ipqualityscore.com", "proxycheck.io"):
            return _ok(w.intel)
        if host in ("api.resend.com", "api.brevo.com", "api.mailgun.net"):
            w.mails.append({"host": host, "body": text, "headers": hdrs})
            return _ok({"id": "mail_1"})
        if "/images/generations" in url:
            return _ok({"data": [{"b64_json": base64.b64encode(PNG).decode()}]})
        if host == "az.test" and "/embeddings" in url:
            inp = str(json.loads(text)["input"]).lower()
            concepts = [("photosynth", "plants make food"), ("newton", "gravity", "laws of motion"), ("mitosis", "cell division")]
            v = [1 if any(w_ in inp for w_ in c) else 0 for c in concepts]
            return _ok({"data": [{"embedding": [*v, 0.05]}]})
        chat = ("api.groq.com", "generativelanguage.googleapis.com", "api.mistral.ai", "openrouter.ai", "api.openai.com")
        is_chat = "/audio/" not in url and (host == "az.test" or host in chat or (host == "api.cloudflare.com" and "/ai/run/@cf/meta" in url))
        if is_chat:
            b = json.loads(text)
            sys_, usr = b["messages"][0]["content"], b["messages"][1]["content"]
            if "prerequisites between course topics" in sys_:
                ids = re.findall(r"^(\S+) \|", usr, re.M)
                content = {"edges": [{"from": ids[i], "to": x, "why": "builds on the earlier idea"} for i, x in enumerate(ids[1:])]
                           + [{"from": ids[-1], "to": ids[0], "why": "cycle that must be dropped"}]}
            elif "revision games" in sys_:
                content = {"rounds": [
                    {"type": "tf", "statement": "Force equals mass times acceleration.", "answer": True, "why": "That is the second law."},
                    {"type": "tf", "statement": "Heavier objects always fall much faster in a vacuum.", "answer": False, "why": "They fall together."},
                    {"type": "order", "prompt": "Order the steps.", "steps": ["Observe", "Hypothesise", "Test", "Conclude"]},
                    {"type": "match", "prompt": "Match.", "pairs": [{"left": "F", "right": "force"}, {"left": "m", "right": "mass"}, {"left": "a", "right": "acceleration"}]}]}
            elif "worked examples and practice" in sys_:
                content = {"worked": [{"q": "A 2 kg mass accelerates at 3 m/s2. Find F.", "steps": ["F = m a", "F = 2 x 3"], "answer": "6 N"}],
                           "practice": [{"q": "Find F for m = 4 kg, a = 5 m/s2.", "answer": 20, "unit": "N", "hint": "Use F = m a.", "solution": "F = 4 x 5 = 20 N."},
                                        {"q": "Name the law behind F = m a.", "answer": "second law", "hint": "It is the second one.", "solution": "Newton second law."},
                                        {"q": "Find a for F = 10 N, m = 4 kg.", "answer": 2.5, "unit": "m/s2", "hint": "a = F / m.", "solution": "a = 10 / 4 = 2.5."}]}
            elif "short practice round" in sys_:
                content = {"cards": [
                    {"type": "mcq", "prompt": "Which law links force, mass and acceleration?", "options": ["First", "Second", "Third"], "answer": 1, "why": "F = m a is the second law."},
                    {"type": "blank", "prompt": "Force equals mass times ____.", "options": ["speed", "acceleration", "time"], "answer": 1, "why": "F = m a."},
                    {"type": "tf", "prompt": "A larger force gives a larger acceleration for the same mass.", "answer": True, "why": "a = F / m."},
                    {"type": "mcq", "prompt": "The unit of force is the", "options": ["joule", "newton", "watt"], "answer": 1, "why": "Named after Newton."},
                    {"type": "blank", "prompt": "Doubling the mass halves the ____.", "options": ["force", "acceleration", "weight"], "answer": 1, "why": "a = F / m."}]}
            elif "visual learning canvas" in sys_:
                content = {"title": "Why habits compound", "summary": "Each repetition changes your ability and your surroundings. Small gains become the start of later gains.",
                           "points": [{"label": "Feedback", "text": "Fast feedback keeps the loop going."}, {"label": "Environment", "text": "Cues in the room trigger the next action."}],
                           "diagram": {"title": "The loop", "tiers": [[{"label": "Cue", "tone": "blue"}], [{"label": "Action", "tone": "green"}, {"label": "Reward", "tone": "amber"}]]},
                           "table": None, "followups": ["When does compounding stop?"], "imagePrompt": "a seed growing into a tree over four seasons"}
            elif "teaching assistant" in sys_:
                content = "It is covered on [slide 2]: force is mass times acceleration."
            elif "exam-oriented study notes" in sys_:
                content = "# Notes\n\n" + "Model answer text with plenty of detail about the unit. " * 20
            else:
                m = re.search(r"^Topic: (.+)$", usr, re.M)
                content = topic_draft(m.group(1) if m else "Topic", host == "az.test" and w.weak_azure)
            t = content if isinstance(content, str) else json.dumps(content)
            if host != "api.cloudflare.com":
                return _ok({"choices": [{"message": {"content": t}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 100, "completion_tokens": 400}})
            return _ok({"success": True, "result": {"response": t}})
        if host == "api.cloudflare.com" and "/ai/run/" in url:
            return _ok({"success": True, "result": {"image": base64.b64encode(PNG).decode()}})
        if host == "api-m.sandbox.paypal.com":
            if url.endswith("/oauth2/token"):
                return _ok({"access_token": "pp_tok", "expires_in": 3000})
            if url.endswith("/catalogs/products"):
                return _ok({"id": "PROD-1"})
            if url.endswith("/billing/plans"):
                return _ok({"id": "P-PLAN1"})
            if url.endswith("/billing/subscriptions"):
                return _ok({"id": "I-SUB1", "status": "APPROVAL_PENDING", "links": [{"rel": "approve", "href": "https://paypal.test/approve/I-SUB1"}]})
            if "/billing/subscriptions/" in url and url.endswith("/cancel"):
                return _ok({})
            if url.endswith("/checkout/orders"):
                return _ok({"id": "PPORD-1", "status": "PAYER_ACTION_REQUIRED", "links": [{"rel": "payer-action", "href": "https://paypal.test/pay/PPORD-1"}]})
            if url.endswith("/capture"):
                first = next((c for c in w.calls if c["url"].endswith("/checkout/orders")), None)
                unit = json.loads(first["body"])["purchase_units"][0]
                return _ok({"id": "PPORD-1", "status": "COMPLETED", "purchase_units": [{"payments": {"captures": [{"id": "CAP-1", "status": "COMPLETED", "amount": unit["amount"]}]}}]})
            if url.endswith("/verify-webhook-signature"):
                return _ok({"verification_status": "SUCCESS"})
        if host == "api.razorpay.com" and url.endswith("/plans"):
            return _ok({"id": "plan_1", "entity": "plan"})
        if host == "api.razorpay.com" and url.endswith("/subscriptions"):
            return _ok({"id": "sub_1", "status": "created", "short_url": "https://rzp.io/i/sub1"})
        if host == "api.razorpay.com" and "/subscriptions/" in url and url.endswith("/cancel"):
            return _ok({"id": "sub_1", "status": "cancelled"})
        if host == "api.razorpay.com" and url.endswith("/payment_links"):
            b = json.loads(text)
            return _ok({"id": "plink_1", "short_url": "https://rzp.io/i/abc", "status": "created", "amount": b["amount"], "amount_paid": 0,
                        "currency": "INR", "reference_id": b["reference_id"]})
        if host == "api.razorpay.com" and "/payment_links/plink_1" in url:
            first = next((c for c in w.calls if c["url"].endswith("/payment_links")), None)
            link = json.loads(first["body"]) if first else {}
            return _ok({"id": "plink_1", "short_url": "x", "status": "paid" if w.paid else "created", "amount": link.get("amount"),
                        "amount_paid": link.get("amount") if w.paid else 0, "currency": "INR", "reference_id": link.get("reference_id")})
        if host.endswith(".tts.speech.microsoft.com") or host in ("texttospeech.googleapis.com", "api.elevenlabs.io") or url == "https://api.openai.com/v1/audio/speech":
            if host == "texttospeech.googleapis.com":
                return _ok({"audioContent": base64.b64encode(b"ID3" + b"x" * 400).decode()})
            return Resp(200, b"ID3" + b"x" * 400, {"content-type": "audio/mpeg"})
        if host == "hooks.example":
            return _ok({})
        if host == "n8n.test":
            return _ok({"ok": True})
        if host == "graph.facebook.com":
            return _ok({"messages": [{"id": "wamid"}]})
        return Resp(599, f"unexpected host {host}".encode())

    net.set_transport(transport)
    return w


class Res:
    def __init__(self, out: Out):
        self.status, self.body, self.headers = out.status, out.body, {k.lower(): v for k, v in out.headers.items()}

    def json(self):
        return json.loads(self.body.decode())

    @property
    def text(self):
        return self.body.decode()


def _match(method: str, path: str):
    p = urlparse(path).path
    for m, pattern, handler in api.ROUTES:
        if m != method:
            continue
        rx = "^" + re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", pattern) + "$"
        mm = re.match(rx, p)
        if mm:
            return handler, mm.groupdict()
    raise AssertionError(f"no route for {method} {p}")


def call(method: str, path: str, body=None, cookie: str | None = None, headers: dict | None = None, origin: str | None = APP, raw: bytes | str | None = None,
         files: dict | None = None, form: dict | None = None) -> Res:
    h = {k.lower(): v for k, v in (headers or {}).items()}
    if origin is not None:
        h["origin"] = origin
    if cookie:
        h["cookie"] = cookie
    data = b""
    if raw is not None:
        data = raw.encode() if isinstance(raw, str) else raw
    elif body is not None:
        data = json.dumps(body).encode()
    if data and "content-type" not in h:
        h["content-type"] = "application/json"
    if files is not None:
        h["content-type"] = "multipart/form-data; boundary=x"
    handler, params = _match(method, path)
    return Res(handler(Req(method, APP + path, h, data, params, form or {}, files or {})))


def get(path, **kw): return call("GET", path, **kw)
def post(path, body=None, **kw): return call("POST", path, body, **kw)
def put(path, body=None, **kw): return call("PUT", path, body, **kw)
def patch(path, body=None, **kw): return call("PATCH", path, body, **kw)
def delete(path, body=None, **kw): return call("DELETE", path, body, **kw)


def cookie_of(r: Res) -> str:
    return r.headers.get("set-cookie", "").split(";")[0]


def hmac_hex(secret: str, body: str) -> str:
    return _hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


class Base(unittest.TestCase):
    def setUp(self):
        self.w = setup()

    def sign_up(self, email="asha@example.com", name="Asha", **extra):
        r = post("/api/auth/register", {"name": name, "email": email, "password": "S3cure-pass!", **extra})
        return cookie_of(r), r

    def user_doc(self, email):
        from wlxc.store import get_store
        st = get_store()
        return st.get("users", st.get("emails", email)["uid"])

    def upgrade(self, email, plan="learner"):
        import time
        from wlxc.store import get_store
        u = self.user_doc(email)
        get_store().update("users", u["id"], lambda c: {**c, "plan": plan, "planUntil": time.time() * 1000 + 1e9} if c else c)


STATS = ("# Introductory Statistics\n\n## Unit 1: Describing data\n- Types of variables (p. 2)\n- Mean, median and mode (p. 4)\n- Spread: range, variance and standard deviation (p. 6)\n"
         "- Reading histograms and box plots (p. 9)\n\n## Unit 2: Probability\n- Sample spaces and events (p. 12)\n- Conditional probability (p. 15)\n- Independence (p. 17)\n"
         "- Bayes’ rule (p. 19)\n\n## Unit 3: Inference\n- Sampling distributions (p. 23)\n- Confidence intervals (p. 26)\n- Hypothesis tests and p-values (p. 29)\n"
         "- Why correlation is not causation (p. 33)")
AUTH_CRON = {"authorization": "Bearer " + "c" * 40}
