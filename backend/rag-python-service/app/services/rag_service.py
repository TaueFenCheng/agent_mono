"""RAG orchestration service built on repositories and LlamaIndex."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..config import Settings
from ..models import (
    IndexAttachmentRequest,
    IndexResponse,
    IndexResultItem,
    IndexTextRequest,
    QueryRequest,
    QueryResponse,
    SearchHit,
    SearchRequest,
    SearchResponse,
)
from ..persistence.session import ping_database
from ..repositories.attachment_repository import AttachmentChunkRecord, AttachmentRepository
from ..repositories.model_config_repository import ModelConfigRecord, ModelConfigRepository


@dataclass(slots=True)
class ModelRuntimeConfig:
    """运行时模型配置，既可来自 `model_configs` 表，也可来自环境变量兜底。"""

    provider: str
    model: str
    api_key: str
    base_url: str
    source: str
    name: str | None = None


class RagService:
    """RAG 核心编排服务。

    这一层不直接写 SQL，不直接管理数据库连接；
    数据读取统一下沉到 repository/persistence 层。
    """

    def __init__(
        self,
        settings: Settings,
        session_factory: async_sessionmaker[AsyncSession],
        model_config_repository: ModelConfigRepository,
        attachment_repository: AttachmentRepository,
    ):
        self.settings = settings
        self.session_factory = session_factory
        self.model_config_repository = model_config_repository
        self.attachment_repository = attachment_repository

    async def health_payload(self) -> dict[str, Any]:
        """构造 `/health` 接口使用的健康检查结果。"""
        postgres = "down"
        if await ping_database(self.session_factory):
            postgres = "up"
        return {
            "status": "ok",
            "postgres": postgres,
            "vectorTable": self.settings.RAG_VECTOR_TABLE,
            "at": datetime.now(timezone.utc).isoformat(),
        }

    async def index_text_documents(self, request: IndexTextRequest) -> IndexResponse:
        """索引调用方直接传入的原始文本。"""
        embed_runtime = await self._resolve_embed_runtime_config()
        documents = request.documents
        if not documents:
            raise HTTPException(status_code=400, detail="documents cannot be empty")

        nodes = []
        items: list[IndexResultItem] = []
        TextNode = self._text_node_cls()
        for doc in documents:
            text = doc.text.strip()
            if not text:
                continue
            metadata = {
                **doc.metadata,
                "document_id": doc.documentId,
                "thread_id": doc.threadId,
                "source_type": doc.sourceType,
                "source_uri": doc.sourceUri,
            }
            nodes.append(
                TextNode(
                    id_=f"{doc.documentId}:0",
                    text=text,
                    metadata=metadata,
                )
            )
            items.append(
                IndexResultItem(
                    documentId=doc.documentId,
                    nodeCount=1,
                    sourceType=doc.sourceType,
                    threadId=doc.threadId,
                )
            )

        if not nodes:
            raise HTTPException(status_code=400, detail="no non-empty documents to index")

        await self._index_nodes(nodes, embed_runtime=embed_runtime)
        return IndexResponse(indexedCount=len(items), items=items)

    async def index_attachments(self, request: IndexAttachmentRequest) -> IndexResponse:
        """把主业务库里已经处理完成的附件分块写入向量索引。"""
        embed_runtime = await self._resolve_embed_runtime_config()
        attachment_ids = [item.strip() for item in request.attachmentIds if item.strip()]
        if not attachment_ids:
            raise HTTPException(status_code=400, detail="attachmentIds cannot be empty")

        records = await self._load_attachment_chunks(attachment_ids)
        if not records:
            raise HTTPException(status_code=404, detail="No processed attachment chunks found")

        grouped: dict[str, list[AttachmentChunkRecord]] = {}
        for record in records:
            grouped.setdefault(record.attachment_id, []).append(record)

        TextNode = self._text_node_cls()
        nodes = []
        items: list[IndexResultItem] = []
        for attachment_id, chunks in grouped.items():
            file_name = chunks[0].file_name
            thread_id = chunks[0].thread_id
            for chunk in chunks:
                nodes.append(
                    TextNode(
                        id_=f"{attachment_id}:{chunk.chunk_index}",
                        text=chunk.content,
                        metadata={
                            "document_id": attachment_id,
                            "attachment_id": attachment_id,
                            "thread_id": chunk.thread_id,
                            "file_name": file_name,
                            "source_type": "attachment",
                            "chunk_index": chunk.chunk_index,
                            "token_count": chunk.token_count,
                        },
                    )
                )
            items.append(
                IndexResultItem(
                    documentId=attachment_id,
                    attachmentId=attachment_id,
                    nodeCount=len(chunks),
                    sourceType="attachment",
                    threadId=thread_id,
                )
            )

        await self._index_nodes(nodes, embed_runtime=embed_runtime)
        return IndexResponse(indexedCount=len(items), items=items)

    async def semantic_search(self, request: SearchRequest) -> SearchResponse:
        """执行语义检索，只返回命中的上下文片段，不生成最终答案。"""
        query = request.query.strip()
        if not query:
            raise HTTPException(status_code=400, detail="query cannot be empty")

        embed_runtime = await self._resolve_embed_runtime_config()
        hits = await self._retrieve_hits(
            query=query,
            top_k=request.topK,
            thread_id=request.threadId,
            document_ids=request.documentIds,
            embed_runtime=embed_runtime,
        )
        return SearchResponse(query=query, hits=hits)

    async def answer(self, request: QueryRequest) -> QueryResponse:
        """先检索，再基于检索结果生成答案。"""
        query = request.query.strip()
        if not query:
            raise HTTPException(status_code=400, detail="query cannot be empty")

        embed_runtime = await self._resolve_embed_runtime_config()
        chat_runtime = await self._resolve_chat_runtime_config()
        hits = await self._retrieve_hits(
            query=query,
            top_k=request.topK,
            thread_id=request.threadId,
            document_ids=request.documentIds,
            embed_runtime=embed_runtime,
        )
        if not hits:
            return QueryResponse(
                query=query,
                answer="No relevant context was found in the indexed knowledge base.",
                hits=[],
            )

        context_blocks = []
        for index, hit in enumerate(hits, start=1):
            context_blocks.append(
                f"[{index}] documentId={hit.documentId} fileName={hit.fileName or '-'} "
                f"chunkIndex={hit.chunkIndex if hit.chunkIndex is not None else '-'}\n{hit.text}"
            )
        prompt = (
            f"{request.systemPrompt}\n\n"
            f"Question:\n{query}\n\n"
            f"Context:\n{'\n\n'.join(context_blocks)}\n\n"
            "Write a concise answer. Cite the supporting chunk numbers in square brackets when applicable."
        )
        completion = self._llm(chat_runtime).complete(prompt)
        answer = getattr(completion, "text", None) or str(completion)
        return QueryResponse(query=query, answer=answer.strip(), hits=hits)

    async def _retrieve_hits(
        self,
        *,
        query: str,
        top_k: int,
        thread_id: str | None,
        document_ids: list[str],
        embed_runtime: ModelRuntimeConfig,
    ) -> list[SearchHit]:
        """从 pgvector 中取回候选结果，并转换成接口层使用的 `SearchHit`。"""
        index = await self._index(embed_runtime=embed_runtime)
        requested_top_k = max(1, min(top_k, 20))
        fetch_k = min(max(requested_top_k * max(self.settings.RAG_OVERFETCH_FACTOR, 1), requested_top_k), 50)
        nodes = index.as_retriever(similarity_top_k=fetch_k).retrieve(query)

        hits: list[SearchHit] = []
        allowed_document_ids = {item for item in document_ids if item}
        for scored in nodes:
            metadata = dict(scored.metadata or {})
            document_id = str(metadata.get("document_id") or scored.node.node_id)
            hit = SearchHit(
                score=float(scored.score) if scored.score is not None else None,
                text=scored.text,
                documentId=document_id,
                nodeId=scored.node.node_id,
                threadId=metadata.get("thread_id"),
                attachmentId=metadata.get("attachment_id"),
                fileName=metadata.get("file_name"),
                sourceType=metadata.get("source_type"),
                chunkIndex=metadata.get("chunk_index"),
                metadata=metadata,
            )
            if thread_id and hit.threadId != thread_id:
                continue
            if allowed_document_ids and hit.documentId not in allowed_document_ids:
                continue
            hits.append(hit)
            if len(hits) >= requested_top_k:
                break
        return hits

    async def _load_attachment_chunks(self, attachment_ids: list[str]) -> list[AttachmentChunkRecord]:
        """通过附件 repository 读取已处理附件的 chunk 数据。"""
        async with self.session_factory() as session:
            return await self.attachment_repository.list_processed_chunks(session, attachment_ids)

    async def _index_nodes(self, nodes: list[Any], *, embed_runtime: ModelRuntimeConfig) -> None:
        """把已经准备好的 LlamaIndex 节点写入当前配置好的 pgvector 索引。"""
        vector_store = self._vector_store()
        storage_context = self._storage_context(vector_store)
        index = self._vector_store_index(storage_context, embed_runtime=embed_runtime)
        index.insert_nodes(nodes)

    async def _index(self, *, embed_runtime: ModelRuntimeConfig):
        """基于现有 pgvector 存储构建一个可供检索使用的 `VectorStoreIndex` 视图。"""
        vector_store = self._vector_store()
        return self._vector_store_index(self._storage_context(vector_store), embed_runtime=embed_runtime)

    def _storage_context(self, vector_store):
        """为向量存储对象创建 LlamaIndex 所需的 `StorageContext` 包装层。"""
        from llama_index.core import StorageContext

        return StorageContext.from_defaults(vector_store=vector_store)

    def _vector_store_index(self, storage_context, *, embed_runtime: ModelRuntimeConfig):
        """创建绑定当前向量存储和 embedding 模型的 `VectorStoreIndex`。"""
        from llama_index.core import VectorStoreIndex

        return VectorStoreIndex.from_vector_store(
            vector_store=storage_context.vector_store,
            embed_model=self._embed_model(embed_runtime),
        )

    def _vector_store(self):
        """创建 LlamaIndex 使用的 pgvector 存储适配器。"""
        from llama_index.vector_stores.postgres import PGVectorStore

        return PGVectorStore.from_params(
            database=self.settings.POSTGRES_DB,
            host=self.settings.POSTGRES_HOST,
            password=self.settings.POSTGRES_PASSWORD,
            port=self.settings.POSTGRES_PORT,
            user=self.settings.POSTGRES_USER,
            table_name=self.settings.RAG_VECTOR_TABLE,
            embed_dim=self.settings.RAG_EMBED_DIM,
            hybrid_search=True,
            text_search_config=self.settings.RAG_TEXT_SEARCH_CONFIG,
            connection_string=self.settings.postgres_sync_dsn,
            async_connection_string=self.settings.postgres_async_dsn,
            perform_setup=True,
            use_jsonb=True,
        )

    def _embed_model(self, runtime: ModelRuntimeConfig):
        """创建 embedding 客户端，用于文本向量化。"""
        from llama_index.embeddings.openai import OpenAIEmbedding

        return OpenAIEmbedding(
            model=runtime.model,
            dimensions=self.settings.RAG_EMBED_DIM,
            api_key=runtime.api_key,
            api_base=runtime.base_url or None,
        )

    def _llm(self, runtime: ModelRuntimeConfig):
        """创建问答阶段使用的大模型客户端。"""
        from llama_index.llms.openai import OpenAI

        return OpenAI(
            model=runtime.model,
            api_key=runtime.api_key,
            api_base=runtime.base_url or None,
        )

    def _text_node_cls(self):
        """延迟加载 `TextNode` 类，避免在模块导入阶段就提前加载 LlamaIndex 类型。"""
        from llama_index.core.schema import TextNode

        return TextNode

    async def _resolve_chat_runtime_config(self) -> ModelRuntimeConfig:
        """异步解析聊天模型配置。"""
        return await self._resolve_runtime_config(
            configured_name=self.settings.RAG_CHAT_MODEL_CONFIG_NAME,
            env_model=self.settings.RAG_CHAT_MODEL,
            purpose="chat",
        )

    async def _resolve_embed_runtime_config(self) -> ModelRuntimeConfig:
        """异步解析 embedding 模型配置。"""
        return await self._resolve_runtime_config(
            configured_name=self.settings.RAG_EMBED_MODEL_CONFIG_NAME,
            env_model=self.settings.RAG_EMBED_MODEL,
            purpose="embedding",
        )

    async def _resolve_runtime_config(
        self,
        *,
        configured_name: str,
        env_model: str,
        purpose: str,
    ) -> ModelRuntimeConfig:
        """统一解析运行时模型配置。"""
        name = configured_name.strip()
        if name:
            async with self.session_factory() as session:
                row = await self.model_config_repository.get_by_name(session, name)
            if row is None:
                raise HTTPException(
                    status_code=500,
                    detail=f'Configured {purpose} model config "{name}" was not found',
                )
            return self._to_runtime_config(row, source="model_configs:name")

        async with self.session_factory() as session:
            active = await self.model_config_repository.get_active(session)
        if active is not None:
            model = active.model
            if purpose == "embedding" and env_model.strip():
                model = env_model.strip()
            return ModelRuntimeConfig(
                provider=active.provider,
                model=model,
                api_key=active.api_key,
                base_url=active.base_url,
                source="model_configs:active",
                name=active.name,
            )

        return ModelRuntimeConfig(
            provider="openai",
            model=env_model.strip(),
            api_key=self.settings.RAG_OPENAI_API_KEY,
            base_url=self.settings.RAG_OPENAI_BASE_URL,
            source="env",
            name=None,
        )

    def _to_runtime_config(self, row: ModelConfigRecord, *, source: str) -> ModelRuntimeConfig:
        """把 repository 返回的模型配置记录转换成运行时结构。"""
        return ModelRuntimeConfig(
            provider=row.provider,
            model=row.model,
            api_key=row.api_key,
            base_url=row.base_url,
            source=source,
            name=row.name,
        )
