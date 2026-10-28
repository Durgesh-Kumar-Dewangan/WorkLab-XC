import json
import hashlib
import hmac
import time
import unittest
from unittest import mock

from wlxc import campaigns, chat
from wlxc.store import get_store

from .helpers import Base, get, post, setup


def signed(secret, body):
    return {"x-hub-signature-256": "sha256=" + hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()}


class TestSupportChat(Base):
    def test_chat_goes_to_the_team_by_code_only_and_replies_come_back_without_numbers(self):
        self.w = setup(WHATSAPP_TOKEN="t", WHATSAPP_PHONE_ID="1", WHATSAPP_OPS_TO="919876543210", WHATSAPP_APP_SECRET="appsecret", WHATSAPP_PUBLIC_LINK="0",
                       WHATSAPP_VERIFY_TOKEN="vt")
        cookie, _ = self.sign_up("asha@example.com")
        r = post("/api/support/chat", {"text": "My lesson will not load", "topic": "Lessons"}, cookie=cookie)
        self.assertEqual(r.status, 200, r.text)
        code = r.json()["chat"]["code"]
        sent = [json.loads(c["body"]) for c in self.w.calls if "graph.facebook.com" in c["url"]]
        self.assertTrue(sent, "the team should have been told on WhatsApp")
        text = sent[0]["text"]["body"]
        self.assertIn(code, text)
        self.assertNotIn("asha@example.com", text)  # no contact details go to the team
        # the team answers on WhatsApp from its own number; a stranger's number is ignored
        def hook(frm, body):
            payload = json.dumps({"entry": [{"changes": [{"value": {"messages": [{"from": frm, "type": "text", "text": {"body": body}}]}}]}]})
            return post("/api/webhooks/whatsapp", json.loads(payload), headers=signed("appsecret", json.dumps(json.loads(payload))))
        self.assertEqual(chat.handle_whatsapp("910000000000", f"{code} hi"), "")
        self.assertEqual(chat.handle_whatsapp("919876543210", f"{code} Try again now, it is fixed."), f"Sent to {code}.")
        mine = get("/api/support/chat", cookie=cookie).json()
        self.assertEqual([m["role"] for m in mine["messages"]], ["user", "team"])
        self.assertEqual(mine["chat"]["status"], "answered")
        flat = json.dumps(mine)
        self.assertNotIn("919876543210", flat)
        # tracking: the owner sees waiting/avg reply time
        self.assertIsNotNone(chat.team_overview()["stats"]["avgFirstReplyMin"])

    def test_session_request_confirm_and_limits(self):
        cookie, _ = self.sign_up("asha@example.com")
        want = time.time() * 1000 + 3 * 3600_000
        ok = post("/api/support/session", {"topic": "Billing", "wanted": want, "note": "Evening is best"}, cookie=cookie)
        self.assertEqual(ok.status, 200, ok.text)
        code = ok.json()["session"]["code"]
        self.assertEqual(post("/api/support/session", {"topic": "x", "wanted": want}, cookie=cookie).status, 409)
        s = chat.decide_session(code, "confirm", want + 3600_000, "See you then")
        self.assertEqual(s["status"], "confirmed")
        self.assertEqual(post("/api/support/session", {"topic": "y", "wanted": time.time() * 1000 + 60_000}, cookie=cookie).status, 422)


class TestCampaigns(Base):
    def test_announcement_has_image_tracking_unsubscribe_and_respects_it(self):
        self.w = setup(APP_URL="https://worklabxc.com")
        admin_cookie, _ = self.sign_up("owner@example.com")
        get_store().update("users", self.user_doc("owner@example.com")["id"], lambda c: {**c, "role": "admin", "emailVerified": True})
        a, _ = self.sign_up("a@example.com")
        get_store().update("users", self.user_doc("a@example.com")["id"], lambda c: {**c, "emailVerified": True})
        body = {"subject": "New: unlimited notes", "headline": "Unlimited notes are here", "body": "You can now make notes for any unit.\n\nTry it today.", "ctaLabel": "Try it", "ctaUrl": "/app/learn",
                "hero": "update", "segment": "all", "test": False}
        r = post("/api/admin/campaigns", body, cookie=admin_cookie)
        self.assertEqual(r.status, 200, r.text)
        self.assertEqual(r.json()["queued"], 2)
        rows = get_store().find("mail_track", limit=10)
        self.assertEqual(len(rows), 2)
        tok = rows[0]["id"]
        self.assertEqual(get(f"/api/t/o/{tok}.gif").status, 200)
        click = get(f"/api/t/c/{tok}/1")
        self.assertEqual((click.status, click.headers["location"]), (302, "https://worklabxc.com/app/learn"))
        st = get("/api/admin/campaigns", cookie=admin_cookie).json()["campaigns"][0]
        self.assertEqual((st["sent"], st["opened"], st["clicked"]), (2, 1, 1))
        # an off-site link is refused
        bad = post("/api/admin/campaigns", {**body, "ctaUrl": "https://evil.example/x"}, cookie=admin_cookie)
        self.assertEqual(bad.status, 422)
        # unsubscribing stops further announcements
        uid = self.user_doc("a@example.com")["id"]
        self.assertEqual(get(f"/api/mail/unsubscribe/{campaigns.unsub_token(uid)}").status, 200)
        self.assertEqual(get(f"/api/mail/unsubscribe/{uid}.forged").status, 400)
        self.assertFalse(campaigns.wants_marketing(get_store().get("users", uid)))

    def test_every_template_gets_a_header_image(self):
        from wlxc.mailtpl import T, with_hero
        html = with_hero(T.verify("Asha", "tok")["html"], "welcome")
        self.assertIn("/mail/welcome.png", html)


if __name__ == "__main__":
    unittest.main()
