"""Auth endpoints: GET /v1/auth/public-key, POST /v1/auth/register, POST /v1/auth/login."""

from __future__ import annotations

import os
import uuid
from typing import Any

import bcrypt
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
from cryptography.hazmat.backends import default_backend
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..deps import get_db_session
from ..db_models import UserORM
from .service import create_token

router = APIRouter(prefix="/v1/auth", tags=["auth"])

_KEYS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "keys")
_PRIVATE_KEY_PATH = os.path.join(_KEYS_DIR, "private.pem")
_PUBLIC_KEY_PATH = os.path.join(_KEYS_DIR, "public.pem")

if os.path.exists(_PRIVATE_KEY_PATH) and os.path.exists(_PUBLIC_KEY_PATH):
    with open(_PRIVATE_KEY_PATH) as f:
        _private_key_pem = f.read()
    with open(_PUBLIC_KEY_PATH) as f:
        _public_key_pem = f.read()
    _private_key: RSAPrivateKey = serialization.load_pem_private_key(
        _private_key_pem.encode(), password=None, backend=default_backend()
    )  # type: ignore[assignment]
else:
    _private_key = rsa.generate_private_key(
        public_exponent=65537, key_size=2048, backend=default_backend()
    )
    _public_key_pem = (
        _private_key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )
    _private_key_pem = _private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    os.makedirs(_KEYS_DIR, exist_ok=True)
    with open(_PRIVATE_KEY_PATH, "w") as f:
        f.write(_private_key_pem)
    with open(_PUBLIC_KEY_PATH, "w") as f:
        f.write(_public_key_pem)


class RegisterRequest(BaseModel):
    """注册请求"""

    username: str = Field(min_length=1, max_length=64, description="用户名")
    password: str | None = Field(
        default=None,
        min_length=6,
        max_length=128,
        description="明文密码（与 encryptedPassword 二选一）",
    )
    encryptedPassword: str | None = Field(
        default=None, description="RSA 加密后的密码（与 password 二选一）"
    )
    displayName: str | None = Field(
        default=None, description="显示名称，不传则默认使用用户名"
    )


class LoginRequest(BaseModel):
    """登录请求"""

    username: str = Field(min_length=1, max_length=64, description="用户名")
    password: str | None = Field(
        default=None, description="明文密码（与 encryptedPassword 二选一）"
    )
    encryptedPassword: str | None = Field(
        default=None, description="RSA 加密后的密码（与 password 二选一）"
    )


class AuthResponse(BaseModel):
    """认证响应"""

    accessToken: str
    tokenType: str = "Bearer"
    expiresIn: int
    user: dict[str, str]


class PublicKeyResponse(BaseModel):
    """公钥响应"""

    publicKey: str


def _decrypt_password(encrypted_b64: str) -> str:
    """RSA 解密密码"""
    raw = _private_key.decrypt(
        __import__("base64").b64decode(encrypted_b64),
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return raw.decode()


def _resolve_password(body: RegisterRequest | LoginRequest) -> str:
    """解析密码：优先使用 encryptedPassword，否则使用 password"""
    if body.encryptedPassword:
        return _decrypt_password(body.encryptedPassword)
    if body.password:
        return body.password
    raise HTTPException(status_code=400, detail="密码不能为空")


@router.get("/public-key", response_model=PublicKeyResponse)
async def get_public_key() -> PublicKeyResponse:
    """获取 RSA 公钥，用于客户端加密密码"""
    return PublicKeyResponse(publicKey=_public_key_pem)


@router.post("/register", response_model=AuthResponse)
async def register(
    body: RegisterRequest, session: AsyncSession = Depends(get_db_session)
) -> AuthResponse:
    """注册新用户"""
    existing = (
        await session.scalars(select(UserORM).where(UserORM.username == body.username))
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="用户名已存在")

    password = _resolve_password(body)
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
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
    """使用用户名密码登录"""
    user = (
        await session.scalars(select(UserORM).where(UserORM.username == body.username))
    ).first()
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    password = _resolve_password(body)
    if not bcrypt.checkpw(password.encode(), user.password_hash.encode()):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    token = create_token({"sub": user.id, "name": user.display_name or user.username})
    return AuthResponse(
        accessToken=token,
        expiresIn=settings.jwt_expires_seconds,
        user={"sub": user.id, "name": user.display_name or user.username},
    )


async def seed_default_user(session: AsyncSession) -> None:
    """从环境变量种子默认管理员用户"""
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
