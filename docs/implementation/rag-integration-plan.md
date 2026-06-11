# RAG 集成计划

> 项目：intelligentAgent
> 创建日期：2026-06-09
> 更新日期：2026-06-09
> 状态：待启动

## 目标

为 Agent 添加 RAG（Retrieval-Augmented Generation）能力，使其能够基于用户上传的文档进行语义检索和增强回答。

---

## 技术选型

### 框架：LlamaIndex TS（`llamaindex` npm 包）

**选择理由**：LlamaIndex 有完整的 TypeScript 版本，不需要引入 Python 微服务，和现有 TS 技术栈统一。

| 组件 | 选择 | 理由 |
|---|---|---|
| RAG 框架 | **LlamaIndex TS** (`llamaindex`) | 原生 TS，内置文档加载、分块、Embedding、向量存储、查询引擎 |
| 向量数据库 | **pgvector** (PostgreSQL 扩展) | 无需额外基础设施，复用现有 PostgreSQL |
| 向量存储 | **PGVectorStore** (`@llamaindex/pg`) | LlamaIndex 官方 PG 集成，自动管理表和索引 |
| Embedding | **OpenAIEmbedding** (`@llamaindex/openai`) | 支持 OpenAI 兼容接口（Qwen、DeepSeek 等） |
| 文档分块 | **SentenceSplitter** | LlamaIndex 内置，支持 chunkSize + chunkOverlap |
| 向量索引 | **HNSW** | 检索精度高，适合中小规模（<100万条） |

### 需要安装的包

```bash
cd backend/agent-backend-ts
pnpm add llamaindex @llamaindex/openai @llamaindex/pg
```

---

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
| pgvector 镜像 | ✅ | `infra/docker-compose.yml` 已用 `pgvector/pgvector:pg16` |

### 缺失（~40%）

| 能力 | 状态 | 说明 |
|---|---|---|
| Embedding 生成 | ❌ | 无 embedding 服务、无模型配置 |
| 向量存储 | ❌ | 无向量列、无向量索引 |
| 语义检索 | ❌ | 仅有 ILIKE 关键词匹配 |
| Agent 检索工具 | ❌ | Agent 无法感知已上传的文档 |
| RAG 上下文注入 | ❌ | 检索结果未注入 Agent 提示词 |

---

## 实施计划

### 阶段 1：LlamaIndex 基础集成

**目标**：用 LlamaIndex TS 替代手动 Embedding + 向量存储，打通文档 → 向量 → 检索链路。

#### 1.1 安装依赖

```bash
cd backend/agent-backend-ts
pnpm add llamaindex @llamaindex/openai @llamaindex/pg
```

#### 1.2 LlamaIndex 配置服务

新建文件：`backend/agent-backend-ts/src/rag/rag.service.ts`

```typescript
import { PGVectorStore } from "@llamaindex/pg";
import { OpenAIEmbedding } from "@llamaindex/openai";
import {
  Document,
  IngestionPipeline,
  SentenceSplitter,
  VectorStoreIndex,
  Settings,
  MetadataMode,
} from "llamaindex";

@Injectable()
export class RagService {
  private vectorStore: PGVectorStore;
  private pipeline: IngestionPipeline;

  constructor(private configService: ConfigService) {
    // 初始化 PG 向量存储
    this.vectorStore = new PGVectorStore({
      clientConfig: {
        host: configService.get("PG_HOST"),
        port: configService.get("PG_PORT"),
        database: configService.get("PG_DATABASE"),
        user: configService.get("PG_USER"),
        password: configService.get("PG_PASSWORD"),
      },
      dimensions: 1536,
      tableName: "llamaindex_vector",
    });

    // 配置 Embedding 模型
    Settings.embedModel = new OpenAIEmbedding({
      model: configService.get("EMBEDDING_MODEL", "text-embedding-3-small"),
      apiKey: configService.get("EMBEDDING_API_KEY"),
      baseURL: configService.get("EMBEDDING_BASE_URL"),
    });

    // 文档入库管道：分块 → 向量化 → 存储
    this.pipeline = new IngestionPipeline({
      transformations: [
        new SentenceSplitter({
          chunkSize: configService.get("RAG_CHUNK_SIZE", 1024),
          chunkOverlap: configService.get("RAG_CHUNK_OVERLAP", 20),
        }),
        Settings.embedModel,
      ],
      vectorStore: this.vectorStore,
    });
  }

  /** 文档入库：解析后的文本 → 分块 → Embedding → 存入 PG */
  async ingestDocument(text: string, metadata: {
    fileName: string;
    attachmentId: string;
    threadId?: string;
  }): Promise<void> {
    const doc = new Document({
      text,
      id_: metadata.attachmentId,
      metadata: {
        file_name: metadata.fileName,
        attachment_id: metadata.attachmentId,
        thread_id: metadata.threadId ?? "",
      },
    });
    await this.pipeline.run({ documents: [doc] });
  }

  /** 语义检索：查询 → 向量相似度 → 返回相关片段 */
  async search(query: string, options?: {
    topK?: number;
    threadId?: string;
  }): Promise<Array<{ content: string; score: number; metadata: any }>> {
    const index = await VectorStoreIndex.fromVectorStore(this.vectorStore);
    const queryEngine = index.asQueryEngine({
      similarityTopK: options?.topK ?? 5,
    });

    const { sourceNodes } = await queryEngine.query({ query });

    return (sourceNodes ?? []).map((node) => ({
      content: node.node.getContent(MetadataMode.NONE),
      score: node.score ?? 0,
      metadata: node.node.metadata,
    }));
  }

  /** 删除指定附件的向量数据 */
  async deleteByAttachment(attachmentId: string): Promise<void> {
    // LlamaIndex PGVectorStore 支持按 metadata 过滤删除
    // 具体实现取决于 @llamaindex/pg 版本的 API
  }
}
```

