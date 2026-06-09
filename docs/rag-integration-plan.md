# RAG 集成计划

> 项目：intelligentAgent
> 创建日期：2026-06-09
> 状态：待启动

## 目标

为 Agent 添加 RAG（Retrieval-Augmented Generation）能力，使其能够基于用户上传的文档进行语义检索和增强回答。

## 现有能力盘点

### 已完成（~60%）

| 能力 | 状态 | 关键文件 |
|---|---|---|
| 文档上传（S3/MinIO） | ✅ | `backend/agent-backend-ts/src/attachment/attachment.storage.ts` |
| 文档解析（PDF/DOCX/OCR/代码） | ✅ | `backend/agent-backend-ts/src/attachment/attachment.parser.ts` |
| 文本分块 | ✅ | `attachment.parser.ts` → `chunkText()` |
| 异步处理队列 | ✅ | `backend/agent-backend-ts/src/agent/agent-queue.processor.ts` |
| 附件/分块 DB 模型 | ✅ | `backend/agent-backend-ts/prisma/schema.prisma` |
| 关键词搜索 | ✅ | `backend/agent-backend-ts/src/attachment/attachment.service.ts` |

### 缺失（~40%）

| 能力 | 状态 | 说明 |
|---|---|---|
| Embedding 生成 | ❌ | 无 embedding 服务、无模型配置 |
| 向量存储（pgvector） | ❌ | 无向量列、无向量索引 |
| 语义检索 | ❌ | 仅有 ILIKE 关键词匹配 |
| Agent 检索工具 | ❌ | Agent 无法感知已上传的文档 |
| RAG 上下文注入 | ❌ | 检索结果未注入 Agent 提示词 |

---

## 实施计划

### 阶段 1：向量基础设施

**目标**：打通文档 → 向量的完整链路

#### 1.1 启用 pgvector 扩展

修改 Docker Compose，使用 pgvector 官方镜像：

```yaml
# infra/docker-compose.yml
postgres:
  image: pgvector/pgvector:pg16
  # ... 其余配置不变
```

数据库启动后执行：
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

#### 1.2 数据库模型改造

在 `AttachmentChunk` 表新增向量列：

```prisma
// backend/agent-backend-ts/prisma/schema.prisma
model AttachmentChunk {
  id           String   @id @default(uuid())
  attachmentId String
  threadId     String
  chunkIndex   Int
  content      String
  tokenCount   Int      @default(0)
  embedding    Unsupported("vector(1536)")?  // 新增：向量列
  createdAt    DateTime @default(now())

  attachment   Attachment @relation(fields: [attachmentId], references: [id], onDelete: Cascade)

  @@unique([attachmentId, chunkIndex])
  @@index([threadId])
  @@index([attachmentId])
}
```

创建 HNSW 索引（迁移脚本）：
```sql
CREATE INDEX IF NOT EXISTS idx_attachment_chunk_embedding
ON "AttachmentChunk"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

#### 1.3 Embedding 服务

新建文件：`backend/agent-backend-ts/src/attachment/embedding.service.ts`

```typescript
@Injectable()
export class EmbeddingService {
  // 支持多种 Provider
  async embed(texts: string[]): Promise<number[][]> {
    // 根据 EMBEDDING_PROVIDER 环境变量选择实现
    // - qwen: DashScope text-embedding-v3
    // - openai: text-embedding-3-small
    // - local: 本地模型（可选）
  }

