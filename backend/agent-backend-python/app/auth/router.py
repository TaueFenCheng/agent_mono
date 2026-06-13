"""Auth endpoints: POST /v1/auth/register, POST /v1/auth/login."""

from __future__ import annotations

import uuid
from typing import Any

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..deps import get_db_session
from ..db_models import UserORM
from .service import create_token

router = APIRouter(prefix="/v1/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    displayName: str | None = None


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1)


class AuthResponse(BaseModel):
    accessToken: str
    tokenType: str = "Bearer"
    expiresIn: int
    user: dict[str, str]


@router.post("/register", response_model=AuthResponse)
async def register(
    body: RegisterRequest, session: AsyncSession = Depends(get_db_session)
) -> AuthResponse:
    """Register a new user."""
    existing = (
        await session.scalars(select(UserORM).where(UserORM.username == body.username))
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="用户名已存在")

    password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    user = UserORM(
        id=str(uuid.uuid4()),
        username=body.username,
        password_hash=password_hash,
        display_name=body.displayName or body.username,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    token = create_token({"sub": user.id, "name": user.display_name or user.username})
    return AuthResponse(
        accessToken=token,
        expiresIn=settings.jwt_expires_seconds,
        user={"sub": user.id, "name": user.display_name or user.username},
    )


@router.post("/login", response_model=AuthResponse)
async def login(
    body: LoginRequest, session: AsyncSession = Depends(get_db_session)
) -> AuthResponse:
    """Login with username and password."""
    user = (
        await session.scalars(select(UserORM).where(UserORM.username == body.username))
    ).first()
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    if not bcrypt.checkpw(body.password.encode(), user.password_hash.encode()):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    token = create_token({"sub": user.id, "name": user.display_name or user.username})
    return AuthResponse(
        accessToken=token,
        expiresIn=settings.jwt_expires_seconds,
        user={"sub": user.id, "name": user.display_name or user.username},
    )


async def seed_default_user(session: AsyncSession) -> None:
    """Seed a default admin user from env vars if not exists."""
    username = settings.AUTH_DEFAULT_USERNAME
    password = settings.AUTH_DEFAULT_PASSWORD
    if not username or not password:
        return

    existing = (
        await session.scalars(select(UserORM).where(UserORM.username == username))
    ).first()
    if existing:
        return

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user = UserORM(
        id=str(uuid.uuid4()),
        username=username,
        password_hash=password_hash,
        display_name=username,
    )
    session.add(user)
    await session.commit()
