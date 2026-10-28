"""Counts of content made and content reused, by day, for the admin's reuse dashboard. Only counts are kept, never what was written."""
from __future__ import annotations

from datetime import datetime, timezone

from .store import get_store


def note(kind: str, how: str) -> None:
    """kind: lesson, topic, game, drill, problems, notes, image, canvas ... how: generated (made now), shared (taken from the shared pool), saved (the learner's own copy)."""
    try:
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        key = f"{kind}:{how}"
        get_store().update("content_stats", day, lambda c: {"id": day, "day": day, "counts": {**(c or {}).get("counts", {}), key: (c or {}).get("counts", {}).get(key, 0) + 1}})
    except Exception:  # noqa: BLE001
        pass
