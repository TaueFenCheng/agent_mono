"""Model configuration CRUD endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..db_models import ModelConfigORM
from ..deps import DbSession

router = APIRouter(prefix="/v1/model-configs", tags=["model-configs"])

BUILT_IN_PROVIDERS = {"qwen", "glm", "deepseek", "openai"}


class ModelConfigCreate(BaseModel):
    name: str
    provider: str
    model: str
    apiKey: str = ""
    baseUrl: str = ""


class ModelConfigUpdate(BaseModel):
    name: str | None = None
    model: str | None = None
    apiKey: str | None = None
    baseUrl: str | None = None


class ModelConfigResponse(BaseModel):
    id: str
    name: str
    provider: str
    model: str
    apiKey: str
    baseUrl: str
    isActive: bool
    isCustom: bool
    createdAt: str
    updatedAt: str


class ModelConfigListResponse(BaseModel):
    configs: list[ModelConfigResponse]


def _to_response(row: ModelConfigORM) -> ModelConfigResponse:
    return ModelConfigResponse(
        id=row.id, name=row.name, provider=row.provider, model=row.model,
        apiKey=row.api_key, baseUrl=row.base_url, isActive=row.is_active,
        isCustom=row.is_custom, createdAt=row.created_at.isoformat(),
        updatedAt=row.updated_at.isoformat(),
    )


@router.get("", response_model=ModelConfigListResponse)
async def list_model_configs(session: DbSession) -> ModelConfigListResponse:
    rows = (
        await session.scalars(
            select(ModelConfigORM).order_by(ModelConfigORM.is_active.desc(), ModelConfigORM.created_at.desc())
        )
    ).all()
    return ModelConfigListResponse(configs=[_to_response(r) for r in rows])


@router.get("/active", response_model=ModelConfigResponse)
async def get_active_model_config(session: DbSession) -> ModelConfigResponse:
    row = (await session.scalars(select(ModelConfigORM).where(ModelConfigORM.is_active == True).limit(1))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="No active model config")
    return _to_response(row)


@router.get("/{config_id}", response_model=ModelConfigResponse)
async def get_model_config(config_id: str, session: DbSession) -> ModelConfigResponse:
    row = await session.get(ModelConfigORM, config_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Model config not found")
    return _to_response(row)


@router.post("", response_model=ModelConfigResponse)
async def create_model_config(payload: ModelConfigCreate, session: DbSession) -> ModelConfigResponse:
    # Check if any config exists — first one auto-activates
    existing = (await session.scalars(select(ModelConfigORM).limit(1))).first()
    is_active = existing is None

    is_custom = payload.provider not in BUILT_IN_PROVIDERS

    row = ModelConfigORM(
        id=str(uuid.uuid4()),
        name=payload.name,
        provider=payload.provider,
        model=payload.model,
        api_key=payload.apiKey,
        base_url=payload.baseUrl,
        is_active=is_active,
        is_custom=is_custom,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _to_response(row)


@router.put("/{config_id}", response_model=ModelConfigResponse)
async def update_model_config(
    config_id: str, payload: ModelConfigUpdate, session: DbSession
) -> ModelConfigResponse:
    row = await session.get(ModelConfigORM, config_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Model config not found")

    if payload.name is not None:
        row.name = payload.name
    if payload.model is not None:
        row.model = payload.model
    if payload.apiKey is not None:
        row.api_key = payload.apiKey
    if payload.baseUrl is not None:
        row.base_url = payload.baseUrl

    await session.commit()
    await session.refresh(row)
    return _to_response(row)


@router.delete("/{config_id}")
async def delete_model_config(config_id: str, session: DbSession) -> dict:
    row = await session.get(ModelConfigORM, config_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Model config not found")

    was_active = row.is_active
    await session.delete(row)
    await session.commit()

    # If deleted config was active, activate the oldest remaining
    if was_active:
        oldest = (
            await session.scalars(
                select(ModelConfigORM).order_by(ModelConfigORM.created_at.asc()).limit(1)
            )
        ).first()
        if oldest:
            oldest.is_active = True
            await session.commit()

    return {"deleted": True}


@router.post("/{config_id}/activate", response_model=ModelConfigResponse)
async def activate_model_config(config_id: str, session: DbSession) -> ModelConfigResponse:
    row = await session.get(ModelConfigORM, config_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Model config not found")

    # Deactivate all
    all_configs = (await session.scalars(select(ModelConfigORM))).all()
    for cfg in all_configs:
        cfg.is_active = False

    # Activate target
    row.is_active = True
    await session.commit()
    await session.refresh(row)
    return _to_response(row)
