"""Tiny runtime schema helpers so route handlers never trust request bodies."""
from __future__ import annotations

import re
from typing import Any, Callable

from .errors import ValidationError

Schema = Callable[[Any, str], Any]


def _fail(path: str, msg: str):
    raise ValidationError([f"{path or 'body'}: {msg}"])


def string(min=0, max=10_000, trim=True, pattern=None, lower=False) -> Schema:
    def parse(v, p=""):
        if not isinstance(v, str):
            _fail(p, "must be a string")
        x = v.strip() if trim else v
        if lower:
            x = x.lower()
        if len(x) < min:
            _fail(p, "is required" if min == 1 else f"must be at least {min} characters")
        if len(x) > max:
            _fail(p, f"must be at most {max} characters")
        if pattern and not re.search(pattern, x):
            _fail(p, "has an invalid format")
        return x

    return parse


def number(min=None, max=None, int_=False) -> Schema:
    def parse(v, p=""):
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            _fail(p, "must be a number")
        if int_ and float(v) != int(v):
            _fail(p, "must be a whole number")
        if (min is not None and v < min) or (max is not None and v > max):
            _fail(p, f"must be between {min} and {max}")
        return v

    return parse


def any_() -> Schema:
    return lambda v, p="": v


def boolean() -> Schema:
    def parse(v, p=""):
        if not isinstance(v, bool):
            _fail(p, "must be true or false")
        return v

    return parse


def enum(*vals: str) -> Schema:
    def parse(v, p=""):
        if not isinstance(v, str) or v not in vals:
            _fail(p, f"must be one of {', '.join(vals)}")
        return v

    return parse


def array(item: Schema, min=0, max=1000) -> Schema:
    def parse(v, p=""):
        if not isinstance(v, list):
            _fail(p, "must be a list")
        if len(v) < min or len(v) > max:
            _fail(p, f"must have {min} to {max} items")
        return [item(x, f"{p}[{i}]") for i, x in enumerate(v)]

    return parse


def optional(inner: Schema) -> Schema:
    return lambda v, p="": None if v is None else inner(v, p)


def obj(**shape: Schema) -> Schema:
    def parse(v, p=""):
        if not isinstance(v, dict):
            _fail(p, "must be an object")
        return {k: s(v.get(k), f"{p}.{k}" if p else k) for k, s in shape.items()}

    return parse


EMAIL = r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$"
