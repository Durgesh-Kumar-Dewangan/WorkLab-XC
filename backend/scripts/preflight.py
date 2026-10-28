#!/usr/bin/env python3
"""Checks the settings a real launch needs, from the environment the app will run with, and says plainly what is missing.

    cd backend && python scripts/preflight.py            # check the current environment (reads ../.env if present)
    python scripts/preflight.py --generate               # print fresh SESSION_SECRET and CRON_SECRET values to paste into your host
    python scripts/preflight.py --strict                 # exit 1 if any BLOCKER is open (use it in CI before a deploy)

A BLOCKER stops a safe launch. A WARN is something to do soon. Nothing here sends a request anywhere or prints a secret."""
from __future__ import annotations

import argparse
import os
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _load_dotenv() -> None:
    f = Path(__file__).resolve().parent.parent.parent / ".env"
    if not f.exists():
        return
    for line in f.read_text(encoding="utf8").splitlines():
        if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.split(" #")[0].strip()
        os.environ.setdefault(k.strip(), v)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--generate", action="store_true")
    ap.add_argument("--strict", action="store_true")
    a = ap.parse_args()
    if a.generate:
        print(f"SESSION_SECRET={secrets.token_urlsafe(48)}")
        print(f"CRON_SECRET={secrets.token_urlsafe(48)}")
        return 0
    _load_dotenv()
    from wlxc.config import env, integrations

    e, i = env(), integrations()
    rows: list[tuple[str, str, str]] = []

    def add(level: str, ok: bool, what: str, fix: str) -> None:
        rows.append(("OK" if ok else level, what, "" if ok else fix))

    add("BLOCKER", len(e.session_secret) >= 32 and "dev-only" not in e.session_secret and "change" not in e.session_secret.lower(), "SESSION_SECRET is strong",
        "set 32+ random characters (run: python scripts/preflight.py --generate)")
    add("BLOCKER", len(os.environ.get("CRON_SECRET", "")) >= 32, "CRON_SECRET is strong", "set 32+ random characters")
    add("BLOCKER", e.app_url.startswith("https://") and "localhost" not in e.app_url, "APP_URL is the real https address", "set APP_URL=https://your-domain")
    add("BLOCKER", bool(os.environ.get("DATABASE_URL", "").startswith(("postgres://", "postgresql://"))), "DATABASE_URL points at Postgres", "create a Postgres database and set DATABASE_URL")
    add("WARN", not __import__("re").search(r"db[.][a-z0-9]+[.]supabase[.]co", os.environ.get("DATABASE_URL", "")), "DATABASE_URL is not the IPv6-only Supabase direct address", "in Supabase use Connect > Session pooler, which works on Render, Vercel and Fly")
    add("BLOCKER", i.mail, "an email provider is set (verification and receipts)", "set RESEND_API_KEY or BREVO_API_KEY (and MAIL_FROM on a verified domain)")
    add("BLOCKER", bool(e.turnstile_secret), "bot protection is on (Cloudflare Turnstile)", "set TURNSTILE_SECRET and NEXT_PUBLIC_TURNSTILE_SITE_KEY")
    ai = [n for n, ok in (("azure", i.azure), ("openai", i.openai), ("bedrock", i.bedrock)) if ok]
    add("BLOCKER", bool(ai), "a paid AI provider is set", "set Azure OpenAI or OpenAI keys; a free-tier key will run out with real users")
    pay = i.razorpay or i.paypal
    add("BLOCKER", pay, "a payment gateway is set", "set Razorpay (India) and/or PayPal (everywhere else)")
    add("WARN", i.razorpay and bool(e.razorpay.webhook_secret), "Razorpay webhook secret is set", "register /api/webhooks/razorpay and set RAZORPAY_WEBHOOK_SECRET")
    add("WARN", (not i.paypal) or bool(e.paypal.webhook_id), "PayPal webhook id is set", "register /api/webhooks/paypal and set PAYPAL_WEBHOOK_ID")
    add("WARN", (not i.paypal) or e.paypal.live, "PayPal is in live mode", "PAYPAL_ENV=live once sandbox payments, renewals and cancels all pass")
    add("WARN", bool(e.admin_emails), "an admin is named (ADMIN_EMAILS)", "set ADMIN_EMAILS to see the admin screens and the live map")
    add("WARN", bool(e.dev_emails) or bool(e.admin_emails), "a developer is named (DEV_EMAILS)", "set DEV_EMAILS to use the developer console")
    add("WARN", bool(e.alerts.webhook), "alerts go somewhere (ALERT_WEBHOOK_URL)", "point it at a Slack/Discord/Telegram webhook so you hear about errors")
    add("WARN", os.environ.get("BACKUP_DAILY", "") in ("1", "true"), "daily backups are on", "set BACKUP_DAILY=1 and BACKUP_DIR (or BACKUP_S3_*)")
    add("WARN", bool(e.gst.seller_address) and bool(e.gst.seller_name), "seller name and address are filled in (receipts, invoices)", "set SELLER_LEGAL_NAME, SELLER_ADDRESS and SELLER_GSTIN")
    add("WARN", e.trust_proxy, "the client address is read from the proxy (TRUST_PROXY=1)", "keep TRUST_PROXY=1 behind Cloudflare or a load balancer")
    add("WARN", os.environ.get("IPINTEL_PROVIDER", "none") != "none", "VPN/proxy detection is on", "optional: set IPINTEL_PROVIDER and IPINTEL_KEY")

    width = max(len(r[1]) for r in rows)
    blockers = 0
    for level, what, fix in rows:
        mark = {"OK": "  OK    ", "BLOCKER": "BLOCKER ", "WARN": "WARN    "}[level]
        print(f"[{mark}] {what.ljust(width)}" + (f"  -> {fix}" if fix else ""))
        blockers += level == "BLOCKER"
    print(f"\n{blockers} blocker(s), {sum(1 for r in rows if r[0] == 'WARN')} warning(s).")
    print("When the blockers are clear, run: python scripts/staging_check.py https://your-staging-site")
    return 1 if (blockers and a.strict) else 0


if __name__ == "__main__":
    raise SystemExit(main())
