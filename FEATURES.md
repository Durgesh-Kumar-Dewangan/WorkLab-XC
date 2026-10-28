# What is built, and what is not

Backend: 195 automated tests pass (Python `unittest`, all outside services faked). Everything below marked **built** has code and tests.
**Tested with fakes** means the request shapes are checked, but no real account at that provider has been called.

## Built

| Area | What it does | Switch / settings |
|---|---|---|
| Forced sign-up/login | Every feature route needs an account (401 otherwise, tested on 15 routes). | always on |
| VPN / proxy / Tor / datacenter block | Before every AI-spending route. Paid accounts exempt, school allow-list, results cached. *Tested with fakes.* | on by default: `IPINTEL_PROVIDER=ipapi`, `VPN_POLICY` |
| Country allow / block | By visitor country (Cloudflare header or IP lookup). | `COUNTRY_ALLOW`, `COUNTRY_BLOCK`, `COUNTRY_FAIL` |
| Device limit | Max accounts per device (cookie + browser fingerprint hint). | `DEVICE_MAX_ACCOUNTS=3` |
| One account per real mailbox | Gmail dots / `+tags` collapsed; 53 well-known disposable-mail domains refused (add more with `DISPOSABLE_DOMAINS_EXTRA`). | `BLOCK_DISPOSABLE_EMAIL`, `DISPOSABLE_DOMAINS_EXTRA` |
| Phone (SMS code) verification | Hashed 6-digit code, expiry, attempt lockout, one account per number, unlocks AI features. MSG91 or Twilio. *Tested with fakes.* | `PHONE_VERIFY=on`, `SMS_PROVIDER` |
| Over-use limits and auto-block | Plan quotas, escalating automatic blocks, admin block/unblock/reset, audit trail. | `AUTO_BLOCK_HITS_PER_HOUR` |
| Weak-connection handling | The page reports connection quality; on 2G / low speed / data-saver the server skips AI pictures and says why. `GET /api/network` shows what the server sees. | automatic |
| Subscriptions | Razorpay auto-renewing plans: create, authorise, charge/renew, cancel (access stays to period end), failed-payment handling, signature + amount checks. *Tested with fakes.* | needs Razorpay Subscriptions enabled |
| GST invoices | Sequential numbers, 18 % split into CGST+SGST or IGST by buyer state, buyer GSTIN validated, HTML/JSON download, also for one-time payments. | `GST_ENABLED`, `SELLER_*` (fill in your GSTIN) |
| Natural voice | Narration via Azure Speech, Google TTS, OpenAI TTS or ElevenLabs, cached per clip; falls back to the browser voice. *Tested with fakes.* | `TTS_ORDER` + one key |
| Community | Posts, comments, likes, follow feed, direct messages (message requests, one message until reply), blocking, reporting, 3-reports auto-hide, admin moderation queue with audit trail, word filter, link-spam rules, content erased on account deletion. | opt-in public profile |
| Backups | `python -m wlxc.backup create/verify/restore`, optional encryption, daily schedule, upload to S3/R2/B2/MinIO, retention. Restore round-trip tested. | `BACKUP_*` |
| Monitoring | Prometheus metrics at `GET /api/metrics` (Bearer `CRON_SECRET`), alerts to Slack/Discord/Teams/n8n on outages, slow requests, failed backups. | `ALERT_WEBHOOK_URL` |
| Load test | `python scripts/loadtest.py <url> --users 20 --seconds 20` | staging only |
| Staging check | `python scripts/staging_check.py <url> --cron-secret …` | see DEPLOY.md |

## Not included, and why

**Cannot be built (or should not be)**
- **NotebookLM / ChatGPT *account* automation.** Neither has an official API for this, and driving a personal account by script breaks their terms and gets accounts banned. Text comes from API providers (Azure/OpenAI, Gemini, Groq, Mistral, OpenRouter, Cloudflare, any OpenAI-compatible endpoint).
- **Native iOS/Android apps.** Not built; it is a responsive web app with a web manifest, so it can be installed from the browser. A native app is a separate project with store accounts.
- **Detecting residential VPNs and mobile hotspots.** No IP database can do this reliably. The checks above only raise the cost of abuse.
- **A lawyer-reviewed legal pack.** The privacy, terms, refund, cookie and AI-use pages are sensible default text. They are not legal advice and must be reviewed for your company, GSTIN, grievance officer and the DPDP Act before you charge anyone.

**Built but not verified against the real thing** (needs your accounts and keys, so nothing here can prove it)
- Real calls to AI, mail, SMS, payment, voice and IP-lookup providers; Razorpay Subscriptions and the live webhook.
- PostgreSQL: written, never run against a server here (SQLite is tested, including backup/restore).
- **The Next.js front end.** It was never built or run (npm is blocked in this sandbox). The new backend features (community, messages, invoices, subscription management, phone verification, natural voice, connection hint) have API routes and tests, but only the connection hint has a front-end hook. **Screens for the rest still need to be built and wired.**
- Browser/device testing at 320–1440 px in Chrome, Firefox, Safari, Edge; accessibility audit (WCAG 2.2 AA is a design aim, not a result); Core Web Vitals.
- Load: a 20-second local run at light load (p95 ≈ 11 ms for reads on SQLite, one process). That says nothing about real-world capacity; test on your staging stack.
- SMS delivery in India needs DLT registration of the sender and template with your telecom provider (MSG91 guides you); that is paperwork on your side.
