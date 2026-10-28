"""HTTP layer: a framework-independent request/response pair, and the `route` wrapper that adds auth, CSRF,
rate limiting, validation errors and uniform JSON error bodies. Starlette only adapts to it (see app.py)."""
from __future__ import annotations

import json
import re
import sys
import time
import traceback
from dataclasses import dataclass, field
from typing import Any, Callable
from urllib.parse import parse_qs, urlparse

from .config import env
from .errors import ApiError, ValidationError
from .crypto import uuid
from .store import get_store


@dataclass
class Req:
    method: str = "GET"
    url: str = "http://localhost:3000/"
    headers: dict = field(default_factory=dict)  # lower-case keys
    body: bytes = b""
    params: dict = field(default_factory=dict)  # path parameters
    form: dict = field(default_factory=dict)  # multipart text fields
    files: dict = field(default_factory=dict)  # multipart files: name -> (filename, bytes, content_type)

    @property
    def query(self) -> dict:
        return {k: v[0] for k, v in parse_qs(urlparse(self.url).query, keep_blank_values=True).items()}

    def header(self, k: str) -> str | None:
        return self.headers.get(k.lower())


@dataclass
class Out:
    status: int = 200
    body: bytes = b""
    headers: dict = field(default_factory=dict)

    def json(self):
        return json.loads(self.body.decode())


