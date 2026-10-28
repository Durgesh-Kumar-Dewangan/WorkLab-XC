# Deploy for free: GitHub + Supabase + Render + Vercel

This puts the whole platform online at no cost. Four free accounts, about 20 minutes.

| Part | Where | Free plan |
|---|---|---|
| Code | **GitHub** | private repo, free CI and the 10-minute scheduler |
| Database | **Supabase** (Postgres) | 500 MB, pauses after a week of no use |
| API (Python) | **Render** | free web service, sleeps when idle |
| Web (Next.js) | **Vercel** (or Cloudflare, below) | free Hobby plan |

The browser only talks to the web app. The web app forwards `/api/*` to the API (`API_ORIGIN`), so sign-in cookies stay on one address.

## 1. Put the code on GitHub
```
git init && git add . && git commit -m "WorkLab XC"
gh repo create worklab-xc --private --source=. --push      # or create the repo on github.com and push
```
`.env` and your local data are already ignored, so no secrets are uploaded. The CI workflow (`.github/workflows/ci.yml`) now runs the tests on every push.

## 2. Supabase: the database
1. supabase.com > **New project**. Pick the region nearest your users. Save the **database password** (use letters and numbers only, so it needs no escaping).
2. **Connect** (top bar) > **Connection string** > choose **Session pooler**, copy the address, and put your password in place of `[YOUR-PASSWORD]`. It looks like
   `postgresql://postgres.abcdefgh:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`.
   Use the **Session pooler** (port 5432) on Render and Vercel: the plain "Direct connection" address is IPv6 only and fails on most free hosts.
   The Transaction pooler (port 6543) also works; the app detects it and turns prepared statements off.
3. Check it from your computer before you deploy:
   ```
   cd backend && pip install -r requirements.txt
   python scripts/db_check.py "postgresql://postgres.abcdefgh:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
   ```
   It creates the tables, confirms row-level security is on (so Supabase's public REST API cannot read your data), and does a test write.
   The tables are created automatically on first start too. You never open the Supabase table editor to set anything up.
4. Already have accounts and lessons on your computer? Copy them across (safe to repeat, never deletes):
   ```
   python scripts/migrate_to_postgres.py "postgresql://..."            # add --dry-run to just count
   ```
5. Do not use Supabase's own sign-in, storage or `anon` key for this app. WorkLab XC has its own accounts and only needs the database.

## 3. Render: the API
1. render.com > **New > Blueprint** > pick your GitHub repo > for the file choose **`render.free.yaml`**.
2. Fill the values it asks for:
   - `DATABASE_URL` = the Session pooler address from step 2.
   - `APP_URL` = your Vercel address (you get it in step 4; you can come back and set it, then redeploy).
   - `GEMINI_API_KEY` and `GROQ_API_KEY` = free keys from aistudio.google.com/apikey and console.groq.com/keys. One is enough.
   - `ADMIN_EMAILS` = your own email, so you get the admin screens.
   - Optional `RESEND_API_KEY` for emails (sign-up confirmation, receipts).
3. When it is live, open `https://<your-service>.onrender.com/api/health`. It should say `ok`.
   `SESSION_SECRET` and `CRON_SECRET` are generated for you (copy `CRON_SECRET` for step 5).

## 4. Vercel: the web app
1. vercel.com > **Add New > Project** > import the same GitHub repo. Framework: Next.js (detected from `vercel.json`).
2. **Environment variables** (Production):
   - `API_ORIGIN` = `https://<your-service>.onrender.com`
   - `NEXT_PUBLIC_WLXC_API_BASE` = `/api`
   - `NEXT_PUBLIC_WLXC_CURRENCY` = `₹` (or `$`)
3. Deploy. Every push to `main` now deploys on its own, and every pull request gets a preview address.
4. Copy the address (`https://<project>.vercel.app`) into Render as `APP_URL`, then redeploy the API.

### Or Cloudflare instead of Vercel
`npm run cf:build && CLOUDFLARE_API_TOKEN=... npm run cf:deploy` (see DEPLOY.md > Cloudflare). Set `API_ORIGIN` in `wrangler.jsonc`.
Cloudflare also gives free DNS, HTTPS and a firewall in front of either host.

## 5. The free scheduler (GitHub Actions)
The API wakes up, finishes stalled lessons, retries emails and sends reminders when it is visited. In the GitHub repo: **Settings > Secrets and variables > Actions**, add
`APP_URL` = your **API** address (`https://<service>.onrender.com`) and `CRON_SECRET` = the value Render generated. The Tick workflow then runs every 10 minutes.

## 6. Check it
```
python backend/scripts/preflight.py            # lists anything still missing
python backend/scripts/staging_check.py https://<project>.vercel.app --api https://<service>.onrender.com --cron-secret "$CRON_SECRET"
```
Open your Vercel address, create an account, make a lesson. Then sign in with the email you put in `ADMIN_EMAILS` and open **/app/admin**.

## Good to know
- **Cold starts:** the free API sleeps after 15 idle minutes and the first request afterwards takes up to a minute. A paid Render instance (about $7 a month) removes this.
- **Supabase pauses** a free project after a week with no use; open the dashboard and press Restore. Take a backup before launch (Supabase > Database > Backups, or `python backend/scripts/db_admin.py`).
- **Free tiers have limits.** For real traffic, move the API to a paid plan; nothing in the code changes, only `render.yaml` instead of `render.free.yaml`.
- **Learners can bring their own AI key** (Settings > Your own AI key), so heavy users do not use your AI quota.
- **Other free hosts for the API:** Fly.io (`backend/fly.toml`), Koyeb, Railway, or any VM with Docker. The same `DATABASE_URL` works everywhere.
