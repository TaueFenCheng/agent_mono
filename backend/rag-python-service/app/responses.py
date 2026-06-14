"""Unified success and error response helpers."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


def success_response(data: Any, *, message: str = "ok", status_code: int = 200) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "code": 0,
            "message": message,
            "data": data,
        },
    )


def error_response(
    status_code: int,
    message: str,
    *,
    request: Request | None = None,
    details: Any = None,
) -> JSONResponse:
    request_id = (request.headers.get("x-request-id") if request else None) or str(uuid.uuid4())
    payload: dict[str, Any] = {
        "code": status_code,
        "message": message,
        "data": None,
        "details": {
            "statusCode": status_code,
            "requestId": request_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    }
    if request is not None:
        payload["details"]["path"] = str(request.url.path)
        payload["details"]["method"] = request.method
    if details is not None:
        payload["details"]["details"] = details
    return JSONResponse(status_code=status_code, content=payload)


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return error_response(exc.status_code, str(exc.detail), request=request)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return error_response(500, str(exc) or "Internal server error", request=request)
