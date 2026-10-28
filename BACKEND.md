# WorkLab XC – Python backend

`backend/wlxc` is a plain Python 3.12+ package (Starlette + uvicorn). The Next.js app is front end only and forwards `/api/*` to it.

| Piece | Where |
|---|---|
| ASGI app | `wlxc.app:app` (`uvicorn wlxc.app:app`) |
| All 71 routes | `wlxc/api.py` (uniform JSON errors, CSRF origin check, rate limits, security headers via `wlxc/web.py`) |
| Store | `wlxc/store.py`: SQLite (`SQLITE_PATH`), PostgreSQL JSONB (`DATABASE_URL`, tables auto-created), in-memory for dev/tests |
| AI chain | `wlxc/llm.py`: Azure → OpenAI → Gemini → Groq → Mistral → OpenRouter → Cloudflare → any OpenAI-compatible, ordered by `LLM_ORDER`; multi-key rotation, circuit breaker, JSON repair retry. Users never see which provider answered. |
| Documents | `extract.py` (PDF/DOCX/text), `deck.py` (PowerPoint via python-pptx), `render.py` (notes) |
| Background | `maintenance.tick()` via `/api/internal/cron`, the in-process ticker (`WORKER_MODE=inline`), or `python -m wlxc.worker` (`WORKER_MODE=external`) |

## Run locally
```
cd backend
pip install -r requirements.txt
export SESSION_SECRET=$(python -c "import secrets;print(secrets.token_urlsafe(48))") SQLITE_PATH=./dev.db
uvicorn wlxc.app:app --reload
# front end, second terminal, repo root:  npm install && npm run dev   (API_ORIGIN defaults to http://127.0.0.1:8000)
```
Every integration is optional; a missing key switches that feature off (no AI key → generation answers 503 `ai_not_configured`).

## Tests
```
cd backend && PYTHONPATH=. python -m unittest discover -s tests -t .
```
All outside services (AI, mail, payments, IP intelligence) are faked at one seam (`net.set_transport`), so nothing real is called.

## Not covered by these tests
The PostgreSQL store against a real server, real provider/payment/mail calls, and the browser UI. Run `backend/scripts/staging_check.py` against a deployed copy (see DEPLOY.md) for the first three of those checks the outside can see.
