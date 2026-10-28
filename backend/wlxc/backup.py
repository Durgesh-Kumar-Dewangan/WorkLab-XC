"""Backups you can restore. Writes every collection and file in the database to one compressed (optionally encrypted) file,
and can copy it to any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, Supabase, MinIO) without extra libraries.

    python -m wlxc.backup create [--out FILE]       make a backup now (uploads too if BACKUP_S3_* is set)
    python -m wlxc.backup verify FILE                check a backup file can be read, print what is inside
    python -m wlxc.backup restore FILE [--merge]     load into the configured database (empty database, unless --merge)

Set BACKUP_PASSPHRASE to encrypt (recommended: the file holds password hashes and personal data). Keep that passphrase somewhere
other than the server: without it the backup cannot be opened. Scheduled backups: BACKUP_DAILY=1 (see maintenance.tick)."""
from __future__ import annotations

import base64
import gzip
import hashlib
import hmac
import io
import json
import os
import sys
import time
from datetime import datetime, timezone
from urllib.parse import quote, urlparse

from .config import env
from .net import http
from .store import get_store
from .web import log

MAGIC_PLAIN = b"WLXCBAK1"
MAGIC_ENC = b"WLXCBAKE"
SKIP = {"rl", "ipverdicts", "otp", "abuse_hits", "health", "mail_dedupe"}  # short-lived; not worth keeping


# ------------------------------------------------------------------ file format
def _key(passphrase: str, salt: bytes) -> bytes:
    return base64.urlsafe_b64encode(hashlib.scrypt(passphrase.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32))


def make_backup(passphrase: str | None = None) -> tuple[bytes, dict]:
    st = get_store()
    raw = io.BytesIO()
    counts = {"docs": 0, "blobs": 0}
    with gzip.GzipFile(fileobj=raw, mode="wb", compresslevel=6) as z:
        z.write((json.dumps({"t": "header", "version": 1, "created": time.time() * 1000}) + "\n").encode())
        for col, id, doc in st.iter_docs():
            if col in SKIP:
                continue
            z.write((json.dumps({"t": "doc", "c": col, "i": id, "d": doc}, separators=(",", ":")) + "\n").encode())
            counts["docs"] += 1
        for id, ct, data in st.iter_blobs():
            z.write((json.dumps({"t": "blob", "i": id, "ct": ct, "b": base64.b64encode(data).decode()}, separators=(",", ":")) + "\n").encode())
            counts["blobs"] += 1
        z.write((json.dumps({"t": "end", **counts}) + "\n").encode())
    body = raw.getvalue()
    if passphrase:
        from cryptography.fernet import Fernet

        salt = os.urandom(16)
        return MAGIC_ENC + salt + Fernet(_key(passphrase, salt)).encrypt(body), counts
    return MAGIC_PLAIN + body, counts


def read_backup(data: bytes, passphrase: str | None = None):
    """Yields records. Raises ValueError if the file is damaged, truncated or the passphrase is wrong."""
    if data.startswith(MAGIC_ENC):
        if not passphrase:
            raise ValueError("This backup is encrypted: set BACKUP_PASSPHRASE.")
        from cryptography.fernet import Fernet, InvalidToken

        salt, token = data[8:24], data[24:]
        try:
            body = Fernet(_key(passphrase, salt)).decrypt(token)
        except InvalidToken:
            raise ValueError("Wrong passphrase, or the file is damaged.") from None
    elif data.startswith(MAGIC_PLAIN):
        body = data[8:]
    else:
        raise ValueError("Not a WorkLab XC backup file.")
    try:
        lines = gzip.decompress(body).decode().splitlines()
    except Exception:  # noqa: BLE001
        raise ValueError("The backup is damaged (cannot decompress).") from None
    if not lines:
        raise ValueError("Empty backup.")
    last = json.loads(lines[-1])
    if last.get("t") != "end":
        raise ValueError("The backup is incomplete (no end marker).")
    seen = {"docs": 0, "blobs": 0}
    for line in lines:
        r = json.loads(line)
        if r["t"] in ("doc", "blob"):
            seen[r["t"] + "s"] += 1
        yield r
    if seen != {"docs": last["docs"], "blobs": last["blobs"]}:
        raise ValueError("The backup is incomplete (record counts do not match).")


def summarize(data: bytes, passphrase: str | None = None) -> dict:
    cols: dict[str, int] = {}
    blobs = 0
    for r in read_backup(data, passphrase):
        if r["t"] == "doc":
            cols[r["c"]] = cols.get(r["c"], 0) + 1
        elif r["t"] == "blob":
            blobs += 1
    return {"collections": cols, "docs": sum(cols.values()), "blobs": blobs, "bytes": len(data)}


def restore(data: bytes, passphrase: str | None = None, merge: bool = False) -> dict:
    st = get_store()
    records = list(read_backup(data, passphrase))  # validate everything before touching the database
    if not merge and any(True for _ in st.iter_docs()):
        raise ValueError("The database is not empty. Restore into a fresh database, or pass --merge to overwrite matching records.")
    n = {"docs": 0, "blobs": 0}
    for r in records:
        if r["t"] == "doc":
            st.put(r["c"], r["i"], r["d"])
            n["docs"] += 1
        elif r["t"] == "blob":
            st.put_blob(r["i"], base64.b64decode(r["b"]), r["ct"])
            n["blobs"] += 1
    return n


