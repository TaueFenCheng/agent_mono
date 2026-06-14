import asyncio

from app.config import Settings
from app.repositories.attachment_repository import AttachmentRepository
from app.repositories.model_config_repository import ModelConfigRecord, ModelConfigRepository
from app.services.rag_service import RagService


class _FakeSessionContext:
    async def __aenter__(self):
        return object()

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeSessionFactory:
    def __call__(self):
        return _FakeSessionContext()


class _FakeModelConfigRepository(ModelConfigRepository):
    def __init__(self, *, by_name=None, active=None):
        self._by_name = by_name or {}
        self._active = active

    async def get_by_name(self, session, name: str):
        return self._by_name.get(name)

    async def get_active(self, session):
        return self._active


class _FakeRagService(RagService):
    def __init__(self, settings: Settings, *, by_name=None, active=None):
        super().__init__(
            settings=settings,
            session_factory=_FakeSessionFactory(),
            model_config_repository=_FakeModelConfigRepository(by_name=by_name, active=active),
            attachment_repository=AttachmentRepository(),
        )


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
            "rag-chat": ModelConfigRecord(
                name="rag-chat",
                provider="openai",
                model="db-chat-model",
                api_key="db-key",
                base_url="https://db.example.com/v1",
                is_active=False,
            )
        },
    )

    runtime = asyncio.run(service._resolve_chat_runtime_config())

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
        active=ModelConfigRecord(
            name="active-openai",
            provider="openai",
            model="gpt-4o-mini",
            api_key="active-key",
            base_url="https://active.example.com/v1",
            is_active=True,
        ),
    )

    runtime = asyncio.run(service._resolve_embed_runtime_config())

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

    runtime = asyncio.run(service._resolve_chat_runtime_config())

    assert runtime.model == "gpt-4o-mini"
    assert runtime.api_key == "env-key"
    assert runtime.base_url == "https://env.example.com/v1"
    assert runtime.source == "env"