  async embedBatch(texts: string[], batchSize = 20): Promise<number[][]> {
    // 分批处理，避免 API 限流
  }
}
```

#### 1.4 处理链路补全

修改 `agent-queue.processor.ts`，在分块后调用 Embedding：

```typescript
// 现有流程：下载 → 解析 → 分块 → 存储
// 新增流程：下载 → 解析 → 分块 → 存储 → [生成Embedding → 更新向量列]
```

#### 1.5 环境变量

```bash
# .env.example 新增
EMBEDDING_PROVIDER=qwen          # qwen | openai
EMBEDDING_MODEL=text-embedding-v3
EMBEDDING_API_KEY=               # 默认复用对应 Provider 的 API Key
EMBEDDING_BASE_URL=              # 可选，自定义端点
EMBEDDING_DIMENSIONS=1536        # 向量维度
```

**交付物**：
- [ ] Docker Compose 使用 pgvector 镜像
- [ ] Prisma schema 新增 vector 列 + 迁移脚本
- [ ] `EmbeddingService` 实现
- [ ] 处理链路集成 Embedding 生成
- [ ] 环境变量配置

---

### 阶段 2：语义检索能力

**目标**：支持基于向量相似度的文档检索

#### 2.1 向量相似度搜索

在 `attachment.service.ts` 新增方法：

```typescript
async semanticSearch(params: {
  query: string;           // 用户查询文本
  threadId?: string;       // 限定线程范围
  attachmentId?: string;   // 限定附件范围
  topK?: number;           // 返回数量，默认 5
  threshold?: number;      // 相似度阈值，默认 0.7
}): Promise<SearchResult[]> {
  // 1. 将 query 文本转为 embedding
  // 2. 执行 cosine_distance 查询
  // 3. 返回结果（含相似度分数、来源文件、分块内容）
}
```

核心 SQL：
```sql
SELECT
  ac.id,
  ac.content,
  ac."chunkIndex",
  a."fileName",
  1 - (ac.embedding <=> $1::vector) AS similarity
FROM "AttachmentChunk" ac
JOIN "Attachment" a ON a.id = ac."attachmentId"
WHERE
  ac.embedding IS NOT NULL
  AND ($2::text IS NULL OR ac."threadId" = $2)
  AND ($3::text IS NULL OR ac."attachmentId" = $3)