#### 1.3 修改附件处理链路

修改 `agent-queue.processor.ts`，在分块后调用 LlamaIndex 入库：

```typescript
// 现有流程：下载 → 解析 → 分块 → 存入 AttachmentChunk 表
// 新增流程：下载 → 解析 → 分块 → 存入 AttachmentChunk 表 → LlamaIndex 入库（向量化）

async processAttachmentJob(attachmentId: string) {
  // ... 现有解析逻辑不变 ...

  // 新增：调用 LlamaIndex 入库
  await this.ragService.ingestDocument(parsed.text, {
    fileName: attachment.fileName,
    attachmentId: attachment.id,
    threadId: attachment.threadId,
  });
}
```

#### 1.4 环境变量

```bash
# .env 新增
EMBEDDING_MODEL=text-embedding-3-small   # Embedding 模型
EMBEDDING_API_KEY=                        # Embedding API Key（复用 Provider Key）
EMBEDDING_BASE_URL=                       # 自定义 Embedding 端点（可选）
RAG_CHUNK_SIZE=1024                       # 分块大小
RAG_CHUNK_OVERLAP=20                      # 分块重叠
```

**交付物**：
- [ ] 安装 `llamaindex`、`@llamaindex/openai`、`@llamaindex/pg`
- [ ] 实现 `RagService`（入库 + 检索）
- [ ] 修改处理链路集成 LlamaIndex
- [ ] 环境变量配置

---

### 阶段 2：语义检索 API

**目标**：暴露语义检索端点，支持关键词 + 语义混合检索。

#### 2.1 检索 API 改造

改造现有 `GET /v1/attachments/search` 端点：

```
GET /v1/attachments/search?query=违约金&threadId=xxx&mode=hybrid&topK=5
```

参数：
- `query`：检索文本（必填）
- `threadId`：限定线程（可选）
- `mode`：`keyword` | `semantic` | `hybrid`（默认 `hybrid`）
- `topK`：返回数量（默认 5）

#### 2.2 混合检索实现

```typescript
async hybridSearch(params: { query: string; threadId?: string; topK?: number }) {
  const [keywordResults, semanticResults] = await Promise.all([
    this.keywordSearch(params),           // 现有 ILIKE 搜索
    this.ragService.search(params.query, { topK: params.topK }),  // LlamaIndex 语义搜索
  ]);
  return this.rrfMerge(keywordResults, semanticResults);  // Reciprocal Rank Fusion
}
```

**交付物**：
- [ ] 检索 API 改造（支持 keyword/semantic/hybrid 模式）
- [ ] 混合检索 RRF 合并逻辑
- [ ] 检索结果 DTO（含 similarity 分数、来源信息）

---

### 阶段 3：Agent 工具集成

**目标**：让 Agent 能够主动检索文档。

#### 3.1 新增 `search_documents` 工具

在 `core/agent-core-ts/ts/tools.ts` 中定义 Schema，在 `agent-backend-ts` 中注入实现：

```typescript
// agent.service.ts — 注入 RAG 工具
const ragTools = [
  tool(
    async ({ query }) => {
      const results = await this.ragService.search(query, { topK: 5 });
      return results.map(r =>
        `[来源: ${r.metadata.file_name}] (相似度: ${r.score.toFixed(2)})\n${r.content}`
      ).join("\n\n");
    },
    {
      name: "search_documents",
      description: "搜索已上传文档中的相关内容。当用户提问涉及已上传的文档时使用此工具。",
      schema: z.object({
        query: z.string().describe("搜索问题"),
      }),
    }
  ),
];
```

#### 3.2 新增 `read_document` 工具

```typescript
const readDocumentTool = tool(
  async ({ attachmentId, startChunk, endChunk }) => {
    // 从 AttachmentChunk 表读取指定范围的分块内容
  },
  {
    name: "read_document",
    description: "读取指定文档的完整内容或部分内容。当需要查看文档全文时使用。",
    schema: z.object({
      attachmentId: z.string().describe("文档 ID"),
      startChunk: z.number().optional().default(0),
      endChunk: z.number().optional(),
    }),
  }
);
```

#### 3.3 系统提示词增强

