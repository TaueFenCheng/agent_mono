# Python 微服务架构设计

> 创建日期：2026-06-09
> 场景：TS 主服务需要调用 Python 专属能力（LlamaParse、高级 Re-ranking 等）

## 什么时候需要这个

当 LlamaIndex TS 版本无法满足需求时，才引入 Python 微服务：

| 需求 | TS 版本 | Python 微服务 |
|---|---|---|
| RAG 基础能力（入库 + 检索） | ✅ 直接用 | 不需要 |
| LlamaParse（复杂 PDF 表格/OCR） | ❌ | ✅ 必须 |
| 高级 Re-ranking（Cohere/LLMRerank） | ⚠️ 基础 | ✅ 完整 |
| LlamaHub 数据连接器（130+） | ❌ | ✅ 必须 |
| 评估框架 / 知识图谱 | ❌ | ✅ 必须 |

**原则：能用 TS 解决的不引入 Python 微服务。**

---

## 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户浏览器                                 │
│                     http://localhost:3000                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                   Next.js 前端 (:3000)                           │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP
┌────────────────────────────▼────────────────────────────────────┐
│                NestJS 后端 (:8080) — 主服务                      │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐      │
│  │ Agent 服务    │  │ 附件服务     │  │ RAG 服务          │      │
│  │ (LangGraph)  │  │ (上传/解析)  │  │ (LlamaIndex TS)  │      │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘      │
│         │                 │                    │                 │
│         │    需要 Python 专属能力时             │                 │
│         │    ↓ HTTP 调用                       │                 │
│  ┌──────▼─────────────────▼────────────────────▼─────────┐      │
│  │              Python 微服务客户端                        │      │
│  │         (封装 HTTP 调用，提供 TS 接口)                  │      │
│  └──────────────────────┬────────────────────────────────┘      │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTP (内部网络)
┌─────────────────────────▼───────────────────────────────────────┐
│              Python 微服务 (:8081) — 辅助服务                    │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐      │
│  │ LlamaParse   │  │ Re-ranking   │  │ 数据连接器        │      │
│  │ (文档解析)    │  │ (重排序)     │  │ (LlamaHub)       │      │
│  └──────────────┘  └──────────────┘  └──────────────────┘      │
│                                                                  │
│  FastAPI + uvicorn                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  PostgreSQL + pgvector     Redis          S3/MinIO              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 技术栈

| 组件 | 选择 | 理由 |
|---|---|---|
| Web 框架 | **FastAPI** | 异步、自动 OpenAPI 文档、Pydantic 校验 |
| ASGI 服务器 | **uvicorn** | FastAPI 默认，性能好 |
| 包管理 | **uv** | 比 pip 快，锁文件可复现 |
| LlamaIndex | `llama-index-core` + 按需集成包 | 模块化引入 |
| 文档解析 | `llama-parse` | LlamaParse 官方 SDK |
| 容器化 | Docker | 和现有 docker-compose 统一管理 |

---

## 服务目录结构

```
backend/agent-backend-python-llama/
├── app/
│   ├── main.py                 # FastAPI 入口
│   ├── config.py               # 配置（Pydantic Settings）
│   ├── routers/
│   │   ├── parse.py            # LlamaParse 文档解析
│   │   ├── rerank.py           # Re-ranking 重排序
│   │   ├── connectors.py       # LlamaHub 数据连接器
│   │   └── health.py           # 健康检查
│   ├── services/
│   │   ├── parse_service.py    # LlamaParse 封装
│   │   ├── rerank_service.py   # Re-ranking 封装
│   │   └── connector_service.py
│   └── schemas/
│       ├── parse_request.py    # 请求 DTO
│       ├── parse_response.py   # 响应 DTO
│       └── rerank_request.py
├── pyproject.toml
├── uv.lock
└── Dockerfile
```

---

## API 设计

### 1. LlamaParse 文档解析

```
POST /v1/parse/document
Content-Type: multipart/form-data

Body:
  file: <binary>              # 上传的文件
  language: "chinese"         # OCR 语言
  output_format: "markdown"   # 输出格式：markdown | text | structured

Response:
{
  "job_id": "parse-xxx",
  "status": "processing",
  "poll_url": "/v1/parse/jobs/parse-xxx"
}
```