ORDER BY ac.embedding <=> $1::vector
LIMIT $4;
```

#### 2.2 混合检索

结合关键词检索和语义检索，使用 Reciprocal Rank Fusion (RRF) 合并排序：

```typescript
async hybridSearch(params: {
  query: string;
  threadId?: string;
  topK?: number;
}): Promise<SearchResult[]> {
  const [keywordResults, semanticResults] = await Promise.all([
    this.keywordSearch(params),
    this.semanticSearch(params),
  ]);
  return this.rrfMerge(keywordResults, semanticResults);
}
```

#### 2.3 检索 API 改造

改造现有 `GET /v1/attachments/search` 端点：

```
GET /v1/attachments/search?query=违约金&threadId=xxx&mode=hybrid&topK=5
```

参数：
- `query`：检索文本（必填）
- `threadId`：限定线程（可选）
- `attachmentId`：限定附件（可选）
- `mode`：`keyword` | `semantic` | `hybrid`（默认 `hybrid`）
- `topK`：返回数量（默认 5）

**交付物**：
- [ ] `semanticSearch()` 方法实现
- [ ] `hybridSearch()` 方法实现（RRF 合并）
- [ ] 检索 API 改造
- [ ] 检索结果 DTO（含 similarity 分数、来源信息）

---

### 阶段 3：Agent 工具集成

**目标**：让 Agent 能够主动检索文档

#### 3.1 新增 `search_documents` 工具

在 `core/agent-core-ts/ts/tools.ts` 中注册：

```typescript
const searchDocumentsTool = tool(
  async ({ query, threadId, topK }) => {
    // 调用后端语义检索 API
    // 返回格式化的文档片段
  },
  {
    name: 'search_documents',
    description: '搜索已上传文档中的相关内容。当用户提问涉及已上传的文档时使用此工具。',
    schema: z.object({
      query: z.string().describe('搜索关键词或问题'),
      threadId: z.string().optional().describe('限定搜索范围的线程 ID'),
      topK: z.number().optional().default(5).describe('返回结果数量'),
    }),
  }
);
```

#### 3.2 新增 `read_document` 工具

```typescript
const readDocumentTool = tool(
  async ({ attachmentId, startChunk, endChunk }) => {
    // 读取指定附件的指定范围分块内容
  },
  {
    name: 'read_document',
    description: '读取指定文档的完整内容或部分内容。当需要查看文档全文时使用。',
    schema: z.object({
      attachmentId: z.string().describe('文档 ID'),
      startChunk: z.number().optional().default(0).describe('起始分块索引'),
      endChunk: z.number().optional().describe('结束分块索引'),
    }),
  }
);
```

#### 3.3 系统提示词增强

在 Agent 系统提示词中添加 RAG 相关指引：

```
你拥有文档检索能力。当用户的问题可能与已上传的文档相关时，
优先使用 search_documents 工具检索相关文档片段，然后基于检索结果回答。
回答时应引用来源文档名称，并在可能的情况下指出具体内容所在的段落。
```

#### 3.4 后端检索 API

新增 Agent 专用的检索端点（供工具调用）：

```
POST /v1/agents/search-documents
Body: { query, threadId, topK }
```

**交付物**：
- [ ] `search_documents` 工具注册
- [ ] `read_document` 工具注册
- [ ] 系统提示词 RAG 指引
- [ ] Agent 检索 API 端点

---

### 阶段 4：增强优化（按需迭代）

#### 4.1 自动上下文注入

每次 Agent 调用时，自动检索当前 thread 的相关文档注入上下文：

```typescript
// agent.ts - invoke() 方法中
const relevantDocs = await this.attachmentService.semanticSearch({
  query: userMessage,
  threadId,
  topK: 3,
});
if (relevantDocs.length > 0) {
  // 将检索结果作为 system message 附加
  messages.unshift({
    role: 'system',
    content: formatRetrievedContext(relevantDocs),
  });
}
```

#### 4.2 引用溯源

Agent 回答时标注来源：

```
根据您上传的《供应商合同v2.pdf》第3条，违约金为合同总额的5%。
```

前端渲染时可点击引用跳转到原文。

#### 4.3 分块策略优化

当前使用段落分割，可扩展为：
- 递归字符分割（RecursiveCharacterTextSplitter）
- 语义分割（基于 Embedding 相似度的断点检测）
- 重叠窗口（chunk overlap）

#### 4.4 Re-ranking

对 Top-K 结果用 Cross-encoder 重排序：

```typescript
async rerank(query: string, chunks: SearchResult[]): Promise<SearchResult[]> {
  // 使用 Cohere Rerank API 或本地 Cross-encoder
}
```

#### 4.5 文档摘要

上传后自动生成摘要，存储在 `Attachment.metadata.summary` 中：

```typescript
async generateSummary(text: string): Promise<string> {
  // 调用 LLM 生成文档摘要
}
```

#### 4.6 多模态文档支持

图片内容描述（Vision API），使图片也可被语义检索。

---

## 技术选型

| 组件 | 选择 | 理由 |
|---|---|---|
| 向量数据库 | **pgvector**（PostgreSQL 扩展） | 无需额外基础设施，已有 PostgreSQL |
| 向量索引 | **HNSW** | 检索精度高，适合中小规模（<100万条） |
| Embedding 模型 | **Qwen text-embedding-v3** / **OpenAI text-embedding-3-small** | 与现有 Provider 复用 |
| 分块大小 | **1200 字符** | 当前默认值，后续可调 |
| 检索策略 | **混合检索**（RRF） | 关键词精确匹配 + 语义理解互补 |
| Embedding 维度 | **1536** | text-embedding-3-small 默认维度 |

---

## 架构分层：RAG 代码放在哪

### 决策：工具 Schema 在 Core，实现在 Backend（混合模式）

```
┌─────────────────────────────────────────────────────┐
│                  agent-core-ts                       │
│                                                      │
│  tools.ts                                            │
│  ├── search_documents (Schema + Description)         │
│  ├── read_document    (Schema + Description)         │
│  └── ... 其他内置工具                                 │
│                                                      │
│  具体的检索逻辑？→ 不放这里                            │
└──────────────────────┬───────────────────────────────┘
                       │ 工具注册时注入实现
