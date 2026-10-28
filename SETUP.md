# WorkLab XC – setup and run

Two double-clicks (install, then start). Everything else in this file is how to add your keys.

## 1. Install (once): double-click

Unzip the project, open the folder, then **double-click**:

| Your computer | Double-click this |
|---|---|
| **Windows** | `INSTALL-Windows.bat` |
| **Mac** | `INSTALL-Mac.command` (first time: right-click → Open → Open, because it came from a download) |
| **Linux** | `INSTALL-Linux.sh` (if it opens as text: right-click → Properties → allow executing, or run `bash INSTALL-Linux.sh`) |

It asks for **your email** (that account becomes the administrator; press Enter to skip), installs Python and Node.js if they are missing (Windows: winget; Mac: Homebrew; Linux: apt/dnf, may ask for your password), installs all packages, creates the `.env` settings file with fresh random secrets and a local database, and runs the backend self-test. It never overwrites an existing `.env`. Takes several minutes.

Terminal equivalents: `bash install.sh you@example.com` (Linux/Mac), `powershell -ExecutionPolicy Bypass -File install.ps1` (Windows), or `python scripts/install.py --admin-email you@example.com`.

## 2. Run everything: double-click

| Your computer | Double-click this |
|---|---|
| **Windows** | `START-Windows.bat` |
| **Mac** | `START-Mac.command` |
| **Linux** | `START-Linux.sh` |

It starts the Python backend and the web app together, waits until both are healthy, and **opens your browser at http://localhost:3000**. Leave the window open; closing it (or Ctrl-C) stops everything. If you never ran install, it does that first. The first start is slower because the web app compiles.

Terminal equivalents: `bash run.sh` / `python scripts/run.py`. Extra modes: `--prod` (production build), `--api-only` (backend only, port 8000), `--check` (start, run the checks, stop).

> With no keys the site runs, sign-up works, and syllabus upload builds a course, but **AI generation, email and payments need the keys below**. Without an AI key, generation answers "no AI provider configured".

---

## 3. Add your keys (edit `.env` in the project folder, then restart)

Do the **AI key** first; the rest can wait. Each `KEY=value` goes on its own line in `.env`, no quotes.

### AI text (need at least one; add several as automatic fallbacks)
| Service | Where to get it | `.env` line |
|---|---|---|
| Google Gemini (free tier) | aistudio.google.com/apikey | `GEMINI_API_KEY=…` |
| Groq (free tier) | console.groq.com → API Keys | `GROQ_API_KEY=…` |
| Mistral (free tier) | console.mistral.ai → API keys | `MISTRAL_API_KEY=…` |
| OpenRouter (free models) | openrouter.ai/keys | `OPENROUTER_API_KEY=…` |
| OpenAI | platform.openai.com/api-keys | `OPENAI_API_KEY=…` |
| Azure OpenAI (startup credits) | Azure portal → your OpenAI resource | `AZURE_OPENAI_ENDPOINT=…`, `AZURE_OPENAI_API_KEY=…`, `AZURE_OPENAI_DEPLOYMENT=…` (optional `AZURE_OPENAI_EMBED_DEPLOYMENT=…` for smarter reuse matching) |
| Cloudflare Workers AI (text + pictures) | dash.cloudflare.com → AI | `CF_ACCOUNT_ID=…`, `CF_API_TOKEN=…` |

Several keys for one service: `GROQ_API_KEYS=key1,key2,key3` (they rotate when one is rate-limited). The order tried is `LLM_ORDER=azure,openai,gemini,groq,mistral,openrouter,cloudflare,compat`. If your users upload private notes, put `azure` / `openai` first: free tiers of some providers may train on prompts.

### Email (verification, password reset, receipts)
1. Create an account at resend.com → **Domains** → add your domain (e.g. `worklabxc.com`) → add the DNS records it shows at your registrar → wait for "Verified".
2. API Keys → create → `RESEND_API_KEY=re_…`
3. Optional backup sender: `BREVO_API_KEY=…` (brevo.com). Settings: `MAIL_FROM`, `MAIL_NOREPLY`, `SUPPORT_EMAIL`.

Without a mail key, emails are printed in the API terminal in development.

### Payments (Razorpay)
1. razorpay.com → Dashboard in **Test mode** → Settings → API Keys → Generate Test Key.
2. `RAZORPAY_KEY_ID=rzp_test_…`, `RAZORPAY_KEY_SECRET=…`
3. Settings → Webhooks → add `https://YOUR-DOMAIN/api/webhooks/razorpay`, choose a secret → `RAZORPAY_WEBHOOK_SECRET=…`. Tick `payment_link.paid`, `payment_link.expired`, `payment_link.cancelled` and the `subscription.*` events. (Webhooks need a public URL; on your own computer use a tunnel such as `cloudflared` or `ngrok`.)
4. Prices: `PRICE_LEARNER_MONTH_INR`, `PRICE_LEARNER_YEAR_INR`, add-on prices `PRICE_ADDON_*`.
5. Invoices: set `SELLER_LEGAL_NAME`, `SELLER_GSTIN`, `SELLER_ADDRESS`, `SELLER_STATE_CODE` (and `GST_ENABLED=0` if you are not GST-registered).
6. Go live only after a full test payment works; then replace the test keys with live ones.