```
GET /v1/parse/jobs/{job_id}

Response:
{
  "job_id": "parse-xxx",
  "status": "completed",
  "result": {
    "text": "解析后的文本...",
    "pages": [
      { "page": 1, "content": "..." },
      { "page": 2, "content": "..." }
    ],
    "metadata": {
      "page_count": 5,
      "language": "chinese",
      "has_tables": true,
      "has_images": true
    }
  }
}
```

### 2. Re-ranking

```
POST /v1/rerank
Content-Type: application/json

{
  "query": "违约金是多少",
  "documents": [
    { "id": "chunk-1", "content": "违约金为合同总额的5%" },
    { "id": "chunk-2", "content": "甲方应在30日内支付款项" },
    { "id": "chunk-3", "content": "如逾期未付，需承担滞纳金" }
  ],
  "top_n": 3,
  "model": "llm"              # llm | cohere | sentence-transformer
}

Response:
{
  "results": [
    { "id": "chunk-1", "content": "违约金为合同总额的5%", "score": 0.95 },
    { "id": "chunk-3", "content": "如逾期未付，需承担滞纳金", "score": 0.82 },
    { "id": "chunk-2", "content": "甲方应在30日内支付款项", "score": 0.45 }
  ]
}
```

### 3. 数据连接器

```
POST /v1/connectors/fetch
Content-Type: application/json

{
  "connector_type": "notion",     # notion | google_drive | confluence | github
  "config": {
    "api_key": "...",
    "database_id": "..."
  },
  "output_format": "documents"    # documents | raw
}

Response:
{
  "documents": [
    { "id": "doc-1", "text": "...", "metadata": { "source": "notion", "title": "..." } }
  ],
  "total": 15
}
```

### 4. 健康检查

```
GET /v1/health

Response:
{
  "status": "up",
  "version": "0.1.0",
  "capabilities": ["parse", "rerank", "connectors"],
  "uptime_seconds": 3600
}
```

---

## TS 后端调用方式

### 客户端封装

新建文件：`backend/agent-backend-ts/src/llama/llama-client.service.ts`

```typescript
import { Injectable, HttpException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

interface ParseResult {
  jobId: string;
  status: string;
  pollUrl: string;
}

interface ParseJobResult {
  jobId: string;
  status: "processing" | "completed" | "failed";
  result?: {
    text: string;
    pages: Array<{ page: number; content: string }>;
    metadata: Record<string, unknown>;
  };
}

interface RerankResult {
  results: Array<{ id: string; content: string; score: number }>;
}

@Injectable()
export class LlamaClientService {
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.baseUrl = configService.get("LLAMA_SERVICE_URL", "http://localhost:8081");
  }

  /** 调用 LlamaParse 解析文档 */
  async parseDocument(file: Buffer, fileName: string, options?: {
    language?: string;
    outputFormat?: string;
  }): Promise<ParseJobResult> {
    const formData = new FormData();
    formData.append("file", new Blob([file]), fileName);
    if (options?.language) formData.append("language", options.language);
    if (options?.outputFormat) formData.append("output_format", options.outputFormat);

    // 提交解析任务
    const submitRes = await fetch(`${this.baseUrl}/v1/parse/document`, {
      method: "POST",
      body: formData,
    });
    if (!submitRes.ok) throw new HttpException("Parse submission failed", submitRes.status);
    const { job_id, poll_url } = await submitRes.json();

    // 轮询等待完成
    return this.pollJob<ParseJobResult>(`${this.baseUrl}${poll_url}`);
  }

  /** 调用 Re-ranking */
  async rerank(query: string, documents: Array<{ id: string; content: string }>, topN = 5): Promise<RerankResult> {
    const res = await fetch(`${this.baseUrl}/v1/rerank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, documents, top_n: topN, model: "llm" }),
    });
    if (!res.ok) throw new HttpException("Rerank failed", res.status);
    return res.json();
  }

  /** 通用轮询 */
  private async pollJob<T>(url: string, maxWaitMs = 60000): Promise<T> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === "completed") return data as T;
      if (data.status === "failed") throw new HttpException("Job failed", 500);
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new HttpException("Job timeout", 408);
  }
}
```

### 在附件处理中调用

```typescript
// attachment.service.ts
async processAttachmentJob(attachmentId: string) {
  // ... 现有解析逻辑 ...

  // 如果是复杂 PDF，调用 LlamaParse
  if (attachment.contentType === "application/pdf" && needsAdvancedParsing) {
    const parsed = await this.llamaClient.parseDocument(buffer, attachment.fileName, {
      language: "chinese",
      outputFormat: "markdown",
    });
    text = parsed.result.text;
  }

  // ... 后续分块 + LlamaIndex 入库 ...
}
```

### 在检索中调用 Re-ranking

```typescript
// rag.service.ts
async searchWithRerank(query: string, topK = 10) {
  // 1. LlamaIndex TS 语义检索（多取一些）
  const candidates = await this.ragService.search(query, { topK });

  // 2. 调用 Python 微服务 Re-ranking（精排）
  const reranked = await this.llamaClient.rerank(
    query,
    candidates.map((c, i) => ({ id: `chunk-${i}`, content: c.content })),
    5
  );

  return reranked.results;
}
```

---

## Docker 集成

### Dockerfile（Python 微服务）

```dockerfile
FROM python:3.12-slim

