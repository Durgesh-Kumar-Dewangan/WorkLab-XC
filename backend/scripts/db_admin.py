#!/usr/bin/env python3
"""Look at and change the database from the command line, with the same safeguards as the admin screen (secrets hidden, protected collections, an audit entry for every write).

    cd backend
    python scripts/db_admin.py collections
    python scripts/db_admin.py list users --q ann@example.com
    python scripts/db_admin.py get users u_123
    python scripts/db_admin.py create notes_admin n1 '{"text": "hello"}'
    python scripts/db_admin.py merge users u_123 '{"plan": "learner"}'
    python scripts/db_admin.py delete notes_admin n1 --yes

It uses whatever database the environment points at (DATABASE_URL for Postgres, SQLITE_PATH for a file), reading ../.env if there is one. Run it only on a machine you trust."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _load_dotenv() -> None:
    f = Path(__file__).resolve().parent.parent.parent / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf8").splitlines():
            if line.strip() and not line.lstrip().startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.split(" #")[0].strip())


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("collections")
    p = sub.add_parser("list")
    p.add_argument("col")
    p.add_argument("--q", default="")
    p.add_argument("--page", type=int, default=1)
    p = sub.add_parser("get")
    p.add_argument("col")
    p.add_argument("id")
    for name in ("create", "merge", "replace"):
        p = sub.add_parser(name)
        p.add_argument("col")
        p.add_argument("id")
        p.add_argument("json")
    p = sub.add_parser("delete")
    p.add_argument("col")
    p.add_argument("id")
    p.add_argument("--yes", action="store_true")
    a = ap.parse_args()

    _load_dotenv()
    from wlxc import admindb
    from wlxc.errors import ApiError
    from wlxc.store import get_store

    get_store()
    cli = {"id": "cli"}
    try:
        if a.cmd == "collections":
            out = admindb.collections()
        elif a.cmd == "list":
            out = admindb.browse(a.col, a.q, a.page)
        elif a.cmd == "get":
            out = admindb.get_doc(a.col, a.id)
        elif a.cmd == "create":
            out = admindb.create(cli, a.col, a.id, json.loads(a.json))
        elif a.cmd in ("merge", "replace"):
            out = admindb.change(cli, a.col, a.id, json.loads(a.json), a.cmd)
        else:
            if not a.yes:
                print("Add --yes to confirm the delete.")
                return 2
            out = admindb.remove(cli, a.col, a.id, a.id)
    except ApiError as e:
        print(f"Refused: {e.message}")
        return 1
    print(json.dumps(out, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
