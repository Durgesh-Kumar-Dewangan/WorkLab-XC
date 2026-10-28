"""Checks the database the app will use, before you deploy.

    python scripts/db_check.py                      # uses DATABASE_URL from the environment
    python scripts/db_check.py "postgresql://..."   # or pass the address

It connects the same way the app does (encrypted, and pooler-safe for Supabase), creates the tables if they are missing,
checks that row-level security is on, writes and deletes one test record, and prints what it found. Nothing else is changed."""
from __future__ import annotations

import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def hide(url: str) -> str:
    return re.sub(r"://([^:@/]+):[^@]*@", r"://\1:***@", url)


def main() -> int:
    url = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("DATABASE_URL", "")).strip()
    if not url.startswith(("postgres://", "postgresql://")):
        print("FAIL  Give a Postgres address: DATABASE_URL=postgresql://user:password@host:5432/postgres")
        return 2
    os.environ["DATABASE_URL"] = url
    from wlxc.store import PgStore, pg_connect_options

    opts = pg_connect_options(url)
    print(f"Address   {hide(url)}")
    print(f"Mode      {'pooled (prepared statements off)' if 'prepare_threshold' in opts else 'direct'}, encryption: {opts.get('sslmode', 'off (local)')}")
    if re.search(r"db\.[a-z0-9]+\.supabase\.co", url):
        print("NOTE      This is the Supabase direct address, which is IPv6 only. If this fails, or your host has no IPv6 (Render free, Vercel), use the Session pooler address from")
        print("          Supabase > Project Settings > Database > Connection string > Session pooler.")
    t0 = time.time()
    try:
        st = PgStore(url)
    except Exception as e:  # noqa: BLE001
        print(f"FAIL  Could not connect: {type(e).__name__}: {str(e)[:300]}")
        print("      Check the password (special characters must be URL-encoded), the host, and that the project is not paused.")
        return 1
    print(f"OK    Connected and tables ready in {int((time.time() - t0) * 1000)} ms")
    with st.pool.connection() as c:
        rls = {r[0]: r[1] for r in c.execute("SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('docs','blobs') AND relkind = 'r'").fetchall()}
        ver = c.execute("SHOW server_version").fetchone()[0]
    print(f"OK    Postgres {ver}")
    for name in ("docs", "blobs"):
        print(("OK    " if rls.get(name) else "WARN  ") + f"Row-level security on {name}: {'on' if rls.get(name) else 'OFF (anyone with your public key could read it through Supabase REST)'}")
    probe = f"check-{int(time.time())}"
    st.put("_check", probe, {"ok": True})
    ok = st.get("_check", probe) == {"ok": True}
    st.delete("_check", probe)
    print(("OK    " if ok else "FAIL  ") + "Wrote, read back and deleted a test record")
    print(f"Found     {sum(n for _, n in st.collections())} records in {len(st.collections())} collections, {st.blob_stats()[0]} stored pictures")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
