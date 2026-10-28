"""Where a visitor is, to the country and state: used to pick the regional price and to draw the admin globe.

The country comes from the CDN or proxy in front of the app when it sends one (Cloudflare, CloudFront, Vercel, Google), and otherwise from a
cached lookup of the IP address. Only the country, state and a rounded position (to about 11 km) are kept, never the address itself."""
from __future__ import annotations

import time
from urllib.parse import quote

from .config import env
from .net import http
from .store import get_store
from .web import Req, client_ip, log

# iso code: (name, latitude, longitude of a point near the middle of the country)
COUNTRIES: dict[str, tuple[str, float, float]] = {
    "IN": ("India", 22.5, 79.0), "US": ("United States", 39.8, -98.6), "GB": ("United Kingdom", 54.0, -2.5), "CA": ("Canada", 56.1, -106.3),
    "AU": ("Australia", -25.7, 134.5), "NZ": ("New Zealand", -41.5, 172.8), "IE": ("Ireland", 53.4, -8.1), "DE": ("Germany", 51.2, 10.4),
    "FR": ("France", 46.6, 2.3), "ES": ("Spain", 40.2, -3.6), "PT": ("Portugal", 39.6, -8.0), "IT": ("Italy", 42.8, 12.6), "NL": ("Netherlands", 52.2, 5.5),
    "BE": ("Belgium", 50.6, 4.6), "CH": ("Switzerland", 46.8, 8.2), "AT": ("Austria", 47.6, 14.1), "SE": ("Sweden", 62.0, 15.0), "NO": ("Norway", 64.5, 11.5),
    "DK": ("Denmark", 56.0, 10.0), "FI": ("Finland", 64.0, 26.0), "IS": ("Iceland", 64.9, -18.6), "PL": ("Poland", 52.0, 19.4), "CZ": ("Czechia", 49.8, 15.5),
    "SK": ("Slovakia", 48.7, 19.5), "HU": ("Hungary", 47.2, 19.4), "RO": ("Romania", 45.9, 25.0), "BG": ("Bulgaria", 42.7, 25.5), "GR": ("Greece", 39.0, 22.0),
    "HR": ("Croatia", 45.1, 15.2), "RS": ("Serbia", 44.0, 21.0), "UA": ("Ukraine", 49.0, 31.4), "RU": ("Russia", 61.5, 99.0), "TR": ("Turkey", 39.0, 35.2),
    "IL": ("Israel", 31.0, 34.9), "AE": ("United Arab Emirates", 24.0, 54.0), "SA": ("Saudi Arabia", 24.0, 45.0), "QA": ("Qatar", 25.3, 51.2), "KW": ("Kuwait", 29.3, 47.5),
    "OM": ("Oman", 21.5, 55.9), "BH": ("Bahrain", 26.0, 50.5), "JO": ("Jordan", 31.2, 36.5), "LB": ("Lebanon", 33.9, 35.9), "IQ": ("Iraq", 33.0, 44.0),
    "IR": ("Iran", 32.4, 53.7), "EG": ("Egypt", 26.8, 30.8), "MA": ("Morocco", 31.8, -7.1), "DZ": ("Algeria", 28.0, 2.6), "TN": ("Tunisia", 34.0, 9.5),
    "NG": ("Nigeria", 9.1, 8.7), "GH": ("Ghana", 7.9, -1.0), "KE": ("Kenya", 0.0, 37.9), "ET": ("Ethiopia", 9.1, 40.5), "TZ": ("Tanzania", -6.4, 34.9),
    "UG": ("Uganda", 1.4, 32.3), "ZA": ("South Africa", -29.0, 24.0), "ZW": ("Zimbabwe", -19.0, 29.2), "ZM": ("Zambia", -13.1, 27.8), "SN": ("Senegal", 14.5, -14.5),
    "CM": ("Cameroon", 5.7, 12.7), "CI": ("Cote d'Ivoire", 7.5, -5.5), "PK": ("Pakistan", 30.4, 69.3), "BD": ("Bangladesh", 23.7, 90.4), "LK": ("Sri Lanka", 7.9, 80.8),
    "NP": ("Nepal", 28.4, 84.1), "BT": ("Bhutan", 27.5, 90.4), "MV": ("Maldives", 3.2, 73.2), "AF": ("Afghanistan", 33.9, 67.7), "CN": ("China", 35.9, 104.2),
    "HK": ("Hong Kong", 22.3, 114.2), "TW": ("Taiwan", 23.7, 121.0), "JP": ("Japan", 36.2, 138.3), "KR": ("South Korea", 36.5, 127.9), "MN": ("Mongolia", 46.9, 103.8),
    "SG": ("Singapore", 1.35, 103.8), "MY": ("Malaysia", 4.2, 102.0), "TH": ("Thailand", 15.9, 100.9), "VN": ("Vietnam", 14.1, 108.3), "ID": ("Indonesia", -2.5, 118.0),
    "PH": ("Philippines", 12.9, 121.8), "KH": ("Cambodia", 12.6, 104.9), "MM": ("Myanmar", 21.9, 96.0), "LA": ("Laos", 19.9, 102.5), "KZ": ("Kazakhstan", 48.0, 66.9),
    "UZ": ("Uzbekistan", 41.4, 64.6), "MX": ("Mexico", 23.6, -102.5), "GT": ("Guatemala", 15.8, -90.2), "CR": ("Costa Rica", 9.7, -83.8), "PA": ("Panama", 8.5, -80.8),
    "CU": ("Cuba", 21.5, -77.8), "DO": ("Dominican Republic", 18.7, -70.2), "JM": ("Jamaica", 18.1, -77.3), "CO": ("Colombia", 4.6, -74.3), "VE": ("Venezuela", 6.4, -66.6),
    "EC": ("Ecuador", -1.8, -78.2), "PE": ("Peru", -9.2, -75.0), "BO": ("Bolivia", -16.3, -63.6), "BR": ("Brazil", -14.2, -51.9), "PY": ("Paraguay", -23.4, -58.4),
    "UY": ("Uruguay", -32.5, -55.8), "AR": ("Argentina", -38.4, -63.6), "CL": ("Chile", -35.7, -71.5), "MU": ("Mauritius", -20.3, 57.6), "FJ": ("Fiji", -17.7, 178.1),
}
HEADERS = ("cf-ipcountry", "cloudfront-viewer-country", "x-vercel-ip-country", "x-appengine-country", "x-country-code")
REGION_HEADERS = ("cf-region-code", "cloudfront-viewer-country-region", "x-vercel-ip-country-region", "x-appengine-region")
DAY_MS = 86_400_000
ONLINE_MS = 3 * 60_000  # someone whose app has checked in during the last three minutes is online
BEAT_MS = 25_000


