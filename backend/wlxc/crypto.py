from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import uuid as _uuid

N, R, P, KEYLEN = 32768, 8, 1, 64
MAXMEM = 128 * 1024 * 1024


def uuid() -> str:
    return str(_uuid.uuid4())


def random_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def sha256(v: str | bytes) -> str:
    return hashlib.sha256(v.encode() if isinstance(v, str) else v).hexdigest()


def hmac_hex(secret: str, data: str | bytes) -> str:
    return hmac.new(secret.encode(), data.encode() if isinstance(data, str) else data, hashlib.sha256).hexdigest()


def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def _derive(pw: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    import unicodedata

    return hashlib.scrypt(unicodedata.normalize("NFKC", pw).encode(), salt=salt, n=n, r=r, p=p, maxmem=MAXMEM, dklen=KEYLEN)


def hash_password(pw: str) -> str:
    """scrypt$N$r$p$salt$hash. Parameters are stored so they can be raised later without breaking old hashes."""
    salt = os.urandom(16)
    key = _derive(pw, salt, N, R, P)
    return "$".join(["scrypt", str(N), str(R), str(P), base64.b64encode(salt).decode(), base64.b64encode(key).decode()])


def verify_password(pw: str, stored: str) -> bool:
    parts = stored.split("$")
    if len(parts) != 6 or parts[0] != "scrypt":
        return False
    _, n, r, p, salt, h = parts
    try:
        key = _derive(pw, base64.b64decode(salt), int(n), int(r), int(p))
        return hmac.compare_digest(key, base64.b64decode(h))
    except Exception:
        return False


# Compared against when the account does not exist, so login timing does not reveal which emails are registered.
DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + base64.b64encode(b"\0" * 64).decode()
