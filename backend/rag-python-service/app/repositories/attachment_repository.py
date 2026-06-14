"""Repository for reading processed attachment chunks."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(slots=True)
class AttachmentChunkRecord:
    """Normalized processed attachment chunk row loaded from the shared tables."""

    attachment_id: str
    thread_id: str | None
    file_name: str
    chunk_index: int
    content: str
    token_count: int


class AttachmentRepository:
    """Database access for processed attachment chunk queries."""

    async def list_processed_chunks(
        self,
        session: AsyncSession,
        attachment_ids: list[str],
    ) -> list[AttachmentChunkRecord]:
        """Load processed attachment chunks ordered by attachment and chunk index."""
        stmt = (
            text(
                """
                SELECT
                    a.id AS attachment_id,
                    a.thread_id,
                    a.file_name,
                    c.chunk_index,
                    c.content,
                    c.token_count
                FROM attachment_chunks c
                INNER JOIN attachments a ON a.id = c.attachment_id
                WHERE a.id IN :attachment_ids
                  AND a.status = 'processed'
                ORDER BY a.id ASC, c.chunk_index ASC
                """
            ).bindparams(bindparam("attachment_ids", expanding=True))
        )
        result = await session.execute(stmt, {"attachment_ids": attachment_ids})
        return [
            AttachmentChunkRecord(
                attachment_id=str(row[0]),
                thread_id=row[1],
                file_name=str(row[2]),
                chunk_index=int(row[3]),
                content=str(row[4]),
                token_count=int(row[5]),
            )
            for row in result.all()
        ]