# ------------------------------------------------------------------ S3-compatible upload (AWS Signature V4)
def sigv4_headers(method: str, url: str, region: str, access: str, secret: str, payload_hash: str, now: datetime | None = None,
                  extra: dict | None = None, service: str = "s3") -> dict:
    now = now or datetime.now(timezone.utc)
    u = urlparse(url)
    amz = now.strftime("%Y%m%dT%H%M%SZ")
    day = now.strftime("%Y%m%d")
    hdrs = {"host": u.netloc, "x-amz-content-sha256": payload_hash, "x-amz-date": amz, **{k.lower(): v for k, v in (extra or {}).items()}}
    names = sorted(hdrs)
    canon_headers = "".join(f"{k}:{str(hdrs[k]).strip()}\n" for k in names)
    query = "&".join(f"{quote(k, safe='')}={quote(v, safe='')}" for k, v in sorted(p.split("=", 1) if "=" in p else (p, "") for p in u.query.split("&") if p))
    canonical = "\n".join([method, quote(u.path or "/", safe="/-_.~"), query, canon_headers, ";".join(names), payload_hash])
    scope = f"{day}/{region}/{service}/aws4_request"
    to_sign = "\n".join(["AWS4-HMAC-SHA256", amz, scope, hashlib.sha256(canonical.encode()).hexdigest()])

    def h(k, m):
        return hmac.new(k, m.encode(), hashlib.sha256).digest()

    k = h(h(h(h(("AWS4" + secret).encode(), day), region), service), "aws4_request")
    sig = hmac.new(k, to_sign.encode(), hashlib.sha256).hexdigest()
    out = {k_: v for k_, v in hdrs.items() if k_ != "host"}
    out["authorization"] = f"AWS4-HMAC-SHA256 Credential={access}/{scope}, SignedHeaders={';'.join(names)}, Signature={sig}"
    return out


def s3_configured() -> bool:
    b = env().backup
    return bool(b.s3_endpoint and b.s3_bucket and b.s3_access and b.s3_secret)


def upload_s3(name: str, data: bytes) -> None:
    b = env().backup
    url = f"{b.s3_endpoint}/{b.s3_bucket}/{quote((b.s3_prefix.strip('/') + '/' if b.s3_prefix.strip('/') else '') + name, safe='/-_.~')}"
    ph = hashlib.sha256(data).hexdigest()
    h = sigv4_headers("PUT", url, b.s3_region, b.s3_access, b.s3_secret, ph, extra={"content-type": "application/octet-stream"})
    r = http(url, "PUT", h, body=data, timeout=300)
    if not r.ok:
        raise RuntimeError(f"upload failed: HTTP {r.status} {r.text[:200]}")


# ------------------------------------------------------------------ run
def run_backup() -> dict:
    b = env().backup
    data, counts = make_backup(b.passphrase or None)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    name = f"wlxc-{stamp}.wlxcbak" + (".enc" if b.passphrase else "")
    where = []
    if b.dir:
        os.makedirs(b.dir, exist_ok=True)
        path = os.path.join(b.dir, name)
        with open(path, "wb") as f:
            f.write(data)
        where.append(path)
        files = sorted(x for x in os.listdir(b.dir) if x.startswith("wlxc-") and ".wlxcbak" in x)
        for old in files[: max(0, len(files) - b.keep)]:
            os.remove(os.path.join(b.dir, old))
    if s3_configured():
        upload_s3(name, data)
        where.append(f"s3://{b.s3_bucket}/{name}")
    if not where:
        raise RuntimeError("No place to put the backup: set BACKUP_DIR and/or BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY, BACKUP_S3_SECRET_KEY.")
    get_store().put("meta", "last_backup", {"at": time.time() * 1000, "name": name, "bytes": len(data), **counts, "where": where})
    log("info", "backup.done", name=name, bytes=len(data), **counts)
    return {"name": name, "bytes": len(data), **counts, "where": where}


def due() -> bool:
    b = env().backup
    if not b.daily:
        return False
    last = get_store().get("meta", "last_backup")
    return not last or time.time() * 1000 - last["at"] > 23.5 * 3600_000


def main(argv: list[str]) -> int:
    cmd = argv[0] if argv else ""
    pw = env().backup.passphrase or None
    try:
        if cmd == "create":
            if "--out" in argv:
                data, counts = make_backup(pw)
                path = argv[argv.index("--out") + 1]
                open(path, "wb").write(data)
                print(f"wrote {path} ({len(data):,} bytes, {counts['docs']} records, {counts['blobs']} files)")
            else:
                print(json.dumps(run_backup(), indent=2))
            return 0
        if cmd == "verify":
            print(json.dumps(summarize(open(argv[1], "rb").read(), pw), indent=2))
            return 0
        if cmd == "restore":
            print(json.dumps(restore(open(argv[1], "rb").read(), pw, "--merge" in argv)))
            return 0
    except (ValueError, RuntimeError, OSError, IndexError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
