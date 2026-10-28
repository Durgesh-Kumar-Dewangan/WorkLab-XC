"""Bring your own key: a learner can connect their own AI account, and then every AI feature runs on it instead of ours.

What is kept: the provider, an optional model name, and the key itself, encrypted with a key derived from the server secret.
The key is never sent back to the browser (only its last four characters), never logged and never shown to staff.
Only the providers listed in PROVIDERS can be used, each at its own fixed address, so a key cannot be pointed at any other server.
While a key works, the learner's own limits do not apply (the cost is theirs); if the provider rejects it, it is switched off."""
from __future__ import annotations

import base64
import hashlib
import re
import time
from contextlib import contextmanager
from contextvars import ContextVar

from .config import session_secret
from .errors import ApiError
from .store import get_store

COLLECTION = "usercreds"

# id -> label, fixed address, default model, how the reply is asked for, whether it can make pictures, where to get a key, and whether it has a free tier
PROVIDERS: dict[str, dict] = {
    "gemini": {"label": "Google Gemini", "base": "https://generativelanguage.googleapis.com/v1beta/openai", "model": "gemini-flash-latest", "json": True, "tokens": "max_tokens",
               "images": True, "vision": True, "free": True, "url": "https://aistudio.google.com/apikey", "hint": "AIza…"},
    "groq": {"label": "Groq", "base": "https://api.groq.com/openai/v1", "model": "llama-3.3-70b-versatile", "json": True, "tokens": "max_tokens",
             "images": False, "vision": False, "free": True, "url": "https://console.groq.com/keys", "hint": "gsk_…"},
    "openrouter": {"label": "OpenRouter", "base": "https://openrouter.ai/api/v1", "model": "meta-llama/llama-3.3-70b-instruct:free", "json": False, "tokens": "max_tokens",
                   "images": False, "vision": True, "free": True, "url": "https://openrouter.ai/keys", "hint": "sk-or-…"},
    "openai": {"label": "OpenAI", "base": "https://api.openai.com/v1", "model": "gpt-4o-mini", "json": True, "tokens": "max_completion_tokens",
               "images": True, "vision": True, "free": False, "url": "https://platform.openai.com/api-keys", "hint": "sk-…"},
    "anthropic": {"label": "Anthropic Claude", "base": "https://api.anthropic.com/v1", "model": "claude-haiku-5-5", "json": False, "tokens": "max_tokens",
                  "images": False, "vision": False, "free": False, "url": "https://console.anthropic.com/settings/keys", "hint": "sk-ant-…"},
    "mistral": {"label": "Mistral", "base": "https://api.mistral.ai/v1", "model": "mistral-small-latest", "json": True, "tokens": "max_tokens",
                "images": False, "vision": False, "free": True, "url": "https://console.mistral.ai/api-keys", "hint": ""},
}

_KEY = re.compile(r"^[A-Za-z0-9_\-.:=+/]{12,400}$")
_MODEL = re.compile(r"^[A-Za-z0-9_\-.:/@]{1,80}$")

# which kinds of usage stop counting while a working key is connected
TEXT_KINDS = {"jobs", "sessions", "chat", "answers", "exam", "gen", "canvas", "studyai", "freechat", "freenotes", "classroom"}

_uid: ContextVar[str | None] = ContextVar("wlxc_ai_user", default=None)
_cache: dict[str, tuple[float, dict | None]] = {}


# ---------------------------------------------------------------- who is asking

def current_uid() -> str | None:
    return _uid.get()


@contextmanager
def as_user(uid: str | None):
    """Everything inside runs as this learner, so the AI calls it makes use their key when they have one."""
    token = _uid.set(uid)
    try:
        yield
    finally:
        _uid.reset(token)


# ---------------------------------------------------------------- keeping the key

def _fernet():
    from cryptography.fernet import Fernet

    raw = hashlib.sha256(b"wlxc-byok-v1:" + session_secret().encode()).digest()
    return Fernet(base64.urlsafe_b64encode(raw))


def _seal(key: str) -> str:
    return _fernet().encrypt(key.encode()).decode()


