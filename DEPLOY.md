# Deploying WorkLab XC

Two services: **api** (Python, `backend/`) and **web** (Next.js, repo root). The browser only talks to `web`; Next forwards `/api/*` to `api`
(`API_ORIGIN`), so cookies stay first-party. State lives in Postgres (or one SQLite volume on a single server).

**Free, step by step (GitHub + Supabase + Render + Vercel): [docs/DEPLOY-FREE.md](docs/DEPLOY-FREE.md).** It uses `render.free.yaml`, `backend/scripts/db_check.py`
(checks your database before you deploy) and `backend/scripts/migrate_to_postgres.py` (moves your local data into it).

## Required settings (api)
`APP_URL` (https://worklabxc.com), `SESSION_SECRET` (32+ random chars), `CRON_SECRET`, `WLXC_ENV=production`, and `DATABASE_URL` **or** `SQLITE_PATH`.
Add at least one AI key (Gemini, Groq, Mistral and OpenRouter have free tiers; list several in `LLM_ORDER` as automatic fallbacks), a mail key
(`RESEND_API_KEY` or `BREVO_API_KEY`, with worklabxc.com verified for SPF/DKIM), and `ADMIN_EMAILS`.
Payments: `RAZORPAY_*`, webhook URL `https://<site>/api/webhooks/razorpay`, secret = `RAZORPAY_WEBHOOK_SECRET`. Full list: `.env.example`.

## Options
- **Docker Compose (any VM):** `cp .env.example .env`, edit, `docker compose up --build`, open http://localhost:3000.
- **Render:** New → Blueprint (`render.yaml`: api + worker + web + Postgres). Set `API_ORIGIN` on the web service to the api's URL.
  For a free setup use `render.free.yaml` (api only, the database on Supabase and the web app on Vercel).
- **Supabase (Postgres):** set `DATABASE_URL` to the **Session pooler** address (Supabase > Connect). Tables are created on first start, row-level security is switched on so
  Supabase's public REST API cannot read them, and the Transaction pooler (port 6543) is detected and handled. `PG_CA_CERT` adds full certificate verification.
- **Fly.io:** `cd backend && fly launch --copy-config --no-deploy`, set secrets, `fly deploy`. Deploy the front end with
  `docker build --build-arg API_ORIGIN=https://<api>.fly.dev .` or on Vercel.
- **Vercel (front end) + a container host (api):** set `API_ORIGIN` in Vercel. The API must be a long-running service, not serverless.
  Use `WORKER_MODE=inline` with `INPROCESS_TICK_SEC`, or call `/api/internal/cron` every 5 minutes (`.github/workflows/tick.yml`).
- **Single cheap server:** one container, `SQLITE_PATH=/data/wlxc.db` on a mounted volume, `WEB_CONCURRENCY=1`, `WORKER_MODE=inline`. Back the file up nightly.

## Cloudflare
Cloudflare can do three jobs here, and you can use any mix:
1. **In front of everything (CDN, DNS, firewall, free TLS).** Point your domain at Cloudflare. Keep `TRUST_PROXY=1`: the API reads the visitor's address from `cf-connecting-ip`
   and their country from `cf-ipcountry`, which is what picks the regional price. Turn on *Always use HTTPS* and *Bot Fight Mode*.
2. **The web front end on Workers (this repo is set up for it).** `wrangler.jsonc` and `open-next.config.ts` are in the root.
   ```
   npm run cf:build                          # builds the Worker bundle (checked: about 2.3 MB compressed, inside the Workers limit)
   npm run cf:preview                        # run it locally in the Workers runtime
   CLOUDFLARE_API_TOKEN=... npm run cf:deploy
   ```
   Set `API_ORIGIN` in `wrangler.jsonc` (or as a Worker variable) to your API's address, then add your domain under *Workers & Pages > Settings > Domains*.
   Build on Linux, macOS or WSL for the most reliable result.
3. **Turnstile (the "are you a person" check) and Web Analytics.** Create a Turnstile widget: put the **site key** in `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (web) and the **secret**
   in `TURNSTILE_SECRET` (api). Set both or neither: with only the secret set, nobody can sign in. For visitor analytics add `NEXT_PUBLIC_CF_ANALYTICS_TOKEN` (cookieless).

The **Python API cannot run on Workers.** Run it on Fly.io, Render, AWS (ECS, App Runner, EC2) or any container host, with Postgres (Neon, Supabase, RDS or Fly Postgres).

## Before you go live
`cd backend && python scripts/preflight.py` lists every missing setting as BLOCKER or WARN. `python scripts/preflight.py --generate` prints fresh secrets.
Use `--strict` in CI to stop a deploy while a BLOCKER is open.

## Staging checks
1. Deploy to a staging URL with `APP_URL` set to it and Razorpay **test** keys.
2. Run `python backend/scripts/staging_check.py https://staging.example.com --cron-secret "$CRON_SECRET"`
   (add `--api https://api-host` if the API is on another origin, `--api-only` to skip page checks). It signs up and deletes a throw-away account and prints
   PASS/FAIL/SKIP for health, headers, CSRF, auth, upload, export, deletion, the scheduler, and which integrations are switched on. Fix every FAIL.
3. By hand: one test payment end to end (checkout → webhook → plan active → receipt email); verification and reset emails arrive in the inbox;
   one generated deck opens in PowerPoint; the main screens at 320/375/768/1024/1440 px; Chrome, Firefox, Safari, Edge; keyboard-only pass;
   the no-WebGL fallback; Lighthouse on a throttled mobile profile.
4. Restore a database backup into a scratch database before launch.
5. Have a lawyer review `/terms`, `/privacy`, `/refunds`, `/cookies`. The shipped text is a sensible default, not legal advice.

## Build-time settings for the web image
`NEXT_PUBLIC_*` values are fixed when the web image is built, not when it starts. The Dockerfile already defaults `NEXT_PUBLIC_WLXC_API_BASE=/api`
and `NEXT_PUBLIC_WLXC_CURRENCY=₹`. To switch on Google sign-in or AdSense, pass them as build arguments (`--build-arg NEXT_PUBLIC_GOOGLE_CLIENT_ID=...`,
`NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_SLOT_*`) or set them in `.env` for `docker compose`, then rebuild. The `.dockerignore` keeps `.env` and local data out of the image.
