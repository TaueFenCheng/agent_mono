"""JWT token creation and verification."""

from __future__ import annotations

import time
from typing import Any

import jwt

from ..config import settings

_ALGORITHM = "HS256"


def create_token(payload: dict[str, Any]) -> str:
    """Create a signed JWT from the given payload."""
    now = int(time.time())
    body = {
        **payload,
        "iat": now,
        "exp": now + settings.jwt_expires_seconds,
    }
    return jwt.encode(body, settings.JWT_SECRET, algorithm=_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """Decode and verify a JWT. Raises jwt.InvalidTokenError on failure."""
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[_ALGORITHM])
