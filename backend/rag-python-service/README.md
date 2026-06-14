# RAG Python Service

独立 Python 微服务，使用 `FastAPI + LlamaIndex + pgvector` 实现 RAG，不耦合现有 `agent-backend-python`。

## 能力

- `POST /v1/rag/index`
  - 直接索引文本内容
- `POST /v1/rag/index/attachments`
  - 读取主库里的 `attachments` / `attachment_chunks`，把已处理的附件 chunk 写入 pgvector
- `POST /v1/rag/search`
  - 语义检索
- `POST /v1/rag/query`
  - 检索增强问答
- `GET /health`
  - 健康检查

所有成功响应统一为：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

失败响应统一为：

```json
{
  "code": 400,
  "message": "error message",
  "data": null,
  "details": {}
}
```

## 环境变量

可复用主项目 Postgres：

```bash
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_USER=intelligent
POSTGRES_PASSWORD=intelligent
POSTGRES_DB=intelligent_agent
```

LlamaIndex 依赖的模型配置：

```bash
RAG_CHAT_MODEL_CONFIG_NAME=
RAG_EMBED_MODEL_CONFIG_NAME=
RAG_OPENAI_API_KEY=your-key
RAG_OPENAI_BASE_URL=
RAG_EMBED_MODEL=text-embedding-3-small
RAG_CHAT_MODEL=gpt-4o-mini
RAG_EMBED_DIM=1536
PORT=8082
```

模型读取规则：

- 优先读取 `model_configs` 表
- 如果设置了 `RAG_CHAT_MODEL_CONFIG_NAME` / `RAG_EMBED_MODEL_CONFIG_NAME`，优先按配置名读取
- 如果没有设置配置名，退回数据库里的激活配置
- 如果数据库里没有可用配置，再退回 `RAG_OPENAI_BASE_URL`、`RAG_OPENAI_API_KEY`、`RAG_EMBED_MODEL`、`RAG_CHAT_MODEL`

如果你使用兼容 OpenAI 的模型网关，可以只改 `RAG_OPENAI_BASE_URL`、`RAG_OPENAI_API_KEY`、`RAG_EMBED_MODEL`、`RAG_CHAT_MODEL` 作为兜底配置。

## 启动

```bash
cd backend/rag-python-service
uv sync
uv run uvicorn app.main:app --reload --port 8082
```

## 示例

索引文本：

```bash
curl -X POST http://127.0.0.1:8082/v1/rag/index \
  -H 'Content-Type: application/json' \
  -d '{
    "documents": [
      {
        "documentId": "doc-001",
        "text": "LlamaIndex can store embeddings in pgvector.",
        "threadId": "thread-demo",
        "metadata": { "category": "note" }
      }
    ]
  }'
```

索引附件 chunk：

```bash
curl -X POST http://127.0.0.1:8082/v1/rag/index/attachments \
  -H 'Content-Type: application/json' \
  -d '{
    "attachmentIds": ["your-attachment-id"]
  }'
```

语义检索：

```bash
curl -X POST http://127.0.0.1:8082/v1/rag/search \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "pgvector 是做什么的？",
    "topK": 3
  }'
```

检索增强问答：

```bash
curl -X POST http://127.0.0.1:8082/v1/rag/query \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "项目里的 RAG 现在基于什么存储？",
    "topK": 3
  }'
```

## 设计说明

- 该服务和 `agent-backend-python` 完全分离
- 共享同一个 Postgres，直接读取 `attachment_chunks`
- pgvector 表由 LlamaIndex `PGVectorStore` 管理，服务启动时会确保 `vector` extension 存在
- 数据库访问统一下沉到 `app/persistence/session.py` 和 `app/repositories/*`
- `RagService` 只负责编排 repository、模型配置解析、LlamaIndex 索引和检索流程
- 当前已经支持由主后端在附件处理完成后自动触发 `/v1/rag/index/attachments`
- 自动触发链路说明见 [`/Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/UPLOAD_TASK_FLOW.md`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/UPLOAD_TASK_FLOW.md>)