def _clean(c: str) -> str:
    c = (c or "").strip().upper()
    return c if len(c) == 2 and c.isalpha() and c not in ("XX", "T1") else ""


def _lookup(ip: str) -> dict | None:
    """A cached lookup by address. Free and keyless; returns nothing for private addresses or when the service is down."""
    from .ipintel import PRIVATE
    if PRIVATE.search(ip):
        return None
    st = get_store()
    hit = st.get("geoips", ip)
    if hit and time.time() * 1000 - hit["at"] < 7 * DAY_MS:
        return hit or None
    try:
        r = http(f"https://api.ipapi.is/?q={quote(ip, safe='')}", timeout=3)
        loc = (r.json() if r.ok else {}).get("location") or {}
        v = {"country": _clean(loc.get("country_code", "")), "region": str(loc.get("state") or "")[:60], "lat": loc.get("latitude"), "lon": loc.get("longitude"), "at": time.time() * 1000}
    except Exception as e:  # noqa: BLE001  - a lookup failure must never block a page or a payment
        log("warn", "geo.lookup_failed", err=str(e)[:120])
        return None
    st.put("geoips", ip, {"id": ip, **v})
    return v


def detect(req: Req) -> dict | None:
    h = req.headers
    for k in HEADERS:
        c = _clean(h.get(k, ""))
        if c:
            region = next((str(h.get(r, ""))[:60] for r in REGION_HEADERS if h.get(r)), "")
            return {"country": c, "region": region, "lat": None, "lon": None, "via": "network"}
    ip = client_ip(req)
    v = _lookup(ip) if ip != "unknown" else None
    return {**v, "via": "ip"} if v and v.get("country") else None


