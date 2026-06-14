"""Application configuration for the standalone RAG service."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    POSTGRES_HOST: str = "127.0.0.1"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "intelligent"
    POSTGRES_PASSWORD: str = "intelligent"
    POSTGRES_DB: str = "intelligent_agent"
    POSTGRES_URL: str = ""
    DATABASE_URL: str = ""

    RAG_VECTOR_TABLE: str = "rag_documents"
    RAG_EMBED_DIM: int = 1536
    RAG_TEXT_SEARCH_CONFIG: str = "simple"
    RAG_SIMILARITY_TOP_K: int = 5
    RAG_OVERFETCH_FACTOR: int = 4

    RAG_OPENAI_API_KEY: str = ""
    RAG_OPENAI_BASE_URL: str = ""
    RAG_EMBED_MODEL: str = "text-embedding-3-small"
    RAG_CHAT_MODEL: str = "gpt-4o-mini"

    PORT: int = 8082

    @property
    def postgres_async_dsn(self) -> str:
        if self.POSTGRES_URL.strip():
            return self.POSTGRES_URL.strip()
        if self.DATABASE_URL.strip():
            return self.DATABASE_URL.strip()
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def postgres_sync_dsn(self) -> str:
        if self.POSTGRES_URL.strip():
            return self.POSTGRES_URL.strip().replace("+asyncpg", "").replace("+psycopg", "")
        if self.DATABASE_URL.strip():
            return self.DATABASE_URL.strip().replace("+asyncpg", "").replace("+psycopg", "")
        return (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
