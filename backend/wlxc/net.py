"""Outbound HTTP with a timeout. Every provider call goes through here so tests can swap the transport."""
from __future__ import annotations

import threading
import time
from typing import Callable

import requests

# Use the operating system's certificate store when the optional `truststore` package is installed. It fixes
# CERTIFICATE_VERIFY_FAILED on computers behind antivirus web scanning or a company proxy, which re-signs HTTPS traffic.
try:
    import truststore

    truststore.inject_into_ssl()
except Exception:  # noqa: BLE001  not installed, or not supported here: the default certificates are used
    pass

# transport(method, url, headers, body_bytes, timeout) -> Response-like (status, text, content, headers)
class Resp:
    def __init__(self, status: int, content: bytes = b"", headers: dict | None = None):
        self.status = status
        self.content = content
        self.headers = {k.lower(): v for k, v in (headers or {}).items()}

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300

    @property
    def text(self) -> str:
        return self.content.decode("utf-8", "replace")

    def json(self):
        import json

        return json.loads(self.content.decode("utf-8", "replace"))


Transport = Callable[[str, str, dict, bytes | None, float], Resp]


def _real(method: str, url: str, headers: dict, body: bytes | None, timeout: float) -> Resp:
    r = requests.request(method, url, headers=headers, data=body, timeout=timeout)
    return Resp(r.status_code, r.content, dict(r.headers))


_transport: Transport = _real


def set_transport(t: Transport | None) -> None:
    global _transport
    _transport = t or _real


def http(url: str, method: str = "GET", headers: dict | None = None, body: bytes | str | None = None,
         json_body=None, timeout: float = 30) -> Resp:
    import json as _json

    h = dict(headers or {})
    data = body.encode() if isinstance(body, str) else body
    if json_body is not None:
        data = _json.dumps(json_body).encode()
        h.setdefault("content-type", "application/json")
    return _transport(method, url, h, data, timeout)


def sleep(ms: float) -> None:
    if ms > 0:
        time.sleep(ms / 1000)