def _coarse(v) -> float | None:
    try:
        return round(float(v), 1)
    except (TypeError, ValueError):
        return None


def record(user: dict, req: Req) -> dict:
    """Keeps the learner's latest country and state on their account, refreshed at most once a day."""
    cur = user.get("geo") or {}
    now = time.time() * 1000
    if cur and now - cur.get("at", 0) < DAY_MS:
        return cur
    d = detect(req)
    if not d:
        return cur
    geo = {"country": d["country"], "region": d["region"], "lat": _coarse(d["lat"]), "lon": _coarse(d["lon"]), "at": now}
    get_store().update("users", user["id"], lambda c: {**c, "geo": geo} if c else c)
    return geo


def heartbeat(user: dict, req: Req) -> dict:
    """The app tells us it is open. Remembers when, and refreshes where the person is."""
    now = time.time() * 1000
    if now - (user.get("lastSeen") or 0) >= BEAT_MS:
        get_store().update("users", user["id"], lambda c: {**c, "lastSeen": now} if c else c)
    record(user, req)
    return {"ok": True}


def country_for(req: Req, user: dict | None = None) -> str:
    """The country to price for. The same answer the pricing page showed, so what a visitor saw is what they are charged."""
    return resolve(req, user)[0]


# the browser's own clock, as a last resort when nothing on the connection says where it is (a local test, a private network)
TZ = {"Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Los_Angeles": "US", "America/Phoenix": "US",
      "America/Anchorage": "US", "Pacific/Honolulu": "US", "America/Toronto": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA", "America/Halifax": "CA",
      "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Berlin": "DE", "Europe/Paris": "FR", "Europe/Madrid": "ES", "Europe/Lisbon": "PT", "Europe/Rome": "IT",
      "Europe/Amsterdam": "NL", "Europe/Brussels": "BE", "Europe/Zurich": "CH", "Europe/Vienna": "AT", "Europe/Stockholm": "SE", "Europe/Oslo": "NO",
      "Europe/Copenhagen": "DK", "Europe/Helsinki": "FI", "Europe/Warsaw": "PL", "Europe/Prague": "CZ", "Europe/Budapest": "HU", "Europe/Bucharest": "RO",
      "Europe/Athens": "GR", "Europe/Istanbul": "TR", "Europe/Kiev": "UA", "Europe/Kyiv": "UA", "Europe/Moscow": "RU", "Asia/Dubai": "AE", "Asia/Riyadh": "SA",
      "Asia/Qatar": "QA", "Asia/Kuwait": "KW", "Asia/Tehran": "IR", "Asia/Karachi": "PK", "Asia/Dhaka": "BD", "Asia/Colombo": "LK", "Asia/Kathmandu": "NP",
      "Asia/Bangkok": "TH", "Asia/Ho_Chi_Minh": "VN", "Asia/Jakarta": "ID", "Asia/Manila": "PH", "Asia/Kuala_Lumpur": "MY", "Asia/Singapore": "SG",
      "Asia/Hong_Kong": "HK", "Asia/Shanghai": "CN", "Asia/Taipei": "TW", "Asia/Tokyo": "JP", "Asia/Seoul": "KR", "Asia/Jerusalem": "IL",
      "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Brisbane": "AU", "Australia/Perth": "AU", "Pacific/Auckland": "NZ",
      "Africa/Cairo": "EG", "Africa/Lagos": "NG", "Africa/Nairobi": "KE", "Africa/Johannesburg": "ZA", "Africa/Casablanca": "MA", "Africa/Accra": "GH",
      "America/Mexico_City": "MX", "America/Sao_Paulo": "BR", "America/Argentina/Buenos_Aires": "AR", "America/Bogota": "CO", "America/Lima": "PE", "America/Santiago": "CL"}


