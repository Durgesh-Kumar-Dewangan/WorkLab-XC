"""The AI chain: a list of (provider, model) routes tried in order, with key rotation, a circuit breaker,
a repair attempt for invalid replies, and provider names that never leave the server."""
from __future__ import annotations

import json
import os
import random
import re
import threading
import time
from typing import Any, Callable
from urllib.parse import quote

from .config import env, integrations
from .errors import ApiError
from .net import http, sleep
from .web import log

# ---------------------------------------------------------------- breaker and key pool


class _Breaker:
    """After 3 straight failures a provider is skipped for 60 s so users are not made to wait on a dead one."""

    threshold = 3
    cool_ms = 60_000

    def __init__(self):
        self.state: dict[str, list] = {}
        self.lock = threading.Lock()

    def open(self, id: str, now: float | None = None) -> bool:
        now = time.time() * 1000 if now is None else now
        with self.lock:
            return (self.state.get(id, [0, 0])[1]) > now

    def ok(self, id: str) -> None:
        with self.lock:
            self.state.pop(id, None)

    def fail(self, id: str, now: float | None = None) -> None:
        now = time.time() * 1000 if now is None else now
        with self.lock:
            s = self.state.setdefault(id, [0, 0])
            s[0] += 1
            if s[0] >= self.threshold:
                s[1] = now + self.cool_ms
                s[0] = 0

    def reset(self) -> None:
        with self.lock:
            self.state.clear()


breaker = _Breaker()


class _KeyPool:
    """Round-robin over several API keys for one provider. A key that hits a rate limit rests for the time the provider
    asks (default 60 s); a key the provider rejects (401/403) rests for 10 minutes."""

    def __init__(self):
        self.rest: dict[str, float] = {}
        self.cursor: dict[str, int] = {}
        self.lock = threading.Lock()

    @staticmethod
    def _id(provider: str, key: str) -> str:
        return f"{provider}:{key[-8:]}"

    def next(self, provider: str, keys: list[str], now: float | None = None) -> str | None:
        now = time.time() * 1000 if now is None else now
        if not keys:
            return None
        with self.lock:
            start = self.cursor.get(provider, 0)
            for i in range(len(keys)):
                k = keys[(start + i) % len(keys)]
                if self.rest.get(self._id(provider, k), 0) <= now:
                    self.cursor[provider] = (start + i + 1) % len(keys)
                    return k
        return None

    def limited(self, provider: str, key: str, ms: float = 60_000) -> None:
        with self.lock:
            self.rest[self._id(provider, key)] = time.time() * 1000 + ms

    def rejected(self, provider: str, key: str) -> None:
        with self.lock:
            self.rest[self._id(provider, key)] = time.time() * 1000 + 10 * 60_000

    def reset(self) -> None:
        with self.lock:
            self.rest.clear()
            self.cursor.clear()


key_pool = _KeyPool()

# ---------------------------------------------------------------- JSON extraction


def extract_json(text: str) -> Any:
    """Pulls a JSON value out of model output that may be wrapped in prose or code fences. Raises if none parses."""
    t = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", t, re.I)
    if m:
        t = m.group(1).strip()

    def try_parse(x: str):
        try:
            return (json.loads(x),)
        except ValueError:
            try:
                return (json.loads(re.sub(r",\s*([}\]])", r"\1", x)),)
            except ValueError:
                return None

    direct = try_parse(t)
    if direct:
        return direct[0]
    m2 = re.search(r"[{\[]", t)
    if m2:
        a = m2.start()
        close = "}" if t[a] == "{" else "]"
        b = t.rfind(close)
        if b > a:
            r = try_parse(t[a:b + 1])
            if r:
                return r[0]
    raise ValueError("The model reply did not contain valid JSON.")


# ---------------------------------------------------------------- providers


class ProviderError(Exception):
    def __init__(self, msg: str, retryable: bool, retry_after_ms: float = 0, status: int | None = None, wait_ms: float = 0):
        super().__init__(msg)
        self.retryable = retryable
        self.retry_after_ms = retry_after_ms
        self.status = status
        self.wait_ms = wait_ms


tuning = {"backoff_ms": 700, "attempts_per_route": 2, "timeout_s": 70}


