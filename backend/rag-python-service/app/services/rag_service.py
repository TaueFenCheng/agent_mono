"""LlamaIndex + pgvector service implementation."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import psycopg
from fastapi import HTTPException

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


@dataclass(slots=True)
class AttachmentChunkRecord:
    """从共享 Postgres 表中读取出的附件分块记录，做了一层统一结构封装。"""

    attachment_id: str
    thread_id: str | None
    file_name: str
    chunk_index: int
    content: str
    token_count: int


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
    """RAG 核心服务，负责协调 pgvector 存储、检索和基于上下文的回答生成。"""

    def __init__(self, settings: Settings):
        """保存运行时配置，供后续所有数据库、向量库和模型客户端创建时复用。"""
        self.settings = settings

    def ensure_ready(self) -> None:
        """执行服务启动前的准备动作。

        当前职责只有一个：
        - 确保 Postgres 中已经启用 `vector` extension，
          避免后续访问 pgvector 表时失败。
        """
        with psycopg.connect(self.settings.postgres_sync_dsn) as conn:
            with conn.cursor() as cur:
                cur.execute("CREATE EXTENSION IF NOT EXISTS vector")

    def health_payload(self) -> dict[str, Any]:
        """构造 `/health` 接口使用的健康检查结果。

        这里会做一个轻量级的数据库连通性检查，
        同时返回当前服务使用的向量表名称。
        """
        postgres = "down"
        with psycopg.connect(self.settings.postgres_sync_dsn) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
                postgres = "up"
        return {
            "status": "ok",
            "postgres": postgres,
            "vectorTable": self.settings.RAG_VECTOR_TABLE,
            "at": datetime.now(timezone.utc).isoformat(),
        }

    def index_text_documents(self, request: IndexTextRequest) -> IndexResponse:
        """索引调用方直接传入的原始文本。

        处理流程：
        - 校验输入文档列表
        - 把每个文档转成 LlamaIndex 的 `TextNode`
        - 补齐后续检索会用到的元数据
        - 把节点写入 pgvector
        """
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
            node = TextNode(
                id_=f"{doc.documentId}:0",
                text=text,
                metadata=metadata,
            )
            nodes.append(node)
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

        self._index_nodes(nodes)
        return IndexResponse(indexedCount=len(items), items=items)

    def index_attachments(self, request: IndexAttachmentRequest) -> IndexResponse:
        """把主业务库里已经处理完成的附件分块写入向量索引。

        这个方法本身不负责解析文件，它依赖两个前提：
        - 主后端已经完成文本抽取
        - `attachment_chunks` 表里已经有切分后的 chunk

        当前方法只负责：
        - 读取这些 chunk
        - 转成向量节点
        - 写入 pgvector
        """
        attachment_ids = [item.strip() for item in request.attachmentIds if item.strip()]
        if not attachment_ids:
            raise HTTPException(status_code=400, detail="attachmentIds cannot be empty")

        records = self._load_attachment_chunks(attachment_ids)
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

        self._index_nodes(nodes)
        return IndexResponse(indexedCount=len(items), items=items)

    def semantic_search(self, request: SearchRequest) -> SearchResponse:
        """执行语义检索，只返回命中的上下文片段，不生成最终答案。"""
        query = request.query.strip()
        if not query:
            raise HTTPException(status_code=400, detail="query cannot be empty")

        hits = self._retrieve_hits(
            query=query,
            top_k=request.topK,
            thread_id=request.threadId,
            document_ids=request.documentIds,
        )
        return SearchResponse(query=query, hits=hits)

    def answer(self, request: QueryRequest) -> QueryResponse:
        """先检索，再基于检索结果生成答案。

        这是标准的 RAG 问答入口：
        - 先召回相关 chunk
        - 再把这些 chunk 组织进 prompt
        - 调用配置好的大模型生成回答
        - 最后把答案和命中的上下文一起返回
        """
        query = request.query.strip()
        if not query:
            raise HTTPException(status_code=400, detail="query cannot be empty")

        hits = self._retrieve_hits(
            query=query,
            top_k=request.topK,
            thread_id=request.threadId,
            document_ids=request.documentIds,
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
        completion = self._llm().complete(prompt)
        answer = getattr(completion, "text", None) or str(completion)
        return QueryResponse(query=query, answer=answer.strip(), hits=hits)

    def _retrieve_hits(
        self,
        *,
        query: str,
        top_k: int,
        thread_id: str | None,
        document_ids: list[str],
    ) -> list[SearchHit]:
        """从 pgvector 中取回候选结果，并转换成接口层使用的 `SearchHit`。

        这里有几个关键点：
        - 先多取一些结果，因为后面还要按 `thread_id` 和 `document_ids` 做过滤
        - 把 LlamaIndex 的原始检索结果映射成稳定的响应结构
        - 最终只保留调用方要求的 `top_k` 条结果
        """
        index = self._index()
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

    def _load_attachment_chunks(self, attachment_ids: list[str]) -> list[AttachmentChunkRecord]:
        """从共享 Postgres 表中读取已经处理完成的附件分块。

        这是独立 RAG 服务和主业务附件链路之间的桥接点。
        主后端负责上传、解析、切块；
        当前服务负责把这些切好的内容拿来做向量索引和检索。
        """
        sql = """
            SELECT
                a.id AS attachment_id,
                a.thread_id,
                a.file_name,
                c.chunk_index,
                c.content,
                c.token_count
            FROM attachment_chunks c
            INNER JOIN attachments a ON a.id = c.attachment_id
            WHERE a.id = ANY(%s)
              AND a.status = 'processed'
            ORDER BY a.id ASC, c.chunk_index ASC
        """
        with psycopg.connect(self.settings.postgres_sync_dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (attachment_ids,))
                rows = cur.fetchall()
        return [
            AttachmentChunkRecord(
                attachment_id=row[0],
                thread_id=row[1],
                file_name=row[2],
                chunk_index=row[3],
                content=row[4],
                token_count=row[5],
            )
            for row in rows
        ]

    def _index_nodes(self, nodes: list[Any]) -> None:
        """把已经准备好的 LlamaIndex 节点写入当前配置好的 pgvector 索引。"""
        vector_store = self._vector_store()
        storage_context = self._storage_context(vector_store)
        index = self._vector_store_index(storage_context)
        index.insert_nodes(nodes)

    def _index(self):
        """基于现有 pgvector 存储构建一个可供检索使用的 `VectorStoreIndex` 视图。"""
        vector_store = self._vector_store()
        return self._vector_store_index(self._storage_context(vector_store))

    def _storage_context(self, vector_store):
        """为向量存储对象创建 LlamaIndex 所需的 `StorageContext` 包装层。"""
        from llama_index.core import StorageContext

        return StorageContext.from_defaults(vector_store=vector_store)

    def _vector_store_index(self, storage_context):
        """创建绑定当前向量存储和 embedding 模型的 `VectorStoreIndex`。"""
        from llama_index.core import VectorStoreIndex

        return VectorStoreIndex.from_vector_store(
            vector_store=storage_context.vector_store,
            embed_model=self._embed_model(),
        )

    def _vector_store(self):
        """创建 LlamaIndex 使用的 pgvector 存储适配器。

        这里统一封装了：
        - 向量表名
        - embedding 维度
        - hybrid search 配置
        - 同步和异步数据库连接串
        """
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

    def _embed_model(self):
        """创建 embedding 客户端，用于文本向量化。

        优先从数据库读取指定的 embedding 模型配置；
        如果没有指定，尝试退回激活配置；
        最后再使用环境变量兜底。
        """
        from llama_index.embeddings.openai import OpenAIEmbedding

        runtime = self._resolve_embed_runtime_config()
        return OpenAIEmbedding(
            model=runtime.model,
            dimensions=self.settings.RAG_EMBED_DIM,
            api_key=runtime.api_key,
            api_base=runtime.base_url or None,
        )

    def _llm(self):
        """创建问答阶段使用的大模型客户端。

        优先从数据库读取指定的聊天模型配置；
        如果没有指定，尝试退回激活配置；
        最后再使用环境变量兜底。
        """
        from llama_index.llms.openai import OpenAI

        runtime = self._resolve_chat_runtime_config()
        return OpenAI(
            model=runtime.model,
            api_key=runtime.api_key,
            api_base=runtime.base_url or None,
        )

    def _text_node_cls(self):
        """延迟加载 `TextNode` 类，避免在模块导入阶段就提前加载 LlamaIndex 类型。"""
        from llama_index.core.schema import TextNode

        return TextNode

    def _resolve_chat_runtime_config(self) -> ModelRuntimeConfig:
        """解析聊天模型配置。

        读取顺序：
        - `RAG_CHAT_MODEL_CONFIG_NAME` 指定的数据库配置
        - `model_configs` 表中的激活配置
        - 环境变量兜底
        """
        return self._resolve_runtime_config(
            configured_name=self.settings.RAG_CHAT_MODEL_CONFIG_NAME,
            env_model=self.settings.RAG_CHAT_MODEL,
            purpose="chat",
        )

    def _resolve_embed_runtime_config(self) -> ModelRuntimeConfig:
        """解析 embedding 模型配置。

        读取顺序：
        - `RAG_EMBED_MODEL_CONFIG_NAME` 指定的数据库配置
        - `model_configs` 表中的激活配置
        - 环境变量兜底
        """
        return self._resolve_runtime_config(
            configured_name=self.settings.RAG_EMBED_MODEL_CONFIG_NAME,
            env_model=self.settings.RAG_EMBED_MODEL,
            purpose="embedding",
        )

    def _resolve_runtime_config(
        self,
        *,
        configured_name: str,
        env_model: str,
        purpose: str,
    ) -> ModelRuntimeConfig:
        """统一解析运行时模型配置。

        这个方法负责把“数据库配置优先、环境变量兜底”的规则收口到一处，
        避免聊天模型和 embedding 模型各自维护一套判断逻辑。
        """
        name = configured_name.strip()
        if name:
            row = self._fetch_model_config_by_name(name)
            if row is None:
                raise HTTPException(
                    status_code=500,
                    detail=f'Configured {purpose} model config "{name}" was not found',
                )
            return self._to_runtime_config(row, source="model_configs:name")

        active = self._fetch_active_model_config()
        if active is not None:
            model = active["model"]
            if purpose == "embedding" and env_model.strip():
                model = env_model.strip()
            return ModelRuntimeConfig(
                provider=active["provider"],
                model=model,
                api_key=active["api_key"],
                base_url=active["base_url"],
                source="model_configs:active",
                name=active["name"],
            )

        return ModelRuntimeConfig(
            provider="openai",
            model=env_model.strip(),
            api_key=self.settings.RAG_OPENAI_API_KEY,
            base_url=self.settings.RAG_OPENAI_BASE_URL,
            source="env",
            name=None,
        )

    def _fetch_model_config_by_name(self, name: str) -> dict[str, Any] | None:
        """按配置名从 `model_configs` 表读取模型配置。"""
        sql = """
            SELECT name, provider, model, api_key, base_url, is_active
            FROM model_configs
            WHERE name = %s
            ORDER BY is_active DESC, created_at DESC
            LIMIT 1
        """
        with psycopg.connect(self.settings.postgres_sync_dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (name,))
                row = cur.fetchone()
        return self._map_model_config_row(row)

    def _fetch_active_model_config(self) -> dict[str, Any] | None:
        """读取当前激活的模型配置。"""
        sql = """
            SELECT name, provider, model, api_key, base_url, is_active
            FROM model_configs
            WHERE is_active = TRUE
            ORDER BY created_at DESC
            LIMIT 1
        """
        with psycopg.connect(self.settings.postgres_sync_dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(sql)
                row = cur.fetchone()
        return self._map_model_config_row(row)

    def _map_model_config_row(self, row: Any) -> dict[str, Any] | None:
        """把数据库查询结果转换成统一字典结构。"""
        if row is None:
            return None
        return {
            "name": row[0],
            "provider": row[1],
            "model": row[2],
            "api_key": row[3],
            "base_url": row[4],
            "is_active": row[5],
        }

    def _to_runtime_config(self, row: dict[str, Any], *, source: str) -> ModelRuntimeConfig:
        """把数据库行结构转换成运行时模型配置对象。"""
        return ModelRuntimeConfig(
            provider=str(row["provider"]),
            model=str(row["model"]),
            api_key=str(row["api_key"] or ""),
            base_url=str(row["base_url"] or ""),
            source=source,
            name=str(row["name"]),
        )
