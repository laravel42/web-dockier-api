"""Error envelope matching what the frontend's request() helper expects.

`frontend/src/services/request.ts` reads `body.message` and `body.code` off any
non-2xx response and surfaces them as an ApiError. FastAPI's default
`{"detail": ...}` would show up as "Request failed (422)" with no explanation, so
every error path is normalized here.
"""

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, message: str, code: str, status_code: int = 400):
        self.message = message
        self.code = code
        self.status_code = status_code
        super().__init__(message)


def _envelope(status_code: int, message: str, code: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"message": message, "code": code})


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return _envelope(exc.status_code, exc.message, exc.code)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError):
        # Surface the first problem in a form a human can act on: "limit: Input
        # should be less than or equal to 200" beats a nested error array.
        first = (exc.errors() or [{}])[0]
        location = ".".join(str(p) for p in first.get("loc", []) if p not in ("body", "query", "path"))
        detail = first.get("msg", "Invalid request")
        message = f"{location}: {detail}" if location else detail
        return _envelope(status.HTTP_422_UNPROCESSABLE_ENTITY, message, "VALIDATION_ERROR")

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException):
        codes = {401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND", 429: "RATE_LIMITED"}
        return _envelope(exc.status_code, str(exc.detail), codes.get(exc.status_code, "HTTP_ERROR"))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        # Never leak internals: the message may contain a clone URL with a token.
        print(f"[!] Unhandled API error: {type(exc).__name__}: {exc}")
        return _envelope(500, "An unexpected error occurred.", "INTERNAL_ERROR")