def _post(url: str, headers: dict, body: dict) -> dict:
    try:
        res = http(url, "POST", {"content-type": "application/json", **headers}, json_body=body, timeout=tuning["timeout_s"])
    except Exception as e:  # noqa: BLE001
        raise ProviderError(f"network: {e}", True) from None
    if not res.ok:
        try:
            ra = float(res.headers.get("retry-after", 0)) * 1000
        except ValueError:
            ra = 0
        raise ProviderError(f"HTTP {res.status} {res.text[:300]}", res.status == 408 or res.status >= 500, min(ra, 5000), res.status, ra)
    return res.json()


def _from_choices(j: dict) -> dict:
    ch = (j.get("choices") or [None])[0] or {}
    text = (ch.get("message") or {}).get("content")
    if not text:
        raise ProviderError("empty reply", False)
    if ch.get("finish_reason") == "length":
        raise ProviderError("reply was cut off (max tokens)", False)
    u = j.get("usage") or {}
    return {"text": text, "tokensIn": u.get("prompt_tokens"), "tokensOut": u.get("completion_tokens")}


def _messages(r: dict) -> list:
    imgs = r.get("images")
    if imgs:  # OpenAI-style multimodal message; Azure, OpenAI, Gemini and OpenRouter all accept it
        content = [{"type": "text", "text": r["user"]}] + [{"type": "image_url", "image_url": {"url": f"data:{m};base64,{b}"}} for m, b in imgs]
        return [{"role": "system", "content": r["system"]}, {"role": "user", "content": content}]
    return [{"role": "system", "content": r["system"]}, {"role": "user", "content": r["user"]}]


# providers whose models can read images; the others (text-only models) are skipped for a request that carries pictures
VISION_PROVIDERS = {"azure", "openai", "gemini", "openrouter", "compat", "byok-openai", "byok-gemini", "byok-openrouter"}


class Route:
    def __init__(self, id: str, provider: str, model: str, call: Callable[[dict], dict]):
        self.id, self.provider, self.model, self.call = id, provider, model, call


def _compat_routes(provider: str, base: str, keys: list[str], models: list[str], json_mode: bool, token_field: str, extra_headers: dict | None = None) -> list[Route]:
    out = []
    for model in models:
        def call(r, model=model):
            body: dict = {"model": model, "messages": _messages(r), token_field: r.get("maxTokens") or 4000}
            if not (provider in ("openai", "byok-openai") and re.match(r"^(o\d|gpt-5)", model, re.I)):
                body["temperature"] = r.get("temperature") if r.get("temperature") is not None else 0.4
            if r.get("json") and json_mode:
                body["response_format"] = {"type": "json_object"}
            last: Exception = ProviderError("no usable API key", False)
            for _ in range(max(1, len(keys))):
                key = key_pool.next(provider, keys)
                if not key:
                    break
                try:
                    return _from_choices(_post(f"{base}/chat/completions", {"authorization": f"Bearer {key}", **(extra_headers or {})}, body))
                except ProviderError as e:
                    last = e
                    if e.status == 429:
                        key_pool.limited(provider, key, e.wait_ms or 60_000)
                    elif e.status in (401, 403):
                        key_pool.rejected(provider, key)
                    else:
                        raise
            raise ProviderError(str(last), False, status=getattr(last, "status", None)) if isinstance(last, ProviderError) else last

        out.append(Route(f"{provider}/{model}", provider, model, call))
    return out


def _azure_routes() -> list[Route]:
    a = env().azure

    def call(r):
        body: dict = {"messages": _messages(r), "max_completion_tokens": r.get("maxTokens") or 4000}
        if not re.match(r"^(o\d|gpt-5)", a.deployment, re.I):
            body["temperature"] = r.get("temperature") if r.get("temperature") is not None else 0.4
        if r.get("json"):
            body["response_format"] = {"type": "json_object"}
        url = f"{a.endpoint}/openai/deployments/{quote(a.deployment, safe='')}/chat/completions?api-version={quote(a.api_version, safe='')}"
        return _from_choices(_post(url, {"api-key": a.key}, body))

    return [Route(f"azure/{a.deployment}", "azure", a.deployment, call)]


