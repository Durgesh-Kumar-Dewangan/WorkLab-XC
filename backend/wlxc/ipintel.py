"""VPN / proxy / Tor detection. Best effort only: a residential VPN is not detected and shared school or mobile
addresses can be flagged, so paid accounts are exempt by default and the allow-list lets a school through."""
from __future__ import annotations

import re
import time
from urllib.parse import quote

from .auth import effective_plan
from .config import env
from .errors import ApiError
from .net import http
from .store import get_store
from .web import Req, client_ip, log

PRIVATE = re.compile(r"^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc|fd|unknown$|localhost$)", re.I)


def allowed(ip: str) -> bool:
    return any(a == ip or (a.endswith("*") and ip.startswith(a[:-1])) for a in env().ipintel.allowlist)


def _get(url: str) -> dict:
    r = http(url, timeout=4)
    if not r.ok:
        raise RuntimeError(f"HTTP {r.status}")
    return r.json()


def _lookup(ip: str) -> dict:
    provider, key = env().ipintel.provider, env().ipintel.key
    q = lambda s: quote(s, safe="")  # noqa: E731
    if provider == "ipqs":
        j = _get(f"https://ipqualityscore.com/api/json/ip/{q(key)}/{q(ip)}?strictness=1&allow_public_access_points=true")
        if j.get("success") is False:
            raise RuntimeError(str(j.get("message", "lookup failed")))
        return dict(vpn=bool(j.get("vpn") or j.get("active_vpn")), proxy=bool(j.get("proxy")), tor=bool(j.get("tor") or j.get("active_tor")), hosting=False, source=provider)
    if provider == "ipapi":
        j = _get(f"https://api.ipapi.is/?q={q(ip)}" + (f"&key={q(key)}" if key else ""))
        return dict(vpn=bool(j.get("is_vpn")), proxy=bool(j.get("is_proxy")), tor=bool(j.get("is_tor")), hosting=bool(j.get("is_datacenter")), source=provider)
    if provider == "proxycheck":
        j = _get(f"https://proxycheck.io/v2/{q(ip)}?vpn=1" + (f"&key={q(key)}" if key else ""))
        row = j.get(ip) or {}
        yes = row.get("proxy") == "yes"
        typ = str(row.get("type", "")).lower()
        return dict(vpn=yes and "vpn" in typ, proxy=yes and "vpn" not in typ and "tor" not in typ, tor=yes and "tor" in typ, hosting=False, source=provider)
    raise RuntimeError("no provider")


def verdict_for(ip: str) -> dict | None:
    """Cached verdict for an address. None when no provider is set, the address is private or allow-listed, or the lookup failed."""
    c = env().ipintel
    if c.provider == "none" or PRIVATE.search(ip) or allowed(ip):
        return None
    st = get_store()
    hit = st.get("ipverdicts", ip)
    if hit and time.time() * 1000 - hit["at"] < c.cache_hours * 3600_000:
        return hit
    try:
        v = {**_lookup(ip), "at": time.time() * 1000}
        st.put("ipverdicts", ip, v)
        return v
    except Exception as e:  # noqa: BLE001
        log("warn", "ipintel.lookup_failed", err=str(e)[:160])
        if c.fail_closed:
            raise ApiError(403, "vpn_check_failed", "We could not check your network right now. Try again in a minute.") from None
        return None


def assert_no_vpn(req: Req, user: dict | None, scope: str = "generation") -> None:
    c = env().ipintel
    if c.provider == "none" or c.policy == "off":
        return
    if scope == "auth" and c.policy != "all":
        return
    if user and c.paid_exempt and effective_plan(user) != "prototype":
        return
    v = verdict_for(client_ip(req))
    if v and (v["vpn"] or v["proxy"] or v["tor"] or v["hosting"]):
        raise ApiError(403, "vpn_blocked", "We can’t start this over a VPN, proxy or Tor connection. Turn it off and try again. On a school network, ask your school to contact support.",
                       {"appeal": env().mail.support})
