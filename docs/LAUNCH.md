# Launch checklist (web version, Product Hunt)

## Before you post
- [ ] `python backend/scripts/preflight.py --strict` shows no BLOCKER.
- [ ] Real domain on HTTPS; `APP_URL` matches it; Cloudflare in front with `TRUST_PROXY=1`.
- [ ] Postgres is the database (`DATABASE_URL`); a backup restores into a scratch database.
- [ ] Email works: sign up with a fresh address, get the verification mail, reset a password.
- [ ] Turnstile: site key and secret both set; sign up and sign in from a normal browser and from a phone.
- [ ] A paid AI provider is set and a daily spend alert exists in the provider's dashboard.
- [ ] Razorpay and PayPal: one real payment, one renewal, one cancel, one receipt each; webhooks registered.
- [ ] `/terms`, `/privacy`, `/refunds`, `/cookies`, `/ai-use` read by a lawyer; seller name, address and GSTIN filled in.
- [ ] `python backend/scripts/staging_check.py https://your-site` passes; `python backend/scripts/loadtest.py` shows the API holds at your expected launch traffic.
- [ ] You are named in `ADMIN_EMAILS` and `DEV_EMAILS`; you can open the live map and the developer console.
- [ ] Alerts reach you (`ALERT_WEBHOOK_URL`).

## Product Hunt page
- The first link should be the **try-it-now** page: `/demo/classroom/n2` works without signing in.
- Tagline (60 chars): *Turn any syllabus into lessons in a 3D classroom*.
- Gallery: the classroom, a deep lesson with its diagrams, the learning path, the leaderboard, the pricing page.
- First comment: who it is for, what is free, what Beta adds, and what you want feedback on.
- Be around for the day: answer every comment, and watch the live map and the developer console for faults.

## The first week
- Keep the free plan's AI limits tight until you have seen real cost per learner.
- Read every feedback message (Admin > Feedback) and every ticket; fix the top fault in the developer console each day.