```
你拥有文档检索能力。当用户的问题可能与已上传的文档相关时，
优先使用 search_documents 工具检索相关文档片段，然后基于检索结果回答。
回答时应引用来源文档名称，并在可能的情况下指出具体内容所在的段落。
```

**交付物**：
- [ ] `search_documents` 工具实现
- [ ] `read_document` 工具实现
- [ ] 系统提示词 RAG 指引
- [ ] Agent 检索 API 端点

---

### 阶段 4：增强优化（按需迭代）

#### 4.1 自动上下文注入

每次 Agent 调用时，自动检索当前 thread 的相关文档注入上下文：

```typescript
// agent.ts - invoke() 方法中
const relevantDocs = await this.ragService.search(userMessage, { topK: 3 });
if (relevantDocs.length > 0) {
  messages.unshift({
    role: "system",
    content: `以下是与用户问题相关的文档内容：\n${formatResults(relevantDocs)}`,
  });
}
```

#### 4.2 引用溯源

Agent 回答时标注来源，前端可点击跳转到原文。

#### 4.3 Re-ranking

对 Top-K 结果用 Cross-encoder 重排序，提升精度。

#### 4.4 文档摘要

上传后自动生成摘要，存储在 `Attachment.metadata.summary`。

#### 4.5 多模态文档支持

图片内容描述（Vision API），使图片也可被语义检索。

---

## 架构分层

### 决策：工具 Schema 在 Core，实现在 Backend

```
┌─────────────────────────────────────────────────────┐
│                  agent-core-ts                       │
│                                                      │
│  tools.ts                                            │
│  ├── search_documents (Schema + Description)         │
│  ├── read_document    (Schema + Description)         │
│  └── ... 其他内置工具                                 │
└──────────────────────┬───────────────────────────────┘
                       │ 工具注册时注入实现
┌──────────────────────▼───────────────────────────────┐
│               agent-backend-ts                        │
│                                                      │
│  rag/rag.service.ts      ← LlamaIndex 入库 + 检索    │
│  attachment.service.ts    ← 混合检索（关键词 + 语义）  │
│  agent.service.ts         ← 注入 RAG 工具到 Agent     │
└──────────────────────────────────────────────────────┘
         ↓ 向量存储
┌─────────────────────────────────────────────────────┐
│  PostgreSQL + pgvector                               │
│  ├── AttachmentChunk 表（现有，存文本分块）            │
│  └── llamaindex_vector 表（LlamaIndex 管理，存向量）   │
└─────────────────────────────────────────────────────┘
```

### 三层职责

| 层 | 职责 | RAG 相关 |
|---|---|---|
| **agent-core** | Agent 编排、工具调度、事件流 | 定义工具 Schema 和描述 |
| **agent-backend** | API、数据库、外部服务调用 | LlamaIndex 入库/检索、工具实现注入 |
| **infra** | 数据库、向量索引、存储 | pgvector 扩展、HNSW 索引 |

---

## 环境变量清单

```bash
# === RAG 相关（LlamaIndex） ===
EMBEDDING_MODEL=text-embedding-3-small    # Embedding 模型名称
EMBEDDING_API_KEY=                        # Embedding API Key（留空则复用 Provider Key）
EMBEDDING_BASE_URL=                       # 自定义 Embedding 端点（可选）
RAG_CHUNK_SIZE=1024                       # 分块大小（字符数）
RAG_CHUNK_OVERLAP=20                      # 分块重叠（字符数）
RAG_TOP_K=5                               # 默认检索返回数量
```

---

## 验收标准

### 阶段 1 验收
- [ ] `llamaindex`、`@llamaindex/openai`、`@llamaindex/pg` 安装成功
- [ ] 上传 PDF 后，LlamaIndex 自动分块、向量化、存入 `llamaindex_vector` 表
- [ ] 向量维度正确（1536）

### 阶段 2 验收
- [ ] `GET /v1/attachments/search?query=xxx&mode=semantic` 返回语义检索结果
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
| Embedding API 限流 | 大文档处理慢 | LlamaIndex IngestionPipeline 内置批量处理 |
| 向量维度与模型不匹配 | 数据写入失败 | 配置校验，启动时检查 |
| LlamaIndex PGVectorStore 自动建表 | 可能和现有 AttachmentChunk 表冲突 | 使用独立表名 `llamaindex_vector` |
| 中文分块效果 | 语义断裂 | SentenceSplitter 支持自定义分隔符 |
| 存储成本 | 大量向量占用空间 | 定期清理过期数据 |

---

## LlamaIndex TS 关键文档

- [GitHub: run-llama/llama_index](https://github.com/run-llama/llama_index)
- [PGVectorStore 集成](https://github.com/run-llama/llamaindexts/blob/main/examples/storage/pg/README.md)
- [RAG 教程](https://github.com/run-llama/llamaindexts/blob/main/docs/src/content/docs/framework/tutorials/rag/index.mdx)
- [Agentic RAG 教程](https://github.com/run-llama/llamaindexts/blob/main/docs/src/content/docs/framework/tutorials/agents/4_agentic_rag.mdx)