def resolve(req: Req, user: dict | None = None, tz: str = "", lang: str = "") -> tuple[str, str]:
    """The country to price for and how we know it, for a visitor who may not be signed in: the connection first, then the browser's time zone,
    then what an account last recorded, then the language region (en-DE), and India, where the platform started, when nothing says."""
    d = detect(req)
    if d:
        return d["country"], d["via"]
    tz = tz or req.header("x-wlxc-tz") or ""
    lang = lang or (req.header("accept-language") or "").split(",")[0].split(";")[0]
    c = TZ.get(tz[:40])
    if c:
        return c, "timezone"
    c = ((user or {}).get("geo") or {}).get("country")
    if c:
        return c, "account"
    c = _clean((lang or "").replace("_", "-").split("-")[-1]) if "-" in (lang or "").replace("_", "-") else ""
    if c in COUNTRIES:
        return c, "language"
    return "IN", "default"


def signal(req: Req, kind: str = "") -> dict:
    """What kind of link the visitor is on, as their browser reports it: mobile data, Wi-Fi or a wired connection, and how fast it looks."""
    from .netquality import read
    h = read(req)
    k = {"cellular": "mobile data", "wifi": "Wi-Fi", "ethernet": "wired", "bluetooth": "Bluetooth", "wimax": "WiMAX"}.get((kind or "").lower(), "")
    return {"type": k, "speed": h.get("effectiveType") or "", "saveData": bool(h.get("saveData"))}


def globe_points() -> dict:
    """Counts by country and state, with a position for each, for the admin globe. Only totals leave this function."""
    users = get_store().find("users", limit=100_000)
    now = time.time() * 1000
    by: dict[tuple[str, str], dict] = {}
    unknown = online_total = 0
    for u in users:
        g = u.get("geo") or {}
        c = g.get("country")
        if c not in COUNTRIES:
            unknown += 1
            continue
        k = (c, g.get("region") or "")
        e = by.setdefault(k, {"country": c, "name": COUNTRIES[c][0], "region": k[1], "n": 0, "online": 0, "paid": 0, "lat": g.get("lat"), "lon": g.get("lon")})
        e["n"] += 1
        live = now - (u.get("lastSeen") or 0) < ONLINE_MS
        e["online"] += 1 if live else 0
        online_total += 1 if live else 0
        e["paid"] += 1 if u.get("plan") not in (None, "prototype") else 0
        if e["lat"] is None:
            e["lat"], e["lon"] = COUNTRIES[c][1], COUNTRIES[c][2]
    pts = sorted(by.values(), key=lambda e: -e["n"])
    countries: dict[str, dict] = {}
    for e in pts:
        c = countries.setdefault(e["country"], {"country": e["country"], "name": e["name"], "n": 0, "online": 0, "paid": 0, "lat": COUNTRIES[e["country"]][1], "lon": COUNTRIES[e["country"]][2]})
        c["n"] += e["n"]
        c["online"] += e["online"]
        c["paid"] += e["paid"]
    return {"online": online_total, "total": len(users), "located": len(users) - unknown, "unknown": unknown, "countries": sorted(countries.values(), key=lambda e: -e["n"]), "places": pts[:300]}


# ---------------------------------------------------------------- the live map
HQ = (28.6, 77.2)  # where payments arc to on the live map


def _jitter(uid: str, spread: float) -> tuple[float, float]:
    """A steady offset for one account, so people in a country with no state recorded fan out around its middle instead of piling on one dot."""
    import hashlib
    h = hashlib.sha256(uid.encode()).digest()
    return ((h[0] / 255 - 0.5) * 2 * spread, (h[1] / 255 - 0.5) * 2 * spread * 1.4)