def _cloudflare_routes() -> list[Route]:
    c = env().cf
    out = []
    for model in c.text_models:
        def call(r, model=model):
            url = f"https://api.cloudflare.com/client/v4/accounts/{c.account_id}/ai/run/{model}"
            j = _post(url, {"authorization": f"Bearer {c.token}"},
                      {"messages": _messages(r), "max_tokens": min(r.get("maxTokens") or 4000, 4096), "temperature": r.get("temperature") if r.get("temperature") is not None else 0.4})
            res = j.get("result") or {}
            out_ = res.get("response")
            if out_ is None and res.get("choices"):  # newer models answer in the OpenAI shape
                out_ = ((res["choices"][0] or {}).get("message") or {}).get("content")
            text = out_ if isinstance(out_, str) else (json.dumps(out_) if out_ else "")
            if not text:
                raise ProviderError("empty reply", False)
            return {"text": text}

        out.append(Route(f"cloudflare/{model}", "cloudflare", model, call))
    return out


# ---------------------------------------------------------------- AWS Bedrock (Converse API)

def _sigv4_headers(method: str, url: str, body: bytes, region: str, service: str, access_key: str, secret: str, token: str = "", now: float | None = None) -> dict:
    """AWS Signature Version 4 for one request, so no AWS SDK is needed."""
    import datetime
    import hashlib
    import hmac
    from urllib.parse import urlparse

    u = urlparse(url)
    t = datetime.datetime.fromtimestamp(now if now is not None else time.time(), datetime.timezone.utc)
    amz, day = t.strftime("%Y%m%dT%H%M%SZ"), t.strftime("%Y%m%d")
    payload = hashlib.sha256(body).hexdigest()
    hdrs = {"host": u.netloc, "x-amz-date": amz, "x-amz-content-sha256": payload}
    if token:
        hdrs["x-amz-security-token"] = token
    names = sorted(hdrs)
    nl = chr(10)
    canon_headers = "".join(f"{k}:{hdrs[k]}{nl}" for k in names)
    signed = ";".join(names)
    canon_path = quote(u.path, safe="/-_.~")
    canonical = nl.join([method, canon_path, u.query, canon_headers, signed, payload])
    scope = f"{day}/{region}/{service}/aws4_request"
    to_sign = nl.join(["AWS4-HMAC-SHA256", amz, scope, hashlib.sha256(canonical.encode()).hexdigest()])

    def h(k: bytes, m: str) -> bytes:
        return hmac.new(k, m.encode(), hashlib.sha256).digest()

    k = h(h(h(h(("AWS4" + secret).encode(), day), region), service), "aws4_request")
    sig = hmac.new(k, to_sign.encode(), hashlib.sha256).hexdigest()
    out = {k_: v for k_, v in hdrs.items() if k_ != "host"}
    out["authorization"] = f"AWS4-HMAC-SHA256 Credential={access_key}/{scope}, SignedHeaders={signed}, Signature={sig}"
    return out


def _bedrock_routes() -> list[Route]:
    a = env().aws
    out = []
    for model in a.models:
        def call(r, model=model):
            body = json.dumps({
                "system": [{"text": r["system"]}],
                "messages": [{"role": "user", "content": [{"text": r["user"]}]}],
                "inferenceConfig": {"maxTokens": r.get("maxTokens") or 4000, "temperature": r.get("temperature") if r.get("temperature") is not None else 0.4},
            }).encode()
            url = f"https://bedrock-runtime.{a.region}.amazonaws.com/model/{quote(model, safe='')}/converse"
            if a.bearer:
                headers = {"authorization": f"Bearer {a.bearer}"}
            else:
                headers = _sigv4_headers("POST", url, body, a.region, "bedrock", a.access_key, a.secret, a.session_token)
            j = _post_raw(url, headers, body)
            parts = (((j.get("output") or {}).get("message") or {}).get("content")) or []
            text = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
            if not text:
                raise ProviderError("empty reply", False)
            if j.get("stopReason") == "max_tokens":
                raise ProviderError("reply was cut off (max tokens)", False)
            u = j.get("usage") or {}
            return {"text": text, "tokensIn": u.get("inputTokens"), "tokensOut": u.get("outputTokens")}

        out.append(Route(f"bedrock/{model}", "bedrock", model, call))
    return out


def _post_raw(url: str, headers: dict, body: bytes) -> dict:
    """POST an already serialised body (the signature covers its exact bytes)."""
    try:
        res = http(url, "POST", {"content-type": "application/json", **headers}, body=body, timeout=tuning["timeout_s"])
    except Exception as e:  # noqa: BLE001
        raise ProviderError(f"network: {e}", True) from None
    if not res.ok:
        raise ProviderError(f"HTTP {res.status} {res.text[:300]}", res.status == 408 or res.status >= 500, status=res.status)
    return res.json()


