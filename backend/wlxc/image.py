"""Illustration generation through a chain of image models; the first valid PNG/JPEG/WebP wins."""
from __future__ import annotations

import base64
import json
import random
import re
from urllib.parse import quote

from .config import env, integrations
from .errors import ApiError
from .llm import breaker
from .net import http
from .web import log


def sniff(b: bytes) -> str | None:
    if len(b) > 8 and b[:4] == b"\x89PNG":
        return "image/png"
    if len(b) > 3 and b[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if len(b) > 12 and b[:2] == b"RI" and b[8:10] == b"WE":
        return "image/webp"
    return None


def _bytes_from(res) -> bytes:
    if not res.ok:
        raise RuntimeError(f"HTTP {res.status}")
    if "json" in (res.headers.get("content-type") or ""):
        j = res.json()
        b64 = (j.get("result") or {}).get("image") or j.get("image")
        if not b64:
            raise RuntimeError("no image in reply")
        return base64.b64decode(b64)
    return res.content


def _cloudflare_run(model, prompt, w, h):
    c = env().cf
    body = {"prompt": prompt, "steps": 4} if re.search("flux", model, re.I) else {"prompt": prompt, "width": w, "height": h}
    return _bytes_from(http(f"https://api.cloudflare.com/client/v4/accounts/{c.account_id}/ai/run/{model}", "POST",
                            {"authorization": f"Bearer {c.token}", "content-type": "application/json"}, json_body=body, timeout=45))


def _hf_run(model, prompt, w, h):
    hf = env().hf
    return _bytes_from(http(f"{hf.base}/{model}", "POST", {"authorization": f"Bearer {hf.token}", "content-type": "application/json", "accept": "image/png"},
                            json_body={"inputs": prompt}, timeout=60))


def _pollinations_run(model, prompt, w, h):
    u = f"https://image.pollinations.ai/prompt/{quote(prompt, safe='')}?width={w}&height={h}&nologo=true&model={model}&seed={random.randrange(10**6)}"
    return _bytes_from(http(u, "GET", {"accept": "image/*"}, timeout=60))


def _b64_images(res) -> bytes:
    if not res.ok:
        raise RuntimeError(f"HTTP {res.status} {res.text[:200]}")
    d = (res.json().get("data") or [None])[0] or {}
    if d.get("b64_json"):
        return base64.b64decode(d["b64_json"])
    if d.get("url"):
        got = http(d["url"], "GET", timeout=60)
        if got.ok:
            return got.content
    raise RuntimeError("no image in reply")


def _size_for(model: str, w: int, h: int) -> str:
    """The sizes the OpenAI image models accept."""
    wide, tall = w > h * 1.15, h > w * 1.15
    if re.match(r"dall-e-3", model, re.I):
        return "1792x1024" if wide else "1024x1792" if tall else "1024x1024"
    return "1536x1024" if wide else "1024x1536" if tall else "1024x1024"


def _quality_for(model: str, quality: str) -> str:
    if re.match(r"dall-e-3", model, re.I):
        return "hd" if quality == "high" else "standard"
    return {"high": "high", "low": "low"}.get(quality, "medium")


def _azure_run(model, prompt, w, h, quality="medium"):
    a = env().azure
    body = {"prompt": prompt, "size": _size_for(model, w, h), "n": 1, "quality": _quality_for(model, quality)}
    if re.match(r"dall-e", model, re.I):
        body["response_format"] = "b64_json"
    url = f"{a.endpoint}/openai/deployments/{quote(model, safe='')}/images/generations?api-version={quote(a.image_api_version, safe='')}"
    return _b64_images(http(url, "POST", {"api-key": a.key, "content-type": "application/json"}, json_body=body, timeout=120))


def _openai_run(model, prompt, w, h, quality="medium", key=None):
    o = env().llm.openai
    body = {"model": model, "prompt": prompt, "size": _size_for(model, w, h), "n": 1, "quality": _quality_for(model, quality)}
    if re.match(r"dall-e", model, re.I):
        body["response_format"] = "b64_json"
    return _b64_images(http(f"{o.base}/images/generations", "POST", {"authorization": f"Bearer {key or o.keys[0]}", "content-type": "application/json"}, json_body=body, timeout=120))


def _gemini_run(model, prompt, w, h, quality="medium", key=None):
    g = env().llm.gemini
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{quote(model, safe='')}:generateContent"
    res = http(url, "POST", {"x-goog-api-key": key or g.keys[0], "content-type": "application/json"},
               json_body={"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}}, timeout=90)
    if not res.ok:
        raise RuntimeError(f"HTTP {res.status} {res.text[:200]}")
    for cand in res.json().get("candidates") or []:
        for part in (cand.get("content") or {}).get("parts") or []:
            blob = part.get("inlineData") or part.get("inline_data")
            if blob and blob.get("data"):
                return base64.b64decode(blob["data"])
    raise RuntimeError("no image in reply")


ADVANCED = {"azure", "openai", "gemini"}  # paid or key-gated image models that take a quality setting


PROVIDERS = {
    "azure": (lambda: bool(env().azure.endpoint and env().azure.key and env().azure.image_deployment), lambda: [env().azure.image_deployment], _azure_run),
    "openai": (lambda: bool(env().llm.openai.keys), lambda: [env().llm.openai.image_model], _openai_run),
    "gemini": (lambda: bool(env().llm.gemini.keys), lambda: [env().llm.gemini.image_model], _gemini_run),
    "cloudflare": (lambda: integrations().cloudflare, lambda: env().cf.image_models, _cloudflare_run),
    "huggingface": (lambda: integrations().huggingface, lambda: env().hf.image_models, _hf_run),
    "pollinations": (lambda: env().pollinations, lambda: ["flux"], _pollinations_run),
}


def slide_prompt(subject: str) -> str:
    return (f"Clean educational illustration of: {re.sub(r'[\\r\\n]+', ' ', subject)[:300]}. "
            "Flat vector style, simple shapes, soft colours, white background, no text, no letters, no watermark.")


def canvas_prompt(subject: str) -> str:
    return (f"A clear, beautiful explanatory illustration of: {re.sub(r'[\r\n]+', ' ', subject)[:300]}. "
            "Friendly textbook style, soft colours, clean composition, labelled shapes are not needed, no text, no letters, no watermark.")


CHEAP_FIRST = ["cloudflare", "huggingface", "pollinations", "gemini", "openai", "azure"]  # free or cheapest models first


def generate_image(prompt: str, width: int = 1024, height: int = 576, order: list[str] | None = None, quality: str = "low") -> dict:
    """Tries every configured image model in order and returns the first valid image. Raises 503 when every model fails."""
    errors = []
    from . import byok

    uid = byok.current_uid()
    own = byok.credentials(uid) if uid else None
    if own and own[0]["provider"] in ("openai", "gemini"):
        # the learner's own account draws the picture; if it cannot, the free models below still can
        pid = own[0]["provider"]
        model = PROVIDERS[pid][1]()[0]
        try:
            data = PROVIDERS[pid][2](model, prompt, width, height, quality, key=own[1])
            mime = sniff(data)
            if not mime:
                raise RuntimeError("reply was not an image")
            return {"bytes": data, "mime": mime, "provider": f"byok-{pid}", "model": model}
        except Exception as e:  # noqa: BLE001
            errors.append(f"byok-{pid}/{model}: {byok.clean_error(str(e), own[1])}")
    for pid in order or CHEAP_FIRST:
        p = PROVIDERS.get(pid)
        if not p or not p[0]():
            continue
        if own and pid in ADVANCED:
            continue  # their picture is not charged to our paid image accounts
        for model in p[1]():
            key = f"img:{pid}:{model}"
            if breaker.open(key):
                continue
            try:
                data = p[2](model, prompt, width, height, quality) if pid in ADVANCED else p[2](model, prompt, width, height)
                mime = sniff(data)
                if not mime:
                    raise RuntimeError("reply was not an image")
                breaker.ok(key)
                return {"bytes": data, "mime": mime, "provider": pid, "model": model}
            except Exception as e:  # noqa: BLE001
                breaker.fail(key)
                errors.append(f"{pid}/{model}: {e}")
    log("warn", "image.all_failed", errors=errors)
    raise ApiError(503, "image_unavailable", "Image generation is busy right now. Try again shortly.")
