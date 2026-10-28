from __future__ import annotations


class ApiError(Exception):
    """An error with an HTTP status and a machine code the front end can act on."""

    def __init__(self, status: int, code: str, message: str, extra: dict | None = None, headers: dict | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra or {}
        self.headers = headers or {}


def not_found(what: str = "That") -> ApiError:
    return ApiError(404, "not_found", f"{what} was not found.")


def forbidden(msg: str = "You do not have access to that.") -> ApiError:
    return ApiError(403, "forbidden", msg)


def bad_request(msg: str, extra: dict | None = None) -> ApiError:
    return ApiError(400, "bad_request", msg, extra)


class ValidationError(Exception):
    def __init__(self, issues: list[str]):
        super().__init__("; ".join(issues))
        self.issues = issues
