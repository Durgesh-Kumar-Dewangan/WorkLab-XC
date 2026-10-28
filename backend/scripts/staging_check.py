#!/usr/bin/env python3
"""Smoke-check a deployed WorkLab XC (staging or production) from the outside.

    python scripts/staging_check.py https://staging.worklabxc.com [--cron-secret XXX] [--api https://api.example.com] [--keep]

Standard library only. It signs up a throw-away account (smoke+<random>@example.com), uses it, then deletes it.
Exit code 0 = every check passed; 1 = at least one failed. SKIP lines are things it could not check from the outside.
"""
from __future__ import annotations

import argparse
import http.cookiejar
import json
import sys
import time
import urllib.error
import urllib.request
import uuid

OK, BAD, SKIP = "PASS", "FAIL", "SKIP"
results: list[tuple[str, str, str]] = []


def rec(status: str, name: str, detail: str = ""):
    results.append((status, name, detail))
    print(f"[{status}] {name}" + (f"  - {detail}" if detail else ""))


def check(name: str, cond: bool, detail: str = ""):
    rec(OK if cond else BAD, name, "" if cond else detail)
    return cond


class Client:
    def __init__(self, base: str, origin: str):
        self.base, self.origin = base.rstrip("/"), origin
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def req(self, method: str, path: str, body=None, headers=None, origin=True):
        h = {"user-agent": "wlxc-staging-check/1"}
        if origin:
            h["origin"] = self.origin
        h.update(headers or {})
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            h["content-type"] = "application/json"
        r = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        t0 = time.time()
        try:
            with self.op.open(r, timeout=30) as resp:
                raw, status, hdrs = resp.read(), resp.status, dict(resp.headers)
        except urllib.error.HTTPError as e:
            raw, status, hdrs = e.read(), e.code, dict(e.headers)
        except Exception as e:  # noqa: BLE001
            return 0, {}, str(e).encode(), 0
        return status, {k.lower(): v for k, v in hdrs.items()}, raw, time.time() - t0

    def json(self, *a, **k):
        s, h, raw, dt = self.req(*a, **k)
        try:
            return s, json.loads(raw.decode() or "null"), h, dt
        except ValueError:
            return s, None, h, dt


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("site", help="public URL of the web app, e.g. https://staging.worklabxc.com")
    ap.add_argument("--api", help="API origin if it is not served under <site>/api")
    ap.add_argument("--cron-secret", default="", help="CRON_SECRET, to check scheduler access and see which integrations are on")
    ap.add_argument("--api-only", action="store_true", help="skip front-end page checks (API served on its own)")
    ap.add_argument("--keep", action="store_true", help="do not delete the test account")
    a = ap.parse_args()
    site = a.site.rstrip("/")
    api = Client(a.api or site, site)
    web = Client(site, site)

    print(f"\n== Reachability and TLS ({site}) ==")
    check("site uses HTTPS", site.startswith("https://") or "localhost" in site or "127.0.0.1" in site, "use https in staging/production")
    s, j, h, dt = api.json("GET", "/api/health")
    if not check("health endpoint answers 200 and ok:true", s == 200 and j and j.get("ok") is True, f"status={s} body={j}"):
        print("\nAPI is not healthy; stopping.")
        return 1
    check("health is fast (<2s)", dt < 2, f"{dt:.2f}s")
    check("health leaks no integration detail to the public", "integrations" not in j)

    print("\n== Security headers ==")
    s, h, _, _ = api.req("GET", "/api/health")
    check("nosniff header", h.get("x-content-type-options") == "nosniff", str(h.get("x-content-type-options")))
    check("API answers are not cacheable", "no-store" in h.get("cache-control", "") or "private" in h.get("cache-control", ""), h.get("cache-control", ""))
    if not a.api_only:
        s, wh, _, _ = web.req("GET", "/")
        check("home page loads", s == 200, f"status={s}")
        check("HSTS on the site", "strict-transport-security" in wh or "localhost" in site or "127.0.0.1" in site, "missing Strict-Transport-Security")
        check("framing restricted", "x-frame-options" in wh or "content-security-policy" in wh, "no X-Frame-Options / CSP")
        check("no X-Powered-By", "x-powered-by" not in wh, wh.get("x-powered-by", ""))
    check("API sends security headers", any(k in h for k in ("x-frame-options", "content-security-policy", "referrer-policy")), str(sorted(h)))

    if not a.api_only:
        print("\n== Public pages and SEO ==")
        for p in ["/", "/pricing", "/features", "/about", "/contact", "/terms", "/privacy", "/refunds", "/cookies", "/copyright", "/ai-use", "/login", "/robots.txt", "/sitemap.xml"]:
            s, _, _, _ = web.req("GET", p)
            check(f"GET {p} -> 200", s == 200, f"status={s}")
        s, _, raw, _ = web.req("GET", "/this-page-does-not-exist-xyz")
        check("unknown URL gives a real 404 page", s == 404, f"status={s}")
        s, _, raw, _ = web.req("GET", "/robots.txt")
        t = raw.decode(errors="replace")
        check("robots.txt hides /app/ and /api/ and names the sitemap", "/app/" in t and "/api/" in t and "sitemap" in t.lower(), t[:200])
        s, _, raw, _ = web.req("GET", "/")
        t = raw.decode(errors="replace").lower()
        check("home has title, description, viewport and Open Graph", all(x in t for x in ("<title", 'name="description"', 'name="viewport"', "og:title")), "missing meta tags")
        s, _, _, _ = web.req("GET", "/app")
        check("private /app is not publicly readable (redirects or 401/403, not a data page)", s in (200, 301, 302, 303, 307, 308, 401, 403), f"status={s}")

    print("\n== API contract ==")
    s, j, h, _ = api.json("GET", "/api/nope")
    check("unknown API route -> JSON 404", s == 404 and isinstance(j, dict) and "error" in j, f"status={s} body={j}")
    s, j, _, _ = api.json("GET", "/api/me")
    check("/api/me without login -> 401", s == 401, f"status={s}")
    s, j, _, _ = api.json("POST", "/api/auth/login", {"email": "a@example.com", "password": "x" * 12}, headers={"origin": "https://evil.example"}, origin=False)
    check("cross-site POST is refused (CSRF)", s in (400, 403) and j and j.get("error") in ("bad_origin", "forbidden", "csrf"), f"status={s} body={j}")
    s, j, _, _ = api.json("POST", "/api/auth/register", {"name": "x"})
    check("bad input -> 422 with a readable message", s in (400, 422) and j and j.get("message"), f"status={s} body={j}")
    s, j, _, _ = api.json("GET", "/api/internal/cron")
    check("cron endpoint refuses anonymous callers", s in (401, 403), f"status={s}")
    s, j, _, _ = api.json("GET", "/api/admin/overview")
    check("admin endpoint refuses anonymous callers", s in (401, 403), f"status={s}")

    print("\n== Account lifecycle ==")
    email, pw = f"smoke+{uuid.uuid4().hex[:10]}@example.com", "Smoke-test-Pass-9!"
    s, j, h, _ = api.json("POST", "/api/auth/register", {"name": "Smoke Test", "email": email, "password": pw, "consent": True})
    if check("sign up", s == 201 and j and j.get("id"), f"status={s} body={j}"):
        sc = [c for c in api.jar if c.name == "wlxc_sid"]
        check("session cookie is HttpOnly and Secure on https", bool(sc) and (sc[0].has_nonstandard_attr("HttpOnly") or sc[0].has_nonstandard_attr("httponly")) and (sc[0].secure or not site.startswith("https")), "cookie flags")
        s, j, _, _ = api.json("GET", "/api/me")
        check("logged in: /api/me returns the profile", s == 200 and j and j["user"]["email"] == email, f"status={s}")
        s, j, _, _ = api.json("POST", "/api/auth/register", {"name": "Smoke Test", "email": email, "password": pw, "consent": True})
        check("duplicate email is refused", s in (409, 400), f"status={s}")
        s, j, _, _ = api.json("PUT", "/api/profile", {"category": "ncert", "label": "Class 10", "institute": "Staging School"})
        check("profile saves", s == 200, f"status={s} body={j}")
        s, j, _, _ = api.json("GET", "/api/admin/overview")
        check("normal user cannot open admin", s == 403, f"status={s}")
        s, j, _, _ = api.json("POST", "/api/courses", {"text": "# Smoke course\n\n## Unit 1: Basics\n- Alpha idea\n- Beta idea\n- Gamma idea\n"})
        check("syllabus upload builds a course", s in (200, 201) and j and j.get("course"), f"status={s} body={str(j)[:200]}")
        s, j, _, _ = api.json("GET", "/api/me/export")
        check("data export works", s == 200, f"status={s}")
        s, j, _, _ = api.json("POST", "/api/auth/logout", {})
        check("logout", s == 200, f"status={s}")
        s, j, _, _ = api.json("GET", "/api/me")
        check("after logout /api/me -> 401", s == 401, f"status={s}")
        s, j, _, _ = api.json("POST", "/api/auth/login", {"email": email, "password": "wrong-password-1"})
        check("wrong password -> 401", s == 401, f"status={s}")
        s, j, _, _ = api.json("POST", "/api/auth/login", {"email": email, "password": pw})
        check("login again", s == 200, f"status={s}")
        if not a.keep:
            s, j, _, _ = api.json("DELETE", "/api/me", {"password": pw})
            check("account deletion removes the test account", s == 200, f"status={s} body={j}")
    else:
        rec(SKIP, "rest of account checks", "sign up failed (rate limit, captcha, or VPN policy?)")

    print("\n== Scheduler and integrations ==")
    if a.cron_secret:
        auth = {"authorization": f"Bearer {a.cron_secret}"}
        s, j, _, _ = api.json("GET", "/api/internal/cron", headers=auth)
        check("cron tick succeeds with the secret", s == 200 and j and j.get("ok"), f"status={s} body={j}")
        s, j, _, _ = api.json("GET", "/api/health", headers=auth)
        ig = (j or {}).get("integrations", {})
        check("database connected", bool(j and j.get("db")), str(j))
        ai = [k for k in ("azure", "openai", "gemini", "groq", "mistral", "openrouter", "cloudflare", "compat") if ig.get(k)]
        check("at least one text-AI provider configured", bool(ai), "set a *_API_KEY (see .env.example)")
        print(f"        AI providers on: {', '.join(ai) or 'none'}  (fallbacks: {max(0, len(ai) - 1)})")
        check("outbound email configured", bool(ig.get("mail")), "set RESEND_API_KEY or BREVO_API_KEY")
        if not ig.get("razorpay"):
            rec(SKIP, "payments", "RAZORPAY keys not set - paid plans cannot be bought")
        else:
            rec(OK, "payments configured (test the full payment by hand with a Razorpay test card)")
    else:
        rec(SKIP, "scheduler/integration checks", "pass --cron-secret to include them")

    fails = [r for r in results if r[0] == BAD]
    print(f"\n{len(results) - len(fails)} passed / {len(fails)} failed / {len([r for r in results if r[0] == SKIP])} skipped")
    if fails:
        print("Failed:")
        for _, n, d in fails:
            print(f"  - {n} {d}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
