# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1 WLXC_ENV=production PORT=8000
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt && useradd -m app
COPY wlxc ./wlxc
USER app

# Worker (optional): `docker build --target worker .`  runs generation jobs outside the web process.
FROM base AS worker
CMD ["python", "-m", "wlxc.worker"]

# API: the LAST stage, so a plain `docker build .` produces it.
FROM base AS api
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request,os;urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/api/health',timeout=4)" || exit 1
CMD ["sh", "-c", "uvicorn wlxc.app:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-2} --proxy-headers --forwarded-allow-ips='*'"]
