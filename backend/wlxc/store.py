"""A deliberately small document store.

Three backends share one interface:
  * SqliteStore  - a file (or ':memory:' for tests). Fine for one server with a persistent disk.
  * PgStore      - PostgreSQL JSONB, for any multi-instance or serverless host (needs `psycopg[binary]`).
`update` is atomic per document: use it for counters, state changes and leases. The function passed to
`update` must be quick and free of side effects; it may raise to abort.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
import time
from typing import Any, Callable

from .config import env

_FIELD = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _field(f: str) -> str:
    if not _FIELD.match(f):
        raise ValueError(f"Invalid field name: {f}")
    return f


class Store:
    def get(self, col: str, id: str) -> dict | None: ...
    def put(self, col: str, id: str, doc: dict) -> None: ...
    def insert(self, col: str, id: str, doc: dict) -> bool: ...
    def update(self, col: str, id: str, fn: Callable[[dict | None], dict | None]) -> dict | None: ...
    def delete(self, col: str, id: str) -> None: ...
    def find(self, col: str, where: dict | None = None, order_by: str | None = None, desc: bool = False,
             limit: int = 100, since: tuple[str, float] | None = None, until: tuple[str, float] | None = None) -> list[dict]: ...
    def count(self, col: str, where: dict | None = None, since: tuple[str, float] | None = None,
              until: tuple[str, float] | None = None) -> int: ...
    def collections(self) -> list[tuple[str, int]]: ...
    def blob_stats(self) -> tuple[int, int]: ...
    def purge(self, col: str, older_than_ms: float) -> int: ...
    def put_blob(self, id: str, data: bytes, content_type: str) -> None: ...
    def get_blob(self, id: str) -> tuple[bytes, str] | None: ...
    def delete_blob(self, id: str) -> None: ...
    def iter_docs(self): ...   # yields (collection, id, doc) for every document; used by backups
    def iter_blobs(self): ...  # yields (id, content_type, bytes)
    def ping(self) -> bool: ...


class SqliteStore(Store):
    def __init__(self, path: str = ":memory:"):
        if path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False, isolation_level=None, timeout=30)
        self.lock = threading.RLock()
        with self.lock:
            if path != ":memory:":
                self.db.execute("PRAGMA journal_mode=WAL")
            self.db.execute("PRAGMA busy_timeout=30000")
            self.db.execute(
                "CREATE TABLE IF NOT EXISTS docs (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,"
                " updated REAL NOT NULL, PRIMARY KEY (col, id))"
            )
            self.db.execute("CREATE INDEX IF NOT EXISTS docs_updated ON docs (col, updated)")
            self.db.execute(
                "CREATE TABLE IF NOT EXISTS blobs (id TEXT PRIMARY KEY, content_type TEXT NOT NULL, data BLOB NOT NULL)"
            )

    def _now(self) -> float:
        return time.time() * 1000

    def get(self, col, id):
        with self.lock:
            r = self.db.execute("SELECT data FROM docs WHERE col=? AND id=?", (col, id)).fetchone()
        return json.loads(r[0]) if r else None

    def put(self, col, id, doc):
        with self.lock:
            self.db.execute(
                "INSERT INTO docs(col,id,data,updated) VALUES(?,?,?,?) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data, updated=excluded.updated",
                (col, id, json.dumps(doc), self._now()),
            )

    def insert(self, col, id, doc):
        with self.lock:
            cur = self.db.execute(
                "INSERT OR IGNORE INTO docs(col,id,data,updated) VALUES(?,?,?,?)", (col, id, json.dumps(doc), self._now())
            )
            return cur.rowcount > 0

    def update(self, col, id, fn):
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                r = self.db.execute("SELECT data FROM docs WHERE col=? AND id=?", (col, id)).fetchone()
                nxt = fn(json.loads(r[0]) if r else None)
                if nxt is None:
                    self.db.execute("DELETE FROM docs WHERE col=? AND id=?", (col, id))
                else:
                    self.db.execute(
                        "INSERT INTO docs(col,id,data,updated) VALUES(?,?,?,?) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data, updated=excluded.updated",
                        (col, id, json.dumps(nxt), self._now()),
                    )
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise
        return json.loads(json.dumps(nxt)) if nxt is not None else None

    def delete(self, col, id):
        with self.lock:
            self.db.execute("DELETE FROM docs WHERE col=? AND id=?", (col, id))

    def _where(self, col, where, since, until):
        sql, args = "col=?", [col]
        for k, v in (where or {}).items():
            sql += f" AND json_extract(data,'$.{_field(k)}') IS ?"
            args.append(int(v) if isinstance(v, bool) else v)
        if since:
            sql += f" AND CAST(json_extract(data,'$.{_field(since[0])}') AS REAL) >= ?"
            args.append(since[1])
        if until:
            sql += f" AND CAST(json_extract(data,'$.{_field(until[0])}') AS REAL) <= ?"
            args.append(until[1])
        return sql, args

    def find(self, col, where=None, order_by=None, desc=False, limit=100, since=None, until=None):
        sql, args = self._where(col, where, since, until)
        q = f"SELECT data FROM docs WHERE {sql}"
        if order_by:
            f = _field(order_by)
            q += f" ORDER BY (json_extract(data,'$.{f}') IS NULL), CAST(json_extract(data,'$.{f}') AS REAL) {'DESC' if desc else 'ASC'}"
        q += " LIMIT ?"
        args.append(min(limit, 20000))
        with self.lock:
            rows = self.db.execute(q, args).fetchall()
        return [json.loads(r[0]) for r in rows]

    def count(self, col, where=None, since=None, until=None):
        sql, args = self._where(col, where, since, until)
        with self.lock:
            return self.db.execute(f"SELECT count(*) FROM docs WHERE {sql}", args).fetchone()[0]

    def collections(self):
        with self.lock:
            return [(r[0], r[1]) for r in self.db.execute("SELECT col, count(*) FROM docs GROUP BY col ORDER BY col").fetchall()]

    def blob_stats(self):
        with self.lock:
            r = self.db.execute("SELECT count(*), coalesce(sum(length(data)),0) FROM blobs").fetchone()
        return int(r[0]), int(r[1])

    def purge(self, col, older_than_ms):
        with self.lock:
            return self.db.execute("DELETE FROM docs WHERE col=? AND updated < ?", (col, older_than_ms)).rowcount

    def put_blob(self, id, data, content_type):
        with self.lock:
            self.db.execute(
                "INSERT INTO blobs(id,content_type,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET content_type=excluded.content_type, data=excluded.data",
                (id, content_type, data),
            )

    def get_blob(self, id):
        with self.lock:
            r = self.db.execute("SELECT data, content_type FROM blobs WHERE id=?", (id,)).fetchone()
        return (bytes(r[0]), r[1]) if r else None

    def delete_blob(self, id):
        with self.lock:
            self.db.execute("DELETE FROM blobs WHERE id=?", (id,))

    def iter_docs(self):
        with self.lock:
            rows = self.db.execute("SELECT col, id, data FROM docs ORDER BY col, id").fetchall()
        for c, i, d in rows:
            yield c, i, json.loads(d)

    def iter_blobs(self):
        with self.lock:
            ids = [r[0] for r in self.db.execute("SELECT id FROM blobs ORDER BY id").fetchall()]
        for i in ids:  # one at a time, so a large library does not have to fit in memory twice
            b = self.get_blob(i)
            if b:
                yield i, b[1], b[0]

    def ping(self):
        with self.lock:
            return self.db.execute("SELECT 1").fetchone()[0] == 1


_PG_SCHEMA = [
    """CREATE TABLE IF NOT EXISTS docs (col text NOT NULL, id text NOT NULL, data jsonb NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (col, id))""",
    "CREATE INDEX IF NOT EXISTS docs_data_gin ON docs USING gin (data jsonb_path_ops)",
    "CREATE INDEX IF NOT EXISTS docs_updated ON docs (col, updated_at)",
    # Supabase publishes the public schema through its REST API; with row-level security on and no policies, only our own database role can read these tables
    "ALTER TABLE docs ENABLE ROW LEVEL SECURITY",
    "CREATE TABLE IF NOT EXISTS blobs (id text PRIMARY KEY, content_type text NOT NULL, data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now())",
    "ALTER TABLE blobs ENABLE ROW LEVEL SECURITY",
]


def pg_connect_options(url: str, environ: dict | None = None) -> dict[str, Any]:
    """How to connect to this Postgres: encryption, and the settings a connection pooler needs.
    Supabase (and other managed hosts) are reached over TLS but sign it with their own authority, so for them the default is an encrypted
    connection; give PG_CA_CERT to also verify it. Pooled addresses (Supabase port 6543, hosts with "pooler" in the name) share server connections between
    clients, which does not allow prepared statements, so those are turned off for them."""
    env_ = os.environ if environ is None else environ
    kw: dict[str, Any] = {}
    local = re.search(r"sslmode=disable|localhost|127\.0\.0\.1|@db:|@postgres:", url)
    managed = re.search(r"supabase\.(co|com)|pooler\.|neon\.tech", url)
    if not local:
        ca = env_.get("PG_CA_CERT")
        if env_.get("PG_SSL_INSECURE") == "1" or (managed and not ca):
            kw["sslmode"] = "require"
        else:
            kw["sslmode"] = "verify-full"
            if ca:
                import tempfile

                f = tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False)
                f.write(ca.replace("\\n", "\n"))
                f.close()
                kw["sslrootcert"] = f.name
    if re.search(r":6543/|pooler\.|pgbouncer=true", url) or env_.get("PG_POOLER") == "1":
        kw["prepare_threshold"] = None
    return kw


class PgStore(Store):
    """PostgreSQL JSONB store. Needs `pip install "psycopg[binary,pool]"`. Written to mirror SqliteStore; verify on your database."""

    def __init__(self, url: str):
        import psycopg  # type: ignore
        from psycopg.types.json import Jsonb  # type: ignore
        from psycopg_pool import ConnectionPool  # type: ignore

        self._Jsonb = Jsonb
        kw = pg_connect_options(url)
        self.pool = ConnectionPool(url, min_size=1, max_size=int(os.environ.get("PG_POOL_MAX", "10")), kwargs=kw, open=True)
        if os.environ.get("DB_AUTO_MIGRATE") != "0":
            with self.pool.connection() as c:
                with c.transaction():
                    c.execute("SELECT pg_advisory_xact_lock(727274)")  # held for this transaction only, so it also works behind a connection pooler
                    for s in _PG_SCHEMA:
                        c.execute(s)

    def get(self, col, id):
        with self.pool.connection() as c:
            r = c.execute("SELECT data FROM docs WHERE col=%s AND id=%s", (col, id)).fetchone()
        return r[0] if r else None

    def put(self, col, id, doc):
        with self.pool.connection() as c:
            c.execute(
                "INSERT INTO docs(col,id,data,updated_at) VALUES(%s,%s,%s,now()) ON CONFLICT (col,id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()",
                (col, id, self._Jsonb(doc)),
            )

    def insert(self, col, id, doc):
        with self.pool.connection() as c:
            cur = c.execute("INSERT INTO docs(col,id,data) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING", (col, id, self._Jsonb(doc)))
            return cur.rowcount > 0

    def update(self, col, id, fn):
        with self.pool.connection() as c:
            with c.transaction():
                c.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (f"{col}:{id}",))
                r = c.execute("SELECT data FROM docs WHERE col=%s AND id=%s", (col, id)).fetchone()
                nxt = fn(r[0] if r else None)
                if nxt is None:
                    c.execute("DELETE FROM docs WHERE col=%s AND id=%s", (col, id))
                else:
                    c.execute(
                        "INSERT INTO docs(col,id,data,updated_at) VALUES(%s,%s,%s,now()) ON CONFLICT (col,id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()",
                        (col, id, self._Jsonb(nxt)),
                    )
        return nxt

    def delete(self, col, id):
        with self.pool.connection() as c:
            c.execute("DELETE FROM docs WHERE col=%s AND id=%s", (col, id))

    def _where(self, col, where, since, until):
        sql, args = "col=%s", [col]
        if where:
            sql += " AND data @> %s::jsonb"
            args.append(json.dumps(where))
        if since:
            sql += f" AND (data->>'{_field(since[0])}')::numeric >= %s"
            args.append(since[1])
        if until:
            sql += f" AND (data->>'{_field(until[0])}')::numeric <= %s"
            args.append(until[1])
        return sql, args

    def find(self, col, where=None, order_by=None, desc=False, limit=100, since=None, until=None):
        sql, args = self._where(col, where, since, until)
        q = f"SELECT data FROM docs WHERE {sql}"
        if order_by:
            q += f" ORDER BY (data->>'{_field(order_by)}')::numeric {'DESC' if desc else 'ASC'} NULLS LAST"
        q += " LIMIT %s"
        args.append(min(limit, 20000))
        with self.pool.connection() as c:
            return [r[0] for r in c.execute(q, args).fetchall()]

    def count(self, col, where=None, since=None, until=None):
        sql, args = self._where(col, where, since, until)
        with self.pool.connection() as c:
            return int(c.execute(f"SELECT count(*) FROM docs WHERE {sql}", args).fetchone()[0])

    def collections(self):
        with self.pool.connection() as c:
            return [(r[0], int(r[1])) for r in c.execute("SELECT col, count(*) FROM docs GROUP BY col ORDER BY col").fetchall()]

    def blob_stats(self):
        with self.pool.connection() as c:
            r = c.execute("SELECT count(*), coalesce(sum(octet_length(data)),0) FROM blobs").fetchone()
        return int(r[0]), int(r[1])

    def purge(self, col, older_than_ms):
        with self.pool.connection() as c:
            return c.execute("DELETE FROM docs WHERE col=%s AND updated_at < to_timestamp(%s/1000.0)", (col, older_than_ms)).rowcount

    def put_blob(self, id, data, content_type):
        with self.pool.connection() as c:
            c.execute(
                "INSERT INTO blobs(id,content_type,data) VALUES(%s,%s,%s) ON CONFLICT (id) DO UPDATE SET content_type=EXCLUDED.content_type, data=EXCLUDED.data",
                (id, content_type, data),
            )

    def get_blob(self, id):
        with self.pool.connection() as c:
            r = c.execute("SELECT data, content_type FROM blobs WHERE id=%s", (id,)).fetchone()
        return (bytes(r[0]), r[1]) if r else None

    def delete_blob(self, id):
        with self.pool.connection() as c:
            c.execute("DELETE FROM blobs WHERE id=%s", (id,))

    def iter_docs(self):
        with self.pool.connection() as c:
            for col, id, data in c.execute("SELECT col, id, data FROM docs ORDER BY col, id").fetchall():
                yield col, id, data

    def iter_blobs(self):
        with self.pool.connection() as c:
            ids = [r[0] for r in c.execute("SELECT id FROM blobs ORDER BY id").fetchall()]
        for i in ids:
            b = self.get_blob(i)
            if b:
                yield i, b[1], b[0]

    def ping(self):
        with self.pool.connection() as c:
            return c.execute("SELECT 1").fetchone()[0] == 1


_store: Store | None = None
_lock = threading.Lock()


def get_store() -> Store:
    """One store per process. Postgres when DATABASE_URL is set, otherwise SQLite (SQLITE_PATH, default a local file)."""
    global _store
    with _lock:
        if _store is None:
            e = env()
            if e.database_url:
                _store = PgStore(e.database_url)
            elif e.sqlite_path:
                _store = SqliteStore(e.sqlite_path)
            elif e.prod:
                raise RuntimeError("DATABASE_URL or SQLITE_PATH is required in production. The in-memory store loses data on restart.")
            else:
                _store = SqliteStore(":memory:")
        return _store


def set_store(s: Store | None) -> None:
    global _store
    with _lock:
        _store = s
