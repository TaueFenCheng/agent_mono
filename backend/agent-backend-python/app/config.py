"""Application configuration using pydantic-settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Postgres ──────────────────────────────────────────────
    POSTGRES_HOST: str = "127.0.0.1"
    POSTGRES_PORT: str = "5432"
    POSTGRES_USER: str = "intelligent"
    POSTGRES_PASSWORD: str = "intelligent"
    POSTGRES_DB: str = "intelligent_agent"
    POSTGRES_URL: str = ""
    DATABASE_URL: str = ""

    # ── Redis ─────────────────────────────────────────────────
    REDIS_URL: str = "redis://127.0.0.1:6379"

    # ── Auth ──────────────────────────────────────────────────
    JWT_SECRET: str = "change-me-in-production"
    JWT_EXPIRES_IN: str = "7d"
    AUTH_DEFAULT_USERNAME: str = ""
    AUTH_DEFAULT_PASSWORD: str = ""

    # ── Agent ─────────────────────────────────────────────────
    AGENT_PROVIDER: str = "qwen"
    AGENT_SYSTEM_PROMPT: str = (
        "You are a pragmatic software engineering agent. "
        "Use tools when needed and keep answers concrete."
    )
    AGENT_CHECKPOINTER_BACKEND: str = "postgres"

    # ── Object Storage (S3/MinIO) ────────────────────────────
    OBJECT_STORAGE_ENDPOINT: str = "http://127.0.0.1:9000"
    OBJECT_STORAGE_REGION: str = "us-east-1"
    OBJECT_STORAGE_BUCKET: str = "intelligent-agent"
    OBJECT_STORAGE_ACCESS_KEY: str = "minioadmin"
    OBJECT_STORAGE_SECRET_KEY: str = "minioadmin"
    OBJECT_STORAGE_FORCE_PATH_STYLE: bool = True
    OBJECT_STORAGE_SIGN_TTL_SEC: int = 3600

    # ── Attachment ────────────────────────────────────────────
    ATTACHMENT_MAX_UPLOAD_MB: int = 25
    ATTACHMENT_CHUNK_MAX_CHARS: int = 1200

    # ── Server ────────────────────────────────────────────────
    PORT: int = 8081

    @property
    def postgres_dsn(self) -> str:
        if self.POSTGRES_URL.strip():
            return self.POSTGRES_URL.strip()
        if self.DATABASE_URL.strip():
            return self.DATABASE_URL.strip()
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def jwt_expires_seconds(self) -> int:
        raw = self.JWT_EXPIRES_IN.strip().lower()
        if raw.endswith("d"):
            return int(raw[:-1]) * 86400
        if raw.endswith("h"):
            return int(raw[:-1]) * 3600
        if raw.endswith("m"):
            return int(raw[:-1]) * 60
        return int(raw)

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
