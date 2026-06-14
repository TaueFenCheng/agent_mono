"""Request and response schemas for the standalone RAG service."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class HealthPayload(BaseModel):
    status: str
    postgres: str
    vectorTable: str
    at: str


class IndexTextDocument(BaseModel):
    documentId: str
    text: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    threadId: str | None = None
    sourceType: str = "text"
    sourceUri: str | None = None


class IndexTextRequest(BaseModel):
    documents: list[IndexTextDocument] = Field(default_factory=list)


class IndexAttachmentRequest(BaseModel):
    attachmentIds: list[str] = Field(default_factory=list)


class IndexResultItem(BaseModel):
    documentId: str
    nodeCount: int
    sourceType: str
    attachmentId: str | None = None
    threadId: str | None = None


class IndexResponse(BaseModel):
    indexedCount: int
    items: list[IndexResultItem]


class SearchRequest(BaseModel):
    query: str
    topK: int = 5
    threadId: str | None = None
    documentIds: list[str] = Field(default_factory=list)


class SearchHit(BaseModel):
    score: float | None = None
    text: str
    documentId: str
    nodeId: str
    threadId: str | None = None
    attachmentId: str | None = None
    fileName: str | None = None
    sourceType: str | None = None
    chunkIndex: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SearchResponse(BaseModel):
    query: str
    hits: list[SearchHit]


class QueryRequest(BaseModel):
    query: str
    topK: int = 5
    threadId: str | None = None
    documentIds: list[str] = Field(default_factory=list)
    systemPrompt: str = (
        "You are a retrieval-augmented assistant. Answer only from the provided context. "
        "If the context is insufficient, say so explicitly."
    )


class QueryResponse(BaseModel):
    query: str
    answer: str
    hits: list[SearchHit]
