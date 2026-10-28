"""Operational numbers in Prometheus text format at GET /api/metrics (needs the CRON_SECRET as a Bearer token), so Grafana Cloud,
UptimeRobot, Better Stack and similar can scrape them. Request counters live in the process (each API copy reports its own);
the business gauges come from the database."""
from __future__ import annotations

import threading
import time

from .store import get_store

_lock = threading.Lock()
_started = time.time()
_req: dict[tuple[str, str], int] = {}
_dur_sum = 0.0
_dur_n = 0
_slow = 0
_BUCKETS = (0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10)
_hist = [0] * (len(_BUCKETS) + 1)


def observe(method: str, status: int, seconds: float, slow_ms: float = 8000) -> None:
    global _dur_sum, _dur_n, _slow
    cls = f"{status // 100}xx"
    with _lock:
        _req[(method, cls)] = _req.get((method, cls), 0) + 1
        _dur_sum += seconds
        _dur_n += 1
        if seconds * 1000 > slow_ms:
            _slow += 1
        for i, b in enumerate(_BUCKETS):
            if seconds <= b:
                _hist[i] += 1
                break
        else:
            _hist[-1] += 1


def reset() -> None:
    global _dur_sum, _dur_n, _slow, _hist
    with _lock:
        _req.clear()
        _dur_sum, _dur_n, _slow = 0.0, 0, 0
        _hist = [0] * (len(_BUCKETS) + 1)


def render() -> str:
    st = get_store()
    now = time.time() * 1000
    L: list[str] = []

    def g(name: str, help_: str, value, typ="gauge", labels: str = ""):
        L.append(f"# HELP {name} {help_}\n# TYPE {name} {typ}\n{name}{labels} {value}")

    g("wlxc_up", "1 when the process can reach its database", 1 if _safe(st.ping) else 0)
    g("wlxc_uptime_seconds", "Seconds since this process started", round(time.time() - _started))
    with _lock:
        L.append("# HELP wlxc_http_requests_total Requests handled by this process\n# TYPE wlxc_http_requests_total counter")
        for (m, c), n in sorted(_req.items()):
            L.append(f'wlxc_http_requests_total{{method="{m}",status="{c}"}} {n}')
        L.append("# HELP wlxc_http_request_seconds Request duration\n# TYPE wlxc_http_request_seconds histogram")
        run = 0
        for i, b in enumerate(_BUCKETS):
            run += _hist[i]
            L.append(f'wlxc_http_request_seconds_bucket{{le="{b}"}} {run}')
        L.append(f'wlxc_http_request_seconds_bucket{{le="+Inf"}} {_dur_n}')
        L.append(f"wlxc_http_request_seconds_sum {round(_dur_sum, 4)}\nwlxc_http_request_seconds_count {_dur_n}")
        g("wlxc_slow_requests_total", "Requests slower than ALERT_SLOW_MS", _slow, "counter")
    g("wlxc_users_total", "Registered accounts", _safe(lambda: st.count("users")))
    g("wlxc_users_paid", "Accounts on a paid plan that has not expired", _safe(lambda: st.count("users", since=("planUntil", now))))
    g("wlxc_users_new_24h", "Accounts created in the last 24 hours", _safe(lambda: st.count("users", since=("created", now - 86_400_000))))
    g("wlxc_jobs_active", "Generation runs queued or running", _safe(lambda: st.count("jobs", where={"status": "queued"}) + st.count("jobs", where={"status": "running"})))
    g("wlxc_jobs_failed_24h", "Generation runs that failed in the last 24 hours", _safe(lambda: st.count("jobs", where={"status": "failed"}, since=("created", now - 86_400_000))))
    g("wlxc_mail_pending", "Emails waiting to be retried", _safe(lambda: st.count("mail_outbox")))
    g("wlxc_integration_events_pending", "Webhook/automation events waiting to be retried", _safe(lambda: st.count("outbox")))
    g("wlxc_open_tickets", "Open support tickets", _safe(lambda: st.count("tickets", where={"status": "open"})))
    g("wlxc_open_reports", "Unreviewed content reports", _safe(lambda: st.count("reports", where={"status": "open"})))
    last = _safe(lambda: st.get("meta", "last_backup"), None)
    g("wlxc_backup_age_seconds", "Seconds since the last backup (-1 = never)", round((now - last["at"]) / 1000) if last else -1)
    return "\n".join(L) + "\n"


def _safe(fn, default=0):
    try:
        return fn()
    except Exception:  # noqa: BLE001
        return default