### Protection against abuse (all optional)
| Feature | Settings |
|---|---|
| VPN / proxy blocking (on by default) | `IPINTEL_PROVIDER=ipapi` (works without a key at low volume; or `ipqs` / `proxycheck` with `IPINTEL_KEY=…`), `VPN_POLICY=generation`, `IP_ALLOWLIST=203.0.113.*` for schools. Set `IPINTEL_PROVIDER=none` to switch it off while testing. |
| Bot check on sign-up | Cloudflare dashboard → Turnstile → `TURNSTILE_SECRET=…` (and the site key in the front end) |
| Accounts per device / country | `DEVICE_MAX_ACCOUNTS=3`, `COUNTRY_ALLOW=IN`, `COUNTRY_BLOCK=…` |
| Phone code at sign-up | `PHONE_VERIFY=on`, `SMS_PROVIDER=msg91` + `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` (or `twilio` + `TWILIO_*`). India needs DLT registration of sender and template. |

### Natural voice (optional)
Any one of: `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION`, `GOOGLE_TTS_API_KEY`, `OPENAI_TTS_API_KEY`, `ELEVENLABS_API_KEY`. With none set the browser's built-in voice is used.

### Pictures (optional)
Cloudflare keys above give AI illustrations; `HF_TOKEN` (huggingface.co) is a second option. Free fallback is on by default (`POLLINATIONS_ENABLED=1`).

### Operations (optional but recommended before launch)
| What | Settings |
|---|---|
| Alerts to Slack / Discord / n8n | `ALERT_WEBHOOK_URL=…` |
| Daily encrypted backup | `BACKUP_DAILY=1`, `BACKUP_PASSPHRASE=…` (store the passphrase somewhere safe), `BACKUP_DIR=…` or `BACKUP_S3_*` (AWS S3, Cloudflare R2, Backblaze B2, MinIO) |
| Monitoring | scrape `GET /api/metrics` with header `Authorization: Bearer <CRON_SECRET>` |

Manual backup: `python scripts/with_env.py -m wlxc.backup create` (check one with `… -m wlxc.backup verify FILE`; restore with `… restore FILE`).

### Database
Local: SQLite file in `data/` (set automatically). Production with many users: a PostgreSQL URL, `DATABASE_URL=postgres://user:pass@host:5432/db` (needs the `psycopg` package, which the installer tries to add; tables are created on first start).

---

## 4. Check that it works

1. With the app running: `python scripts/run.py --check` stops after the checks; or, while it runs, in another terminal:
   `python backend/scripts/staging_check.py http://localhost:3000 --cron-secret YOUR_CRON_SECRET`
   (the `CRON_SECRET` is in `.env`). Every line should say PASS except things you haven't configured yet (marked FAIL/SKIP with the setting to add).
2. Sign up in the browser with your admin email, upload a syllabus, generate one topic, download the PowerPoint.
3. Backend tests any time: `cd backend && PYTHONPATH=. python -m unittest discover -s tests -t .` (Windows: `set PYTHONPATH=.` first).

## 5. Put it on the internet with your own domain

Follow **DEPLOY.md** (Docker Compose on a server, Render, Fly.io, or Vercel for the web part). In short: set `APP_URL=https://yourdomain.com`, `WLXC_ENV=production`, a real `DATABASE_URL`, long random `SESSION_SECRET` and `CRON_SECRET`, then add the domain in your host's dashboard and the DNS records it shows.

## 6. If something goes wrong

| Symptom | Fix |
|---|---|
| `python` / `node` "not found" after install on Windows | Close the terminal, open a new one, re-run. |
| "The API did not start" | Read the red/last lines above it. Usually a typo in `.env`, or port 8000 in use (`--api-port 8001`). |
| "Web build failed" | The message names the file. Send it to whoever maintains the code: the web app has not been compiled in the environment this was written in, so type errors are possible on the very first build. |
| Sign-up says "too many accounts" | Device/IP limits are working. For local testing set `DEVICE_MAX_ACCOUNTS=0` and `SIGNUPS_PER_IP_DAY=1000`. |
| "Turn off your VPN" | Set `IPINTEL_PROVIDER=none` for testing. |
| Generation says no AI provider | Add one key from section 3 and restart. |
| Changed `.env` but nothing changed | Stop (Ctrl-C) and run again; settings are read at start. |

## What was and was not tested

The installer's file-writing, the API start-up, the `.env` reader and the 29-check smoke test were run from a fresh copy of the project. **Not run in the environment this was written in:** the Python virtual-environment step, `npm install`, the web build and dev server, and the Windows/macOS wrapper scripts (they use only standard tools, but have never been executed). If a step fails, the message names it; the manual equivalent of every step is in `scripts/install.py`.