def routes(order: list[str] | None = None) -> list[Route]:
    """Every configured route, in LLM_ORDER. An order entry may be a provider name or one exact route id."""
    e, i = env(), integrations()
    order = e.llm_order if order is None else order
    L = e.llm
    by: dict[str, Callable[[], list[Route]]] = {
        "azure": lambda: _azure_routes() if i.azure else [],
        "openai": lambda: _compat_routes("openai", L.openai.base, L.openai.keys, L.openai.models, True, "max_completion_tokens") if i.openai else [],
        "gemini": lambda: _compat_routes("gemini", L.gemini.base, L.gemini.keys, L.gemini.models, True, "max_tokens") if i.gemini else [],
        "groq": lambda: _compat_routes("groq", L.groq.base, L.groq.keys, L.groq.models, True, "max_tokens") if i.groq else [],
        "mistral": lambda: _compat_routes("mistral", L.mistral.base, L.mistral.keys, L.mistral.models, True, "max_tokens") if i.mistral else [],
        "openrouter": lambda: _compat_routes("openrouter", L.openrouter.base, L.openrouter.keys, L.openrouter.models, False, "max_tokens",
                                              {"x-title": "WorkLab XC", "http-referer": e.app_url}) if i.openrouter else [],
        "cloudflare": lambda: _cloudflare_routes() if i.cloudflare else [],
        "bedrock": lambda: _bedrock_routes() if i.bedrock else [],
        "ollama": lambda: _compat_routes("ollama", e.ollama.base, ["ollama"], e.ollama.models, True, "max_tokens") if i.ollama else [],
        "compat": lambda: _compat_routes("compat", e.compat.base_url, [e.compat.key] if e.compat.key else ["none"], [e.compat.model],
                                         os.environ.get("COMPAT_LLM_JSON_MODE") == "1", "max_tokens") if i.compat else [],
    }
    seen: set[str] = set()
    out: list[Route] = []
    for entry in order:
        name = entry.split("/")[0]
        for r in (by.get(name, lambda: [])()):
            if (entry == name or r.id == entry) and r.id not in seen:
                seen.add(r.id)
                out.append(r)
    return out


def provider_names(order: list[str] | None = None) -> list[str]:
    seen: list[str] = []
    for r in routes(order):
        if r.provider not in seen:
            seen.append(r.provider)
    return seen


def _call_with_retry(r: Route, req: dict) -> dict:
    last: ProviderError | None = None
    for i in range(tuning["attempts_per_route"]):
        try:
            return r.call(req)
        except Exception as e:  # noqa: BLE001
            last = e if isinstance(e, ProviderError) else ProviderError(str(e), False)
            if not last.retryable:
                break
            sleep(last.retry_after_ms or tuning["backoff_ms"] * 2 ** i + random.random() * 200)
    raise last or ProviderError("unknown", False)


def complete(system: str, user: str, parse: Callable[[str], Any] | None = None, order: list[str] | None = None,
             json_mode: bool = False, max_tokens: int | None = None, temperature: float | None = None,
             images: list[tuple[str, str]] | None = None) -> dict:
    """Runs a prompt down the chain of routes. An invalid reply gets one repair attempt on the same route, then the next
    route is tried; routes that keep failing are skipped for a minute. Returns {value, text, usage}."""
    from . import byok

    uid = byok.current_uid()
    mine = byok.routes_for(uid) if uid else []
    if mine:
        return _complete_on_own_key(uid, mine, system, user, parse, json_mode, max_tokens, temperature, images)
    chain = routes(order)
    if not chain:
        raise ApiError(503, "ai_not_configured", "No AI provider is configured on the server.")
    if images:
        chain = [r for r in chain if r.provider in VISION_PROVIDERS]
        if not chain:
            raise ApiError(503, "vision_unavailable", "Reading handwriting needs an AI provider that can see images (OpenAI, Azure OpenAI or Gemini). None is set up on this server.")
    parse = parse or (lambda t: t)
    base = {"system": system, "user": user, "json": json_mode, "maxTokens": max_tokens, "temperature": temperature, "images": images}
    errors: list[str] = []
    for route in chain:
        if breaker.open(route.id):
            errors.append(f"{route.id}: skipped (cooling down)")
            continue
        req = base
        for repair in range(2):
            try:
                out = _call_with_retry(route, req)
                try:
                    value = parse(out["text"])
                except Exception as e:  # noqa: BLE001
                    if repair == 0:
                        req = {**base, "user": f"{user}\n\nYour previous reply was rejected: {e}\nReply again with ONLY the corrected JSON."}
                        continue
                    raise ProviderError(f"invalid output: {e}", False) from None
                breaker.ok(route.id)
                return {"value": value, "text": out["text"],
                        "usage": {"provider": route.provider, "model": route.model, "tokensIn": out.get("tokensIn"), "tokensOut": out.get("tokensOut")}}
            except Exception as e:  # noqa: BLE001
                errors.append(f"{route.id}: {e}")
                breaker.fail(route.id)
                break
    log("warn", "llm.all_providers_failed", errors=errors)
    try:
        from . import alerts
        alerts.notify("ai_down", "Every AI provider failed for a request.", errors="; ".join(errors)[:600])
    except Exception:  # noqa: BLE001
        pass
    raise ApiError(503, "ai_unavailable", "The AI service is busy right now. Try again in a minute.")


