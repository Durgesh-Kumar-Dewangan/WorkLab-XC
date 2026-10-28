"""Create (or update) a complimentary account from the command line, for example for the owner or a partner.

    python scripts/with_env.py -m wlxc.cli_account someone@example.com "their-password" [--plus] [--admin] [--years 100]

The account is created with the email already confirmed and the paid plan switched on for the given number of years (default 100,
which is "always"). `--plus` also switches on the AI class chat and unlimited notes. Running it again for an existing email sets the
password and extends the plan. Nothing is charged and no payment record is made."""
from __future__ import annotations

import argparse
import time

from . import addons, auth as authmod
from .crypto import hash_password
from .store import get_store

DAY = 86_400_000


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("email")
    ap.add_argument("password")
    ap.add_argument("--name", default="")
    ap.add_argument("--plus", action="store_true", help="also grant the AI class chat and unlimited notes")
    ap.add_argument("--admin", action="store_true")
    ap.add_argument("--years", type=int, default=100)
    a = ap.parse_args()
    email = a.email.strip().lower()
    if len(a.password) < 8:
        raise SystemExit("The password needs at least 8 characters.")
    st = get_store()
    idx = st.get("emails", email)
    now = time.time() * 1000
    until = now + a.years * 365 * DAY
    if idx:
        uid = idx["uid"]
        st.update("users", uid, lambda c: {**c, "hash": hash_password(a.password), "emailVerified": True} if c else c)
        created = False
    else:
        user = authmod.register(a.name or email.split("@")[0].replace(".", " ").title(), email, a.password, {"at": now, "version": "owner"})
        uid, created = user["id"], True
    st.update("users", uid, lambda c: {**c, "plan": "learner", "planUntil": until, "emailVerified": True, **({"role": "admin"} if a.admin else {})} if c else c)
    if a.plus:
        addons.grant(uid, "pack", days=a.years * 365)
    print(f"{'Created' if created else 'Updated'} {email}: Beta plan{' + Study pack' if a.plus else ''} until {time.strftime('%Y-%m-%d', time.gmtime(until / 1000))}.")


if __name__ == "__main__":
    main()
