"""Global exception handling and error codes."""

import traceback
import uuid
from datetime import datetime, timezone
from enum import IntEnum
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse


class ErrorCode(IntEnum):
    VALIDATION_ERROR = 4000
    BAD_REQUEST = 400
    AUTH_UNAUTHORIZED = 401
    AUTH_FORBIDDEN = 403
    RESOURCE_NOT_FOUND = 404
    CONFLICT = 409
    TOO_MANY_REQUESTS = 429
    INTERNAL_ERROR = 500


def error_response(
    status_code: int,
    message: str,
    *,
    details: Any = None,
    request: Request | None = None,
) -> JSONResponse:
    request_id = (request.headers.get("x-request-id") if request else None) or str(uuid.uuid4())
    body: dict[str, Any] = {
        "code": status_code,
        "message": message,
        "data": None,
        "details": {
            "statusCode": status_code,
            "requestId": request_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    }
    if details is not None:
        body["details"]["details"] = details
    if request:
        body["details"]["path"] = str(request.url.path)
        body["details"]["method"] = request.method
    return JSONResponse(status_code=status_code, content=body)


async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    tb = traceback.format_exception(type(exc), exc, exc.__traceback__)
    print(f"[ERROR] {request.method} {request.url.path} requestId={request_id}\n{''.join(tb)}")
    return error_response(500, "Internal server error", request=request)