def json_out(data: Any, status: int = 200, headers: dict | None = None) -> Out:
    h = {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"}
    h.update(headers or {})
    return Out(status, json.dumps(data).encode(), h)


def log(level: str, msg: str, **extra) -> None:
    line = json.dumps({"level": level, "msg": msg, **extra}, default=str)
    print(line, file=sys.stdout if level == "info" else sys.stderr, flush=True)


def client_ip(req: Req) -> str:
    if not env().trust_proxy:
        return "unknown"
    h = req.headers
    return (h.get("cf-connecting-ip") or (h.get("x-forwarded-for") or "").split(",")[0].strip()
            or h.get("x-real-ip") or "unknown")


def rate_limit(key: str, limit: int, window_sec: int) -> None:
    """Fixed-window limiter backed by the store, so it holds across instances when Postgres is used."""
    win = int(time.time() // window_sec)
    doc = get_store().update("rl", f"{key}:{win}", lambda c: {"n": (c or {}).get("n", 0) + 1})
    if (doc or {}).get("n", 0) > limit:
        retry = window_sec - (int(time.time()) % window_sec)
        raise ApiError(429, "rate_limited", "Too many requests. Wait a moment and try again.", {}, {"retry-after": str(retry)})


def read_json(req: Req, schema, max_bytes: int = 256 * 1024):
    if len(req.body) > max_bytes:
        raise ApiError(413, "too_large", "That request is too large.")
    try:
        raw = json.loads(req.body.decode()) if req.body else {}
    except (ValueError, UnicodeDecodeError):
        raise ApiError(400, "bad_json", "The request body is not valid JSON.") from None
    return schema(raw, "")


def _allowed_origin(req: Req, origin: str) -> bool:
    ok = {env().app_url}
    host = req.header("x-forwarded-host") or req.header("host")
    if host:
        proto = req.header("x-forwarded-proto") or ("https" if env().app_url.startswith("https") else "http")
        ok.add(f"{proto}://{host}")
    u = urlparse(req.url)
    ok.add(f"{u.scheme}://{u.netloc}")
    return origin in ok


def check_csrf(req: Req) -> None:
    if req.method in ("GET", "HEAD", "OPTIONS"):
        return
    origin = req.header("origin")
    if origin:
        if not _allowed_origin(req, origin):
            raise ApiError(403, "bad_origin", "This request came from an unexpected site.")
        return
    if req.header("sec-fetch-site") == "cross-site":
        raise ApiError(403, "bad_origin", "This request came from an unexpected site.")


@dataclass
class Ctx:
    req: Req
    params: dict
    ip: str
    rid: str
    user: dict | None

    def json(self, schema, max_bytes: int = 256 * 1024):
        return read_json(self.req, schema, max_bytes)


SEC_HEADERS = {"x-content-type-options": "nosniff", "referrer-policy": "same-origin"}


def error_out(e: BaseException, rid: str) -> Out:
    base = {"x-request-id": rid, **SEC_HEADERS}
    if isinstance(e, ApiError):
        return json_out({"error": e.code, "message": e.message, "requestId": rid, **e.extra}, e.status, {**base, **e.headers})
    if isinstance(e, ValidationError):
        return json_out(
            {"error": "invalid_input", "message": e.issues[0] if e.issues else "Check the form and try again.", "issues": e.issues, "requestId": rid},
            422, base)
    from .devtools import scrub  # a crash message can contain whatever the person typed, so it is cleaned before it reaches a log or an alert
    log("error", "unhandled", rid=rid, err=scrub(str(e), 300), stack=scrub("".join(traceback.format_exception(e))[-1500:], 1500))
    try:
        from . import alerts
        alerts.notify("server_error", f"Unhandled error: {type(e).__name__}: {scrub(str(e), 200)}", requestId=rid)
    except Exception:  # noqa: BLE001
        pass
    return json_out({"error": "internal", "message": "Something went wrong on our side. Try again in a moment.", "requestId": rid}, 500, base)


def route(handler: Callable[[Ctx], Any], auth: str = "optional", csrf: bool = True, allow_blocked: bool = False,
          rate: dict | None = None, max_body: int = 256 * 1024):
    """Wrap a handler. auth: 'user' needs a signed-in account, 'optional' reads one if present, 'none' ignores cookies."""

    def run(req: Req) -> Out:
        from . import abuse, auth as authmod  # late import: these modules use this one

        rid = req.header("x-request-id") or uuid()
        who = None
        t0 = time.time()
        res = None
        try:
            ip = client_ip(req)
            if csrf:
                check_csrf(req)
            if len(req.body) > max_body:
                raise ApiError(413, "too_large", "That request is too large.")
            user = None if auth == "none" else authmod.user_from_request(req)
            if auth == "user" and not user:
                raise ApiError(401, "unauthenticated", "Sign in to continue.")
            who = user
            if user and not allow_blocked:
                abuse.assert_not_blocked(user)
            if rate:
                bucket = user["id"] if rate.get("by") == "user" and user else ip
                rate_limit(f"{rate['name']}:{bucket}", rate["limit"], rate["windowSec"])
            from . import byok

            with byok.as_user(user["id"] if user else None):
                out = handler(Ctx(req, req.params, ip, rid, user))
            res = out if isinstance(out, Out) else json_out(out)
            for k, v in {**SEC_HEADERS, "x-request-id": rid}.items():
                res.headers.setdefault(k, v)
            return res
        except Exception as e:  # noqa: BLE001
            if who and isinstance(e, ApiError) and e.code in abuse.LIMIT_CODES:
                try:
                    abuse.note_limit_hit(who["id"])
                except Exception:  # noqa: BLE001
                    pass
            res = error_out(e, rid)
            if res.status >= 500:
                try:  # a fault is remembered against the learner it happened to, scrubbed of anything personal, so a developer can find and fix it
                    from . import devtools
                    from urllib.parse import urlparse
                    devtools.record_issue(who, req.method, urlparse(req.url).path, res.status, getattr(e, "code", "internal"), str(e), rid)
                except Exception:  # noqa: BLE001
                    pass
            return res
        finally:
            try:
                from . import metrics
                metrics.observe(req.method, res.status if res is not None else 500, time.time() - t0, env().alerts.slow_ms)
            except Exception:  # noqa: BLE001
                pass

    run.max_body = max_body  # type: ignore[attr-defined]
    return run


_SAFE = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")


def safe_id(s: str | None) -> str:
    """Path ids come from users: accept only the characters we generate."""
    if not s or not _SAFE.match(s):
        raise ApiError(404, "not_found", "That was not found.")
    return s
