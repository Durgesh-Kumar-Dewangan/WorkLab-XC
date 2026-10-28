"""The ASGI app. Starlette only adapts requests to the framework-independent handlers in api.py.
Run:  uvicorn wlxc.app:app --host 0.0.0.0 --port 8000"""
from __future__ import annotations

import asyncio
import contextlib
import json

from starlette.applications import Starlette
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

from . import api, maintenance
from .config import env, session_secret
from .web import Req, error_out, log
from .errors import ApiError
from .crypto import uuid


async def _read_body(request: Request, limit: int) -> bytes:
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise ApiError(413, "too_large", "That request is too large.")
    chunks, size = [], 0
    async for part in request.stream():
        size += len(part)
        if size > limit:
            raise ApiError(413, "too_large", "That request is too large.")
        chunks.append(part)
    return b"".join(chunks)


def _endpoint(handler):
    limit = getattr(handler, "max_body", 256 * 1024)

    async def endpoint(request: Request) -> Response:
        headers = {k.lower(): v for k, v in request.headers.items()}
        rid = headers.get("x-request-id") or uuid()
        try:
            body = await _read_body(request, limit)
            form, files = {}, {}
            if "multipart/form-data" in headers.get("content-type", ""):
                # Re-parse from the bytes we already hold so the size cap above applies.
                async def receive():
                    return {"type": "http.request", "body": body, "more_body": False}

                sub = Request({**request.scope, "headers": request.scope["headers"]}, receive)
                parsed = await sub.form(max_files=5, max_fields=30)
                for k, v in parsed.multi_items():
                    if isinstance(v, UploadFile):
                        files[k] = (v.filename or "upload", await v.read(), v.content_type or "application/octet-stream")
                    else:
                        form[k] = v
                body = b""
            url = str(request.url)
            req = Req(request.method, url, headers, body, dict(request.path_params), form, files)
            if "x-forwarded-proto" in headers and url.startswith("http://"):
                req.url = "https://" + url[len("http://"):] if headers["x-forwarded-proto"] == "https" else url
        except Exception as e:  # noqa: BLE001
            out = error_out(e, rid)
            return Response(out.body, out.status, out.headers)
        out = await run_in_threadpool(handler, req)
        headers_out = dict(out.headers)
        cookies = headers_out.pop("set-cookie", None)
        resp = Response(out.body, out.status, headers_out)
        for c in (cookies.split("\n") if cookies else []):  # several cookies are joined with a newline by the route
            resp.headers.append("set-cookie", c)
        return resp

    return endpoint


async def _not_found(request: Request, exc) -> Response:
    status = getattr(exc, "status_code", 404)
    code, msg = ("method_not_allowed", "That method is not allowed here.") if status == 405 else ("not_found", "That was not found.")
    return Response(json.dumps({"error": code, "message": msg}), status, {"content-type": "application/json"})


@contextlib.asynccontextmanager
async def lifespan(app):
    session_secret()  # fails fast in production when SESSION_SECRET is missing or weak
    e = env()
    ticker = None
    if e.worker_mode == "inline" and e.inprocess_tick_sec > 0:
        async def loop():
            while True:
                await asyncio.sleep(e.inprocess_tick_sec)
                try:
                    await run_in_threadpool(maintenance.tick)
                except Exception as err:  # noqa: BLE001
                    log("error", "maintenance.failed", err=str(err)[:300])

        ticker = asyncio.create_task(loop())
    log("info", "wlxc.started", env="production" if e.prod else "development")
    try:
        yield
    finally:
        if ticker:
            ticker.cancel()


routes = [Route(path, _endpoint(h), methods=[m]) for m, path, h in api.ROUTES]
app = Starlette(routes=routes, lifespan=lifespan, exception_handlers={404: _not_found, 405: _not_found})
