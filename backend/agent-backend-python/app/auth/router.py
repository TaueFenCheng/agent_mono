"""Auth endpoints: POST /v1/auth/token."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from ..config import settings
from .service import create_token

router = APIRouter(prefix="/v1/auth", tags=["auth"])


class TokenRequest(BaseModel):
    sub: str
    name: str = ""
    roles: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class TokenResponse(BaseModel):
    accessToken: str
    tokenType: str = "Bearer"
    expiresIn: int


@router.post("/token", response_model=TokenResponse)
async def issue_token(
    body: TokenRequest,
    x_bootstrap_key: str | None = Header(default=None),
) -> TokenResponse:
    """Exchange a bootstrap key for a JWT access token."""
    if settings.AUTH_BOOTSTRAP_KEY:
        if x_bootstrap_key != settings.AUTH_BOOTSTRAP_KEY:
            raise HTTPException(status_code=401, detail="Invalid bootstrap key")

    token = create_token({
        "sub": body.sub,
        "name": body.name,
        "roles": body.roles,
        "metadata": body.metadata,
    })
    return TokenResponse(
        accessToken=token,
        expiresIn=settings.jwt_expires_seconds,
    )