def _open(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except Exception:  # noqa: BLE001  - the secret changed or the record is damaged: treat as no key
        return None


def clean_error(text: str, key: str = "") -> str:
    """A provider's error message, with the key (and anything that looks like one) taken out and cut short."""
    t = str(text or "")
    if key:
        t = t.replace(key, "…")
    t = re.sub(r"(sk-|AIza|gsk_|xai-)[A-Za-z0-9_\-]{6,}", "…", t)
    return t[:220]


def _doc(uid: str) -> dict | None:
    now = time.time()
    hit = _cache.get(uid)
    if hit and hit[0] > now:
        return hit[1]
    d = get_store().get(COLLECTION, uid)
    _cache[uid] = (now + 20, d)
    return d


def _forget(uid: str) -> None:
    _cache.pop(uid, None)


def active(uid: str | None) -> bool:
    d = _doc(uid) if uid else None
    return bool(d and d.get("status") == "active")


def covers(uid: str | None, kind: str) -> bool:
    """True when this kind of usage is on the learner's own key, so our limit does not apply to it."""
    if not uid or not active(uid):
        return False
    if kind == "images":
        return bool(PROVIDERS.get(_doc(uid)["provider"], {}).get("images"))
    return kind in TEXT_KINDS


def public(uid: str) -> dict:
    """What the learner may see: never the key."""
    d = get_store().get(COLLECTION, uid)
    base = {"providers": [{"id": k, "label": v["label"], "model": v["model"], "free": v["free"], "url": v["url"], "hint": v["hint"], "images": v["images"]} for k, v in PROVIDERS.items()]}
    if not d:
        return {**base, "connected": False}
    return {**base, "connected": d.get("status") == "active", "status": d.get("status"), "provider": d["provider"], "model": d.get("model") or PROVIDERS[d["provider"]]["model"],
            "last4": d.get("last4", ""), "added": d.get("added"), "checked": d.get("checked"), "error": d.get("error", "")}


def credentials(uid: str) -> tuple[dict, str] | None:
    """(settings, key) for a learner with a working key, or None."""
    d = _doc(uid)
    if not d or d.get("status") != "active":
        return None
    key = _open(d.get("keyEnc", ""))
    if not key:
        return None
    return d, key


# ---------------------------------------------------------------- routes for the AI chain

def routes_for(uid: str):
    """The learner's own route(s) for llm.complete, or [] when they have none."""
    from . import llm

    got = credentials(uid)
    if not got:
        return []
    d, key = got
    p = PROVIDERS[d["provider"]]
    extra = {"x-title": "WorkLab XC"} if d["provider"] == "openrouter" else None
    return llm._compat_routes(f"byok-{d['provider']}", p["base"], [key], [d.get("model") or p["model"]], p["json"], p["tokens"], extra)


def note_failure(uid: str, status: int | None, message: str) -> None:
    """A key the provider refuses is switched off, so the learner is told and goes back to the normal limits."""
    rejected = status in (401, 403)
    msg = clean_error(message)

    def fn(c):
        if not c:
            return c
        return {**c, "status": "rejected" if rejected else c.get("status"), "error": msg, "checked": time.time() * 1000}

    get_store().update(COLLECTION, uid, fn)
    if rejected:
        _set_flag(uid, False)
    _forget(uid)


def note_ok(uid: str) -> None:
    d = _doc(uid)
    if d and (d.get("error") or not d.get("checked") or time.time() * 1000 - d["checked"] > 3_600_000):
        get_store().update(COLLECTION, uid, lambda c: {**c, "error": "", "checked": time.time() * 1000} if c else c)
        _forget(uid)


def _set_flag(uid: str, on: bool) -> None:
    get_store().update("users", uid, lambda c: {**c, "byok": on} if c else c)


# ---------------------------------------------------------------- the three things a learner can do

def connect(uid: str, provider: str, key: str, model: str = "") -> dict:
    p = PROVIDERS.get(provider)
    if not p:
        raise ApiError(422, "bad_provider", "Choose one of the listed AI providers.")
    key = (key or "").strip()
    if not _KEY.match(key):
        raise ApiError(422, "bad_key", "That does not look like an API key. Copy it again from your provider, with nothing around it.")
    model = (model or "").strip()
    if model and not _MODEL.match(model):
        raise ApiError(422, "bad_model", "That model name has characters we cannot use.")
    from . import llm

    route = llm._compat_routes(f"byok-{provider}", p["base"], [key], [model or p["model"]], p["json"], p["tokens"],
                               {"x-title": "WorkLab XC"} if provider == "openrouter" else None)[0]
    try:
        llm._call_with_retry(route, {"system": "Reply with the single word: ok", "user": "ping", "json": False, "maxTokens": 400, "temperature": 0, "images": None})
    except Exception as e:  # noqa: BLE001
        status = getattr(e, "status", None)
        why = ("The provider did not accept that key (or that model name). Check that the key is copied in full and still active." if status in (400, 401, 403, 404)
               else "That key works, but the provider says you are out of quota or going too fast. Try again in a minute, or check your plan with them." if status == 429
               else "The provider could not be reached or did not accept that model. Check the model name and try again.")
        raise ApiError(422, "key_rejected", why, {"detail": clean_error(str(e), key)}) from None
    now = time.time() * 1000
    get_store().put(COLLECTION, uid, {"id": uid, "uid": uid, "provider": provider, "model": model, "keyEnc": _seal(key), "last4": key[-4:], "status": "active",
                                      "added": now, "checked": now, "error": ""})
    _set_flag(uid, True)
    _forget(uid)
    return public(uid)


def disconnect(uid: str) -> dict:
    get_store().delete(COLLECTION, uid)
    _set_flag(uid, False)
    _forget(uid)
    return public(uid)
