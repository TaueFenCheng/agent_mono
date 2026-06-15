"""Repository for reading model configuration records."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(slots=True)
class ModelConfigRecord:
    """Normalized model config row loaded from the shared `model_configs` table."""

    name: str
    provider: str
    model: str
    api_key: str
    base_url: str
    is_active: bool


class ModelConfigRepository:
    """Database access for model configuration queries."""

    async def get_by_name(self, session: AsyncSession, name: str) -> ModelConfigRecord | None:
        """Load one model config by its human-readable config name."""
        result = await session.execute(
            text(
                """
                SELECT name, provider, model, "apiKey", "baseUrl", "isActive"
                FROM model_configs
                WHERE name = :name
                ORDER BY "isActive" DESC, created_at DESC
                LIMIT 1
                """
            ),
            {"name": name},
        )
        row = result.first()
        return self._map_row(row)

    async def get_active(self, session: AsyncSession) -> ModelConfigRecord | None:
        """Load the currently active model config."""
        result = await session.execute(
            text(
                """
                SELECT name, provider, model, "apiKey", "baseUrl", "isActive"
                FROM model_configs
                WHERE "isActive" = TRUE
                ORDER BY created_at DESC
                LIMIT 1
                """
            )
        )
        row = result.first()
        return self._map_row(row)

    def _map_row(self, row) -> ModelConfigRecord | None:
        """Convert a SQLAlchemy row into a normalized `ModelConfigRecord`."""
        if row is None:
            return None
        return ModelConfigRecord(
            name=str(row[0]),
            provider=str(row[1]),
            model=str(row[2]),
            api_key=str(row[3] or ""),
            base_url=str(row[4] or ""),
            is_active=bool(row[5]),
        )