def _complete_on_own_key(uid: str, chain: list[Route], system: str, user: str, parse, json_mode: bool, max_tokens, temperature, images) -> dict:
    """The learner connected their own AI key: every request goes to their provider, never to ours, and a refusal is shown to them plainly."""
    from . import byok

    if images:
        chain = [r for r in chain if r.provider in VISION_PROVIDERS]
        if not chain:
            raise ApiError(422, "byok_no_vision", "Reading photos needs an AI provider that can see images. Connect OpenAI, Gemini or OpenRouter, or remove your key to use ours.")
    parse = parse or (lambda t: t)
    base = {"system": system, "user": user, "json": json_mode, "maxTokens": max_tokens, "temperature": temperature, "images": images}
    route = chain[0]
    req = base
    for repair in range(2):
        try:
            out = _call_with_retry(route, req)
            try:
                value = parse(out["text"])
            except Exception as e:  # noqa: BLE001
                if repair == 0:
                    req = {**base, "user": f"{user}\n\nYour previous reply was rejected: {e}\nReply again with ONLY the corrected JSON."}
                    continue
                raise ProviderError(f"invalid output: {e}", False) from None
            byok.note_ok(uid)
            return {"value": value, "text": out["text"], "usage": {"provider": route.provider, "model": route.model, "tokensIn": out.get("tokensIn"), "tokensOut": out.get("tokensOut")}}
        except Exception as e:  # noqa: BLE001
            status = getattr(e, "status", None)
            byok.note_failure(uid, status, str(e))
            if status in (401, 403):
                raise ApiError(402, "byok_rejected", "Your AI provider no longer accepts your key, so it has been switched off. Add a new key in Settings, or continue on the normal limits.") from None
            if status == 429:
                raise ApiError(429, "byok_rate_limited", "Your AI provider says you are going too fast or are out of quota. Wait a minute, or check your plan with them.") from None
            raise ApiError(502, "byok_failed", f"Your AI provider could not answer: {byok.clean_error(str(e))}") from None
    raise ApiError(502, "byok_failed", "Your AI provider could not answer.")


def complete_json(system: str, user: str, validate: Callable[[Any], Any], order: list[str] | None = None,
                  max_tokens: int | None = None, temperature: float | None = None, images: list[tuple[str, str]] | None = None) -> dict:
    return complete(system, user, lambda t: validate(extract_json(t)), order, True, max_tokens, temperature, images)


def diagnose(order: list[str] | None = None) -> list[dict]:
    """Sends one tiny prompt down every configured route on its own, so the owner can see which keys and models really work."""
    out = []
    for r in routes(order):
        t0 = time.time()
        try:
            res = _call_with_retry(r, {"system": "Reply with the single word: ok", "user": "ping", "json": False, "maxTokens": 400, "temperature": 0, "images": None})
            out.append({"route": r.id, "ok": True, "ms": int((time.time() - t0) * 1000), "reply": (res.get("text") or "")[:40]})
        except Exception as e:  # noqa: BLE001
            out.append({"route": r.id, "ok": False, "ms": int((time.time() - t0) * 1000), "error": str(e)[:200]})
    return out


def overview() -> dict:
    """What is set up, in the order it will be tried (no keys, no secrets)."""
    e = env()
    return {"order": e.llm_order, "routes": [{"id": r.id, "provider": r.provider, "model": r.model, "cooling": breaker.open(r.id)} for r in routes()]}
