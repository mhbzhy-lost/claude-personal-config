from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException


class ProblemException(HTTPException):
    """RFC 7807 Problem Details."""

    def __init__(
        self,
        status_code: int,
        title: str,
        *,
        code: str | None = None,
        detail: str | None = None,
        type_: str = "about:blank",
        errors: dict[str, list[str]] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail or title)
        self.title = title
        self.code = code
        self.type_ = type_
        self.errors = errors


def _problem_payload(
    status_code: int,
    title: str,
    *,
    instance: str,
    code: str | None = None,
    detail: str | None = None,
    type_: str = "about:blank",
    errors: dict[str, list[str]] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "type": type_,
        "title": title,
        "status": status_code,
        "instance": instance,
    }
    if detail:
        payload["detail"] = detail
    if code:
        payload["code"] = code
    if errors:
        payload["errors"] = errors
    return payload


async def problem_exception_handler(request: Request, exc: ProblemException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_problem_payload(
            exc.status_code,
            exc.title,
            instance=str(request.url.path),
            code=exc.code,
            detail=exc.detail if exc.detail != exc.title else None,
            type_=exc.type_,
            errors=exc.errors,
        ),
        media_type="application/problem+json",
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_problem_payload(
            exc.status_code,
            exc.detail or "Error",
            instance=str(request.url.path),
        ),
        media_type="application/problem+json",
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    fields: dict[str, list[str]] = {}
    for err in exc.errors():
        loc = ".".join(str(p) for p in err.get("loc", []) if p != "body")
        fields.setdefault(loc or "<root>", []).append(err.get("msg", "invalid"))
    return JSONResponse(
        status_code=422,
        content=_problem_payload(
            422,
            "Validation failed",
            instance=str(request.url.path),
            code="validation_error",
            errors=fields,
        ),
        media_type="application/problem+json",
    )


def not_found(code: str, detail: str | None = None) -> ProblemException:
    return ProblemException(404, "Not found", code=code, detail=detail)


def unprocessable(code: str, detail: str) -> ProblemException:
    return ProblemException(422, "Unprocessable", code=code, detail=detail)


def conflict(code: str, detail: str) -> ProblemException:
    return ProblemException(409, "Conflict", code=code, detail=detail)


def unauthorized(code: str = "unauthorized", detail: str | None = None) -> ProblemException:
    return ProblemException(401, "Unauthorized", code=code, detail=detail)