┌──────────────────────▼───────────────────────────────┐
│               agent-backend-ts                        │
│                                                      │
│  agent.service.ts                                    │
│  ├── 创建 Agent 时注入 RAG 工具实现                    │
│  ├── 调用 attachment.service 做实际检索                │
│  └── 调用 embedding.service 做向量化                  │
│                                                      │
│  attachment.service.ts  ← 实际的检索逻辑              │
│  embedding.service.ts   ← Embedding 调用             │
└──────────────────────────────────────────────────────┘
```

### 理由

**1. Core 不应该依赖基础设施**

agent-core 定位是轻量的 Agent 编排引擎，当前内置工具都是纯函数（`get_time`、`calculate`），不依赖外部服务。如果把 RAG 检索放进去，core 就需要知道数据库连接、Embedding API 地址等，破坏其独立性。

**2. 检索逻辑依赖 Backend 已有能力**

语义检索需要数据库连接（Prisma/SQL）、Embedding 服务（HTTP 调用）、附件服务（关联查询），这些都在 `agent-backend-ts` 中。放到 core 意味着重复建设。

**3. Core 只定义工具 Schema，Backend 注入实现**

```typescript
// core/agent-core-ts/ts/tools.ts — 只定义 Schema
const searchDocumentsSchema = z.object({
  query: z.string().describe('搜索关键词或问题'),
  threadId: z.string().optional().describe('限定搜索范围的线程 ID'),
  topK: z.number().optional().default(5).describe('返回结果数量'),
});

// backend/agent-backend-ts/src/agent/agent.service.ts — 注入实现
const ragTools = [
  tool(
    (params) => this.attachmentService.semanticSearch(params),
    {
      name: 'search_documents',
      description: '搜索已上传文档中的相关内容',
      schema: searchDocumentsSchema,
    }
  ),
];

const agent = new AgentCore({
  tools: [...builtinTools, ...ragTools],
});
```

### 三层职责划分

| 层 | 职责 | RAG 相关 |
|---|---|---|
| **agent-core** | Agent 编排、工具调度、事件流 | 定义工具 Schema 和描述 |
| **agent-backend** | API、数据库、外部服务调用 | 实现检索逻辑、Embedding 调用 |
| **infra** | 数据库、向量索引、存储 | pgvector 扩展、HNSW 索引 |

### 好处

- Core 保持轻量，可独立发布和测试
- Backend 可灵活替换检索实现（如从 pgvector 切到 Qdrant，core 不用改）
- TS/Python 两个 backend 可各自实现检索逻辑，共享同一套 Schema 定义

---

## 环境变量清单

```bash
# === RAG 相关 ===
EMBEDDING_PROVIDER=qwen              # qwen | openai
EMBEDDING_MODEL=text-embedding-v3    # Embedding 模型名称
EMBEDDING_API_KEY=                   # 留空则复用对应 Provider 的 Key
EMBEDDING_BASE_URL=                  # 自定义 Embedding 端点
EMBEDDING_DIMENSIONS=1536            # 向量维度
EMBEDDING_BATCH_SIZE=20              # 批量 Embedding 大小
RAG_TOP_K=5                          # 默认检索返回数量
RAG_SIMILARITY_THRESHOLD=0.7         # 相似度阈值
RAG_CHUNK_SIZE=1200                  # 分块大小（字符数）
RAG_CHUNK_OVERLAP=200                # 分块重叠（字符数）
```

---

## 验收标准

### 阶段 1 验收
- [ ] 上传 PDF 后，`AttachmentChunk` 表中 `embedding` 列有值
- [ ] 向量维度正确（1536）
- [ ] HNSW 索引创建成功

### 阶段 2 验收
- [ ] `GET /v1/attachments/search?query=xxx` 返回按相似度排序的结果
- [ ] 结果包含 `similarity` 分数和来源文件名
- [ ] 混合检索模式同时覆盖关键词和语义匹配

### 阶段 3 验收
- [ ] Agent 能调用 `search_documents` 工具
- [ ] 用户问"根据上传的文档，XXX 是多少？"时 Agent 能正确检索并回答
- [ ] 回答中包含来源文档引用

### 阶段 4 验收
- [ ] 自动上下文注入不显著增加延迟（<500ms）
- [ ] 引用可点击跳转到原文
- [ ] 文档摘要准确且简洁

---

## 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| Embedding API 限流 | 大文档处理慢 | 批量处理 + 重试 + 指数退避 |
| 向量维度与模型不匹配 | 数据写入失败 | 配置校验，启动时检查 |
| Prisma 不原生支持 vector 类型 | 需用 `Unsupported` + `$queryRaw` | 封装 Repository 层隔离 |
| 中文分块效果 | 语义断裂 | 优化分块策略，支持语义分割 |
| 存储成本 | 大量向量占用空间 | 定期清理过期数据，压缩策略 |