RUN pip install uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY app/ ./app/

EXPOSE 8081
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8081"]
```

### docker-compose.yml 新增服务

```yaml
services:
  # ... 现有服务 ...

  llama-service:
    build:
      context: ../backend/agent-backend-python-llama
      dockerfile: Dockerfile
    container_name: intelligent-agent-llama
    environment:
      - LLAMA_CLOUD_API_KEY=${LLAMA_CLOUD_API_KEY}   # LlamaParse API Key
      - OPENAI_API_KEY=${OPENAI_API_KEY}              # Embedding/LLM
      - DATABASE_URL=postgresql://intelligent:intelligent@postgres:5432/intelligent_agent
    ports:
      - "8081:8081"
    depends_on:
      postgres:
        condition: service_healthy
```

### .env.docker 新增

```bash
# Python 微服务
LLAMA_SERVICE_URL=http://llama-service:8081
LLAMA_CLOUD_API_KEY=                  # LlamaParse API Key（可选）
```

---

## 通信模式

### 同步 HTTP（简单场景）

```
TS 后端 → HTTP POST → Python 微服务 → 返回结果
```

适合：Re-ranking、简单文档解析（<5秒）

### 异步轮询（长任务）

```
TS 后端 → HTTP POST → Python 微服务 → 返回 job_id
TS 后端 → HTTP GET /jobs/{id} → 轮询直到完成
```

适合：LlamaParse 复杂文档解析（可能需要 30秒+）

### 消息队列（高并发场景，可选）

```
TS 后端 → BullMQ 队列 → Python Worker → 结果写回 Redis/DB
```

适合：大批量文档处理、需要背压控制

---

## 错误处理

```typescript
// TS 客户端统一错误处理
async callLlamaService<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpException) {
      // Python 微服务返回的错误，直接透传
      throw error;
    }
    if (error.code === "ECONNREFUSED") {
      // Python 微服务未启动，降级到 TS 实现
      this.logger.warn("Llama service unavailable, falling back to TS implementation");
      return this.fallbackFn();
    }
    throw error;
  }
}
```

**降级策略**：Python 微服务不可用时，自动降级到 LlamaIndex TS 的基础能力。

---

## 安全考虑

| 风险 | 措施 |
|---|---|
| 内部网络暴露 | Python 微服务只在 Docker 内部网络通信，不对外暴露端口（或仅暴露给 localhost） |
| API Key 泄露 | 通过环境变量注入，不硬编码 |
| 文件上传大小 | Nginx / FastAPI 限制 max upload size |
| 请求超时 | 设置合理的超时时间，避免长时间阻塞 |
| 输入校验 | FastAPI + Pydantic 自动校验所有请求参数 |

---

## 何时引入的决策树

```
需要某个 Python 专属功能？
    │
    ├── 否 → 继续用 LlamaIndex TS，不需要微服务
    │
    └── 是 → 这个功能能否用其他方式替代？
              │
              ├── 能（如用 TS 手写 Re-ranking） → 不引入
              │
              └── 不能（如 LlamaParse 无 TS 版本） → 引入 Python 微服务
                                                    仅暴露这一个端点
```

**最小化原则**：只把 Python 微服务当作"能力补充层"，不要把已经在 TS 中实现的功能搬到 Python。
