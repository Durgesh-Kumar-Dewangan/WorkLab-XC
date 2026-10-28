#!/usr/bin/env python3
"""A small load test for a running WorkLab XC API. Standard library only.

    python scripts/loadtest.py http://127.0.0.1:8000 --users 20 --seconds 20

Each simulated user signs up once, then loops over a realistic read-heavy mix: /api/me, course list, library list, plans,
and now and then a syllabus upload. It prints requests per second, latency percentiles and the error rate, and exits 1 if
more than 1% of requests failed or the 95th percentile is over --p95-ms (default 1500).

Run it against staging, never against production with real users on it. Sign-ups are throw-away accounts
(loadtest+<random>@example.com); with VPN/phone/device limits switched on you will hit them, so set DEVICE_MAX_ACCOUNTS=0,
PHONE_VERIFY=off and IPINTEL_PROVIDER=none on the staging copy first, and raise SIGNUPS_PER_IP_DAY. It reports
those refusals separately instead of counting them as failures."""
from __future__ import annotations

import argparse
import http.cookiejar
import json
import random
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid

SYLLABUS = "# Load test\n\n## Unit 1: Basics\n- Alpha idea\n- Beta idea\n- Gamma idea\n"


class User(threading.Thread):
    def __init__(self, base, stop_at, results, lock):
        super().__init__(daemon=True)
        self.base, self.stop_at, self.results, self.lock = base, stop_at, results, lock
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def call(self, name, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        h = {"origin": self.base, "user-agent": "wlxc-loadtest/1"}
        if data:
            h["content-type"] = "application/json"
        t0 = time.perf_counter()
        status = 0
        try:
            with self.op.open(urllib.request.Request(self.base + path, data=data, method=method, headers=h), timeout=60) as r:
                r.read()
                status = r.status
        except urllib.error.HTTPError as e:
            e.read()
            status = e.code
        except Exception:  # noqa: BLE001
            status = 0
        dt = (time.perf_counter() - t0) * 1000
        with self.lock:
            self.results.setdefault(name, []).append((status, dt))
        return status

    def run(self):
        email = f"loadtest+{uuid.uuid4().hex[:12]}@example.com"
        s = self.call("signup", "POST", "/api/auth/register", {"name": "Load Test", "email": email, "password": "Load-test-pass-9!", "consent": True})
        if s != 201:
            return
        while time.time() < self.stop_at:
            r = random.random()
            if r < 0.40:
                self.call("me", "GET", "/api/me")
            elif r < 0.60:
                self.call("courses", "GET", "/api/courses")
            elif r < 0.75:
                self.call("library", "GET", "/api/library")
            elif r < 0.90:
                self.call("plans", "GET", "/api/plans")
            else:
                self.call("upload", "POST", "/api/courses", {"text": SYLLABUS})
            time.sleep(random.uniform(0.02, 0.15))
        self.call("logout", "POST", "/api/auth/logout", {})


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(len(xs) * p))] if xs else 0.0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("base")
    ap.add_argument("--users", type=int, default=20)
    ap.add_argument("--seconds", type=int, default=20)
    ap.add_argument("--p95-ms", type=float, default=1500)
    a = ap.parse_args()
    base = a.base.rstrip("/")
    results: dict = {}
    lock = threading.Lock()
    stop_at = time.time() + a.seconds
    t0 = time.time()
    users = [User(base, stop_at, results, lock) for _ in range(a.users)]
    for u in users:
        u.start()
    for u in users:
        u.join(a.seconds + 90)
    wall = time.time() - t0
    allr = [x for v in results.values() for x in v]
    refused = [x for x in results.get("signup", []) if x[0] in (403, 429)]
    counted = [x for x in allr if x not in refused]
    bad = [x for x in counted if x[0] == 0 or x[0] >= 500 or (x[0] >= 400 and x[0] not in (402, 429))]
    print(f"{a.users} users for {a.seconds}s against {base}\n")
    print(f"{'endpoint':10} {'count':>7} {'p50 ms':>8} {'p95 ms':>8} {'p99 ms':>8} {'errors':>7}")
    for name, v in sorted(results.items()):
        ms = [d for s, d in v]
        e = len([1 for s, d in v if s == 0 or s >= 500 or (s >= 400 and s not in (402, 429) and (s, d) not in refused)])
        print(f"{name:10} {len(v):>7} {pct(ms, .5):>8.0f} {pct(ms, .95):>8.0f} {pct(ms, .99):>8.0f} {e:>7}")
    ms = [d for s, d in counted]
    rps = len(counted) / wall if wall else 0
    err = len(bad) / len(counted) if counted else 1
    print(f"\ntotal {len(counted)} requests, {rps:.0f}/s, p95 {pct(ms, .95):.0f} ms, errors {err * 100:.2f}%")
    if refused:
        print(f"{len(refused)} sign-ups were refused (403/429): your abuse limits are on. Relax them on staging to test more users.")
    ok = bool(counted) and err <= 0.01 and pct(ms, .95) <= a.p95_ms
    print("RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
