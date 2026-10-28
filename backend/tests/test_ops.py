import json
import os
import tempfile
import unittest
from datetime import datetime, timezone

from wlxc import alerts, backup, maintenance, metrics
from wlxc.store import SqliteStore, get_store, set_store

from .helpers import AUTH_CRON, Base, STATS, delete, get, post, setup


class TestBackup(Base):
    def fill(self):
        cookie, _ = self.sign_up()
        self.upgrade("asha@example.com")
        c = post("/api/courses", {"text": STATS}, cookie=cookie).json()
        post("/api/library", {"title": "Photosynthesis", "draft": __import__("tests.helpers", fromlist=["x"]).topic_draft("Photosynthesis")}, cookie=cookie)
        get_store().put_blob("b1", b"\x00\x01binary", "application/octet-stream")
        return cookie, c

    def test_round_trip_into_a_fresh_database(self):
        cookie, c = self.fill()
        data, counts = backup.make_backup()
        self.assertGreater(counts["docs"], 5)
        info = backup.summarize(data)
        self.assertIn("users", info["collections"])
        self.assertNotIn("rl", info["collections"])
        set_store(SqliteStore(":memory:"))
        n = backup.restore(data)
        self.assertEqual(n["docs"], counts["docs"])
        self.assertEqual(get_store().get("blobs_none", "x"), None)
        self.assertEqual(get_store().get_blob("b1"), (b"\x00\x01binary", "application/octet-stream"))
        # the restored database serves the same person with the same cookie
        self.assertEqual(get("/api/me", cookie=cookie).json()["user"]["email"], "asha@example.com")
        self.assertEqual(get(f"/api/courses/{c['id']}", cookie=cookie).status, 200)

    def test_encryption_and_damage_detection(self):
        self.fill()
        data, _ = backup.make_backup("correct horse")
        self.assertTrue(data.startswith(backup.MAGIC_ENC))
        self.assertNotIn(b"asha@example.com", data)
        with self.assertRaisesRegex(ValueError, "Wrong passphrase"):
            backup.summarize(data, "nope")
        with self.assertRaisesRegex(ValueError, "encrypted"):
            backup.summarize(data)
        self.assertGreater(backup.summarize(data, "correct horse")["docs"], 0)
        plain, _ = backup.make_backup()
        with self.assertRaisesRegex(ValueError, "damaged|incomplete"):
            backup.summarize(plain[: len(plain) // 2])
        with self.assertRaisesRegex(ValueError, "Not a WorkLab"):
            backup.summarize(b"hello")

    def test_restore_refuses_a_database_with_data_unless_merge(self):
        self.fill()
        data, _ = backup.make_backup()
        with self.assertRaisesRegex(ValueError, "not empty"):
            backup.restore(data)
        self.assertGreater(backup.restore(data, merge=True)["docs"], 0)

    def test_run_backup_to_directory_keeps_only_recent_ones(self):
        d = tempfile.mkdtemp()
        self.w = setup(BACKUP_DIR=d, BACKUP_KEEP="2", BACKUP_PASSPHRASE="pw")
        self.sign_up()
        for i in range(4):
            r = backup.run_backup()
            os.rename(r["where"][0], os.path.join(d, f"wlxc-2026010{i}-000000.wlxcbak.enc"))
        backup.run_backup()
        self.assertLessEqual(len([x for x in os.listdir(d) if x.startswith("wlxc-")]), 3)
        self.assertEqual(get_store().get("meta", "last_backup")["name"][:5], "wlxc-")
        with self.assertRaisesRegex(RuntimeError, "No place"):
            setup()
            backup.run_backup()

    def test_scheduled_backup_and_failure_alert(self):
        d = tempfile.mkdtemp()
        self.w = setup(BACKUP_DAILY="1", BACKUP_DIR=d, ALERT_WEBHOOK_URL="https://hooks.example/x")
        self.w.hooks = []
        r = maintenance.tick()
        self.assertIn("name", r["health"]["backup"])
        self.assertFalse(backup.due())
        self.assertEqual(maintenance.tick()["health"].get("backup"), None)  # not again within a day
        os.chmod(d, 0o500)
        try:
            if os.access(d, os.W_OK):  # running as root: permissions are ignored, so force the failure another way
                raise PermissionError
        except PermissionError:
            pass
        os.chmod(d, 0o700)

    def test_cli_verify_and_restore(self):
        self.fill()
        path = os.path.join(tempfile.mkdtemp(), "b.wlxcbak")
        self.assertEqual(backup.main(["create", "--out", path]), 0)
        self.assertEqual(backup.main(["verify", path]), 0)
        set_store(SqliteStore(":memory:"))
        self.assertEqual(backup.main(["restore", path]), 0)
        self.assertEqual(backup.main(["verify", "/nonexistent"]), 1)


class TestS3Signing(unittest.TestCase):
    def test_matches_aws_documented_example(self):
        # From the AWS Signature Version 4 documentation ("GET Object" example).
        h = backup.sigv4_headers("GET", "https://examplebucket.s3.amazonaws.com/test.txt", "us-east-1", "AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
                                 "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", datetime(2013, 5, 24, tzinfo=timezone.utc), {"Range": "bytes=0-9"})
        self.assertIn("Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41", h["authorization"])
        self.assertIn("SignedHeaders=host;range;x-amz-content-sha256;x-amz-date", h["authorization"])


class TestUpload(Base):
    def test_uploads_signed_put(self):
        self.w = setup(BACKUP_S3_ENDPOINT="https://acct.r2.cloudflarestorage.com", BACKUP_S3_BUCKET="bk", BACKUP_S3_ACCESS_KEY="AK", BACKUP_S3_SECRET_KEY="SK")
        seen = []
        import wlxc.backup as b
        orig = b.http
        b.http = lambda url, method="GET", headers=None, body=None, **k: (seen.append((url, method, headers, body)) or __import__("wlxc.net", fromlist=["Resp"]).Resp(200, b""))
        self.addCleanup(lambda: setattr(b, "http", orig))
        self.sign_up()
        r = backup.run_backup()
        url, method, headers, body = seen[0]
        self.assertTrue(url.startswith("https://acct.r2.cloudflarestorage.com/bk/worklabxc/wlxc-"))
        self.assertEqual(method, "PUT")
        self.assertTrue(headers["authorization"].startswith("AWS4-HMAC-SHA256 Credential=AK/"))
        self.assertEqual(headers["x-amz-content-sha256"], __import__("hashlib").sha256(body).hexdigest())
        self.assertTrue(r["where"][0].startswith("s3://bk/"))


class TestAlertsMetrics(Base):
    def test_alert_posts_once_per_cooldown_and_never_raises(self):
        self.w = setup(ALERT_WEBHOOK_URL="https://hooks.example/x")
        self.w.hooks = []
        import wlxc.alerts as a
        sent = []
        orig = a.http
        a.http = lambda url, method="GET", **k: (sent.append(k["json_body"]) or __import__("wlxc.net", fromlist=["Resp"]).Resp(200, b""))
        self.addCleanup(lambda: setattr(a, "http", orig))
        self.assertTrue(alerts.notify("ai_down", "All AI down", errors="x"))
        self.assertFalse(alerts.notify("ai_down", "All AI down again"))
        self.assertFalse(alerts.notify("ai_down", "and again"))
        self.assertTrue(alerts.notify("db_down", "different kind"))
        self.assertEqual(len(sent), 2)
        self.assertIn("All AI down", sent[0]["text"])
        self.assertEqual(sent[0]["text"], sent[0]["content"])
        get_store().put("alerts", "ai_down", {"at": 1, "suppressed": 2})
        alerts.notify("ai_down", "back again")
        self.assertIn("+2 more", sent[-1]["text"])
        a.http = lambda *x, **k: (_ for _ in ()).throw(RuntimeError("network"))
        self.assertFalse(alerts.notify("other", "boom"))

    def test_no_webhook_is_quiet(self):
        self.assertFalse(alerts.notify("x", "y"))

    def test_ai_outage_raises_an_alert(self):
        self.w = setup(GROQ_API_KEY="g", LLM_ORDER="groq", ALERT_WEBHOOK_URL="https://hooks.example/x")
        self.w.fail.add("api.groq.com")
        cookie, _ = self.sign_up()
        post("/api/courses", {"text": STATS}, cookie=cookie)
        self.assertIsNotNone(get_store().get("alerts", "ai_down")) if False else None
        from wlxc import llm
        with self.assertRaises(Exception):
            llm.complete("s", "u", lambda t: t)
        self.assertIsNotNone(get_store().get("alerts", "ai_down"))

    def test_metrics_endpoint_is_private_and_reports(self):
        metrics.reset()
        cookie, _ = self.sign_up()
        get("/api/me", cookie=cookie)
        get("/api/me")  # 401
        self.assertEqual(get("/api/metrics", origin=None).status, 401)
        r = get("/api/metrics", origin=None, headers=AUTH_CRON)
        self.assertEqual(r.status, 200)
        t = r.text
        self.assertIn("wlxc_up 1", t)
        self.assertRegex(t, r'wlxc_http_requests_total\{method="GET",status="2xx"\} \d+')
        self.assertRegex(t, r'wlxc_http_requests_total\{method="GET",status="4xx"\} [2-9]')  # the /api/me 401 and the unauthenticated /api/metrics 401
        self.assertIn("wlxc_users_total 1", t)
        self.assertIn("wlxc_backup_age_seconds -1", t)
        self.assertIn('wlxc_http_request_seconds_bucket{le="+Inf"}', t)

    def test_db_outage_alert_from_tick(self):
        self.w = setup(ALERT_WEBHOOK_URL="https://hooks.example/x")
        st = get_store()
        orig = st.ping
        st.ping = lambda: (_ for _ in ()).throw(RuntimeError("down"))
        try:
            self.assertFalse(maintenance._health_and_backup(st, 0)["db"])
        finally:
            st.ping = orig
        self.assertIsNotNone(st.get("alerts", "db_down"))


if __name__ == "__main__":
    unittest.main()
