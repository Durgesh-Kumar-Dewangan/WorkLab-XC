"""Copies everything from your local SQLite database into Postgres (Supabase, Neon, RDS...), so you keep your accounts and lessons when you deploy.

    python scripts/migrate_to_postgres.py "postgresql://user:pw@host:5432/postgres"            # SQLITE_PATH or data/wlxc.db is the source
    python scripts/migrate_to_postgres.py "postgresql://..." --from path/to/wlxc.db --dry-run

It only adds and overwrites records with the same id; it never deletes anything in Postgres. Run it again any time: it is safe to repeat."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("url", help="Postgres address")
    ap.add_argument("--from", dest="src", default="", help="SQLite file (default: SQLITE_PATH, else data/wlxc.db next to the repo)")
    ap.add_argument("--dry-run", action="store_true", help="count what would be copied, change nothing")
    a = ap.parse_args()
    if not a.url.startswith(("postgres://", "postgresql://")):
        print("FAIL  The target must be a Postgres address.")
        return 2
    src = a.src or os.environ.get("SQLITE_PATH") or str(Path(__file__).resolve().parents[2] / "data" / "wlxc.db")
    if not Path(src).exists():
        print(f"FAIL  No SQLite file at {src}. Pass --from.")
        return 2
    from wlxc.store import PgStore, SqliteStore

    old = SqliteStore(src)
    docs = sum(1 for _ in old.iter_docs())
    blobs = sum(1 for _ in old.iter_blobs())
    print(f"Source    {src}: {docs} records, {blobs} pictures")
    if a.dry_run:
        print("Dry run: nothing copied.")
        return 0
    new = PgStore(a.url)
    n = 0
    for col, id, doc in old.iter_docs():
        new.put(col, id, doc)
        n += 1
        if n % 500 == 0:
            print(f"  ...{n} records")
    m = 0
    for id, ctype, data in old.iter_blobs():
        new.put_blob(id, data, ctype)
        m += 1
    print(f"Copied    {n} records and {m} pictures. Point DATABASE_URL at the new database and restart.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
