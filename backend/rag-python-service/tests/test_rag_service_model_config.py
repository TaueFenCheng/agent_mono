from app.config import Settings
from app.services.rag_service import RagService


class _FakeRagService(RagService):
    def __init__(self, settings: Settings, *, by_name=None, active=None):
        super().__init__(settings)
        self._by_name = by_name or {}
        self._active = active

    def _fetch_model_config_by_name(self, name: str):
        return self._by_name.get(name)

    def _fetch_active_model_config(self):
        return self._active


def test_chat_model_prefers_named_database_config():
    settings = Settings(
        RAG_CHAT_MODEL_CONFIG_NAME="rag-chat",
        RAG_CHAT_MODEL="env-chat-model",
        RAG_OPENAI_API_KEY="env-key",
        RAG_OPENAI_BASE_URL="https://env.example.com/v1",
    )
    service = _FakeRagService(
        settings,
        by_name={
            "rag-chat": {
                "name": "rag-chat",
                "provider": "openai",
                "model": "db-chat-model",
                "api_key": "db-key",
                "base_url": "https://db.example.com/v1",
                "is_active": False,
            }
        },
    )

    runtime = service._resolve_chat_runtime_config()

    assert runtime.model == "db-chat-model"
    assert runtime.api_key == "db-key"
    assert runtime.base_url == "https://db.example.com/v1"
    assert runtime.source == "model_configs:name"


def test_embed_model_uses_active_config_credentials_and_env_model_as_fallback_shape():
    settings = Settings(
        RAG_EMBED_MODEL="text-embedding-3-small",
        RAG_OPENAI_API_KEY="env-key",
        RAG_OPENAI_BASE_URL="https://env.example.com/v1",
    )
    service = _FakeRagService(
        settings,
        active={
            "name": "active-openai",
            "provider": "openai",
            "model": "gpt-4o-mini",
            "api_key": "active-key",
            "base_url": "https://active.example.com/v1",
            "is_active": True,
        },
    )

    runtime = service._resolve_embed_runtime_config()

    assert runtime.model == "text-embedding-3-small"
    assert runtime.api_key == "active-key"
    assert runtime.base_url == "https://active.example.com/v1"
    assert runtime.source == "model_configs:active"


def test_chat_model_falls_back_to_env_when_database_has_no_config():
    settings = Settings(
        RAG_CHAT_MODEL="gpt-4o-mini",
        RAG_OPENAI_API_KEY="env-key",
        RAG_OPENAI_BASE_URL="https://env.example.com/v1",
    )
    service = _FakeRagService(settings)

    runtime = service._resolve_chat_runtime_config()

    assert runtime.model == "gpt-4o-mini"
    assert runtime.api_key == "env-key"
    assert runtime.base_url == "https://env.example.com/v1"
    assert runtime.source == "env"
