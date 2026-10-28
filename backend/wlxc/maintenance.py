"""Housekeeping, safe to call every minute (a scheduler hitting /api/internal/cron, or the worker process): resumes stalled
generation runs, retries n8n and email deliveries, sends plan-expiry reminders and deletes expired short-lived records."""
from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor

from . import campaigns, chat, integrations as integ, jobs, mail as mailmod
from .config import env
from .mailtpl import T
from .store import get_store

DAY = 86_400_000


def _health_and_backup(st, now_ms: float) -> dict:
    """Pages you when the database stops answering, jobs pile up, or a scheduled backup fails or goes stale. Runs a daily backup if asked."""
    from . import alerts, backup

    out: dict = {"db": True}
    try:
        st.ping()
    except Exception as e:  # noqa: BLE001
        out["db"] = False
        alerts.notify("db_down", "The database did not answer.", err=str(e)[:200])
    try:
        stuck = st.count("jobs", where={"status": "running"}, until=("started", now_ms - 30 * 60_000))
        if stuck:
            alerts.notify("jobs_stuck", f"{stuck} generation run(s) have been running for over 30 minutes.")
        if mailmod_backlog(st) > 100:
            alerts.notify("mail_backlog", "More than 100 emails are waiting to be sent. Check the email provider.")
    except Exception:  # noqa: BLE001
        pass
    if env().backup.daily:
        try:
            if backup.due():
                out["backup"] = backup.run_backup()
        except Exception as e:  # noqa: BLE001
            out["backup"] = "failed"
            alerts.notify("backup_failed", "The scheduled backup failed.", err=str(e)[:300])
        last = st.get("meta", "last_backup")
        if last and now_ms - last["at"] > 36 * 3600_000:
            alerts.notify("backup_stale", "No successful backup for over 36 hours.")
    return out


def mailmod_backlog(st) -> int:
    return st.count("mail_outbox")


def tick() -> dict:
    st = get_store()
    t0 = time.time() * 1000
    ids = jobs.due_jobs(3)
    budget = max(30_000, int(env().job_budget_ms * 2 / max(1, len(ids))))
    results: dict = {}
    if ids:
        with ThreadPoolExecutor(max_workers=len(ids)) as ex:
            for i, r in zip(ids, ex.map(lambda i: jobs.run_job(i, budget), ids)):
                results[i] = r
    outbox = integ.flush_outbox()
    mail = mailmod.flush_mail()
    soon = st.find("users", since=("planUntil", t0), until=("planUntil", t0 + 3 * DAY), limit=200)
    reminded = 0
    for u in soon:
        if u.get("expiryNotified") == u.get("planUntil"):
            continue
        if (u.get("subscription") or {}).get("status") in ("authenticated", "active", "pending") and not (u.get("subscription") or {}).get("cancelAtPeriodEnd"):
            continue  # it renews by itself
        st.update("users", u["id"], lambda c: {**c, "expiryNotified": c.get("planUntil")} if c else c)
        mailmod.send_mail(u["email"], "expiring", T.expiring(u["name"], u["plan"], u["planUntil"]))
        integ.emit("plan.expiring", {"email": u["email"], "name": u["name"], "plan": u["plan"], "planUntil": u["planUntil"]})
        reminded += 1
    life = campaigns.lifecycle(t0)
    life["sessionReminders"] = chat.remind_due(t0)
    health = _health_and_backup(st, t0)
    purged = (st.purge("rl", t0 - DAY) + st.purge("otp", t0 - DAY) + st.purge("alerts", t0 - 7 * DAY) + st.purge("webhook_events", t0 - 14 * DAY) + st.purge("auth", t0 - 45 * DAY)
              + st.purge("mail_track", t0 - 180 * DAY) + st.purge("mail_dedupe", t0 - DAY) + st.purge("tokens", t0 - 3 * DAY))
    return {"ok": True, "health": health, "jobs": results, "outbox": outbox, "mail": mail, "reminded": reminded, "lifecycle": life, "purged": purged, "ms": round(time.time() * 1000 - t0)}
