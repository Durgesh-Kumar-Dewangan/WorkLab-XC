# WorkLab XC

Turn a course outline into lessons you can follow. Upload a syllabus, get a course map, AI-written lessons, practice and exams, and study each topic in a 3D lecture hall (presentation screen, two live boards).

The full guide (install, run, deploy, change the model, tech stack, pros and cons, small-screen design) is in **docs/WorkLab-XC-Guide.pdf**.

## Install and run

```bash
python scripts/install.py      # once: checks the computer, installs Python + Node packages, writes .env
python scripts/run.py --open   # starts the API (8000) and the web app (3000) and opens the browser
```

Or double-click `INSTALL-Windows.bat` / `INSTALL-Mac.command` / `INSTALL-Linux.sh`, then the matching `START-...` file. The same commands are available as `npm run setup`, `npm run doctor` (system check only), `npm run app` and `npm run app:prod`.

Keys, payments, ads and everything else: **SETUP.md**. Deploying: **DEPLOY.md**. Backend: **BACKEND.md**.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Babylon.js 8 (3D classroom; three.js kept as a fallback), Zustand + immer, Tailwind v4 plus layered CSS in `src/styles`, Vitest, ESLint. Backend: Python 3.10+ (Starlette/uvicorn), SQLite or PostgreSQL, OpenAI-compatible AI providers, Razorpay, Google AdSense.

## Checks

```bash
npm run typecheck && npm run lint && npm test
cd backend && python -m unittest discover -s tests -t .
```