def live_snapshot() -> dict:
    """Everything the live map shows in one answer: a dot per learner (approximate, no identities), who is online now, top places, the
    day's joins and payments as a short feed, and the payments as arcs. Admin only."""
    st = get_store()
    now = time.time() * 1000
    users = st.find("users", limit=100_000)
    where, pts, places, online = {}, [], {}, 0
    new_online = ret_online = 0
    for u in users:
        g = u.get("geo") or {}
        c = g.get("country")
        if c not in COUNTRIES:
            continue
        live = now - (u.get("lastSeen") or 0) < ONLINE_MS
        if g.get("lat") is not None and g.get("lon") is not None:
            lat, lon = g["lat"], g["lon"]
        else:
            dy, dx = _jitter(u["id"], 2.5)
            lat, lon = COUNTRIES[c][1] + dy, COUNTRIES[c][2] + dx
        where[u["id"]] = (c, g.get("region") or "", lat, lon)
        paid = u.get("plan") not in (None, "prototype")
        if len(pts) < 6000:
            pts.append([round(lat, 2), round(lon, 2), 1 if live else 0, 1 if paid else 0])
        key = (c, g.get("region") or "")
        e = places.setdefault(key, {"country": c, "name": COUNTRIES[c][0], "region": key[1], "n": 0, "online": 0, "_la": 0.0, "_lo": 0.0})
        e["n"] += 1
        e["_la"] += lat
        e["_lo"] += lon
        if live:
            e["online"] += 1
            online += 1
            if now - (u.get("created") or 0) < 7 * 86_400_000:
                new_online += 1
            else:
                ret_online += 1
    day = now - 86_400_000
    feed, arcs = [], []
    for u in users:
        if (u.get("created") or 0) >= day and u["id"] in where:
            c, r, *_ = where[u["id"]]
            feed.append({"at": u["created"], "kind": "join", "text": f"Someone in {r + ', ' if r else ''}{COUNTRIES[c][0]} joined"})
    top_items: dict[str, int] = {}
    for o in st.find("orders", where={"status": "paid"}, order_by="paidAt", desc=True, limit=300):
        if (o.get("paidAt") or 0) < now - 30 * 86_400_000:
            break
        name = (o.get("sku") or o.get("plan") or "plan")
        top_items[name] = top_items.get(name, 0) + 1
        if o["paidAt"] >= day and o["uid"] in where:
            c, r, lat, lon = where[o["uid"]]
            feed.append({"at": o["paidAt"], "kind": "order", "text": f"Someone in {r + ', ' if r else ''}{COUNTRIES[c][0]} subscribed" if o.get("billing") else f"Someone in {COUNTRIES[c][0]} bought an add-on"})
            if len(arcs) < 12:
                arcs.append({"from": [lat, lon], "to": list(HQ)})
    feed.sort(key=lambda f: -f["at"])
    for e in places.values():
        e["lat"], e["lon"] = round(e.pop("_la") / e["n"], 2), round(e.pop("_lo") / e["n"], 2)
    ranked = sorted(places.values(), key=lambda e: (-e["online"], -e["n"]))
    top = ranked[:8]
    pins = [{"name": f"{e['region'] + ', ' if e['region'] else ''}{e['name']}", "lat": e["lat"], "lon": e["lon"], "n": e["n"], "online": e["online"]} for e in ranked[:40]]
    return {"now": now, "online": online, "total": len(users), "located": len(where), "paid": sum(1 for u in users if u.get("plan") not in (None, "prototype")),
            "pins": pins, "newOnline": new_online, "returningOnline": ret_online, "points": pts, "top": top, "feed": feed[:12], "arcs": arcs,
            "plans30d": sorted(({"item": k, "n": v} for k, v in top_items.items()), key=lambda x: -x["n"])[:5], "orders24h": len(arcs)}
