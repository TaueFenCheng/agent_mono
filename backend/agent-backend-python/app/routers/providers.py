"""Provider list endpoint."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/v1/providers", tags=["providers"])

BUILT_IN_PROVIDERS = [
    {"name": "qwen", "defaultBaseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1", "defaultModel": "qwen-plus", "isBuiltin": True},
    {"name": "glm", "defaultBaseUrl": "https://open.bigmodel.cn/api/paas/v4", "defaultModel": "glm-4-flash", "isBuiltin": True},
    {"name": "deepseek", "defaultBaseUrl": "https://api.deepseek.com/v1", "defaultModel": "deepseek-chat", "isBuiltin": True},
    {"name": "openai", "defaultBaseUrl": "https://api.openai.com/v1", "defaultModel": "gpt-4o-mini", "isBuiltin": True},
]


class ProviderInfo(BaseModel):
    name: str
    defaultBaseUrl: str
    defaultModel: str
    isBuiltin: bool


class ProviderListResponse(BaseModel):
    providers: list[ProviderInfo]


@router.get("", response_model=ProviderListResponse)
async def list_providers() -> ProviderListResponse:
    return ProviderListResponse(providers=[ProviderInfo(**p) for p in BUILT_IN_PROVIDERS])
