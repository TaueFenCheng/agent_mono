from __future__ import annotations

import os
from urllib.parse import urlparse

from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI

from .types import CoreProvider, ProviderConfig

PROVIDER_CONFIGS: dict[CoreProvider, ProviderConfig] = {
    "qwen": ProviderConfig(
        api_key_env="QWEN_API_KEY",
        base_url_env="QWEN_BASE_URL",
        model_env="QWEN_MODEL",
        default_base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        default_model="qwen-plus",
    ),
    "glm": ProviderConfig(
        api_key_env="GLM_API_KEY",
        base_url_env="GLM_BASE_URL",
        model_env="GLM_MODEL",
        default_base_url="https://open.bigmodel.cn/api/paas/v4",
        default_model="glm-4.5",
    ),
    "openai": ProviderConfig(
        api_key_env="OPENAI_API_KEY",
        base_url_env="OPENAI_BASE_URL",
        model_env="OPENAI_MODEL",
        default_base_url="https://api.openai.com/v1",
        default_model="gpt-4.1-mini",
    ),
    "anthropic": ProviderConfig(
        api_key_env="ANTHROPIC_API_KEY",
        base_url_env="ANTHROPIC_BASE_URL",
        model_env="ANTHROPIC_MODEL",
        default_base_url="https://api.anthropic.com",
        default_model="claude-3-5-sonnet-latest",
    ),
    "gemini": ProviderConfig(
        api_key_env="GEMINI_API_KEY",
        base_url_env="GEMINI_BASE_URL",
        model_env="GEMINI_MODEL",
        default_base_url="https://generativelanguage.googleapis.com",
        default_model="gemini-2.0-flash",
    ),
}

PROVIDER_ALIAS: dict[str, CoreProvider] = {
    "qwen": "qwen",
    "tongyi": "qwen",
    "glm": "glm",
    "zhipu": "glm",
    "chatglm": "glm",
    "openai": "openai",
    "anthropic": "anthropic",
    "claude": "anthropic",
    "gemini": "gemini",
    "google": "gemini",
}


def normalize_provider(provider: str | None) -> CoreProvider:
    raw = (provider or os.getenv("AGENT_PROVIDER", "qwen")).strip().lower()
    return PROVIDER_ALIAS.get(raw, "qwen")


def create_routed_model(
    *,
    provider: str | None = None,
    model: str | None = None,
    default_model: str | None = None,
    temperature: float | None = None,
) -> tuple[CoreProvider, BaseChatModel]:
    selected = normalize_provider(provider)
    config = PROVIDER_CONFIGS[selected]

    api_key = os.getenv(config.api_key_env)
    if not api_key:
        raise ValueError(f"Missing API key: {config.api_key_env}")

    model_name = model or default_model or os.getenv(config.model_env, config.default_model)
    base_url = os.getenv(config.base_url_env, config.default_base_url)
    effective_temperature = temperature if temperature is not None else float(os.getenv("AGENT_TEMPERATURE", "0.2"))

    if selected in {"openai", "qwen", "glm"}:
        return selected, ChatOpenAI(
            model=model_name,
            api_key=api_key,
            base_url=base_url,
            temperature=effective_temperature,
        )

    if selected == "anthropic":
        anthropic_kwargs: dict[str, object] = {
            "model_name": model_name,
            "api_key": api_key,
            "temperature": effective_temperature,
        }
        if base_url:
            anthropic_kwargs["base_url"] = base_url
        return selected, ChatAnthropic(**anthropic_kwargs)

    if selected == "gemini":
        gemini_kwargs: dict[str, object] = {
            "model": model_name,
            "api_key": api_key,
            "temperature": effective_temperature,
        }
        if base_url and base_url != PROVIDER_CONFIGS["gemini"].default_base_url:
            parsed = urlparse(base_url)
            endpoint = parsed.netloc or parsed.path
            if endpoint:
                gemini_kwargs["client_options"] = {"api_endpoint": endpoint}
        return selected, ChatGoogleGenerativeAI(**gemini_kwargs)

    raise ValueError(f"Unsupported provider: {selected}")
