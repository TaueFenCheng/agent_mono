# LlamaIndex TypeScript vs Python 差异对比

> 创建日期：2026-06-09
> 项目决策：采用 TypeScript 版本（`llamaindex` npm 包）

## 概览

LlamaIndex 有两个主要版本：
- **TypeScript**：`llamaindex`（npm），仓库在 `run-llama/llama_index` 的 `llama-index-ts` 目录
- **Python**：`llama-index`（pip），仓库在 `run-llama/llama_index` 根目录

Python 是主力版本，TS 版本在持续追赶中，核心 RAG 能力已对齐

---

## 核心差异

| 维度 | TypeScript (`llamaindex`) | Python (`llama-index`) |
|---|---|---|
| **成熟度** | 较新，功能追赶中 | 主力版本，功能最全 |
| **包体积** | 轻量，模块化拆分 | 庞大，300+ 可选集成包 |
| **运行时** | Node.js / Deno / Bun / Edge Runtime / Cloudflare Workers | 仅 Python |
| **社区生态** | 较小但活跃 | 非常大，教程和示例丰富 |
| **安装** | `pnpm add llamaindex` | `pip install llama-index` |

---

## 功能对比

### 完全对齐的能力

| 功能 | TS | Python | 说明 |
|---|---|---|---|
| 向量索引（VectorStoreIndex） | ✅ | ✅ | 核心 RAG 能力，API 几乎一致 |
| 文档查询引擎（QueryEngine） | ✅ | ✅ | `.asQueryEngine()` → `.query()` |
| PG 向量存储（PGVectorStore） | ✅ | ✅ | 均支持 pgvector 扩展 |
| Embedding（OpenAI） | ✅ | ✅ | `OpenAIEmbedding` |
| 文档分块（SentenceSplitter） | ✅ | ✅ | chunkSize + chunkOverlap |
| 入库管道（IngestionPipeline） | ✅ | ✅ | 分块 → Embedding → 存储 |
| 单体 Agent | ✅ | ✅ | TS: `agent()` / Python: `FunctionAgent` |
| 多 Agent 协作 | ✅ | ✅ | TS: `multiAgent()` + `canHandoffTo` |
| Workflow 工作流 | ✅ | ✅ | 事件驱动模式 |
| 流式输出 | ✅ | ✅ | Agent 流式响应 |
| 工具调用（Tool Use） | ✅ | ✅ | Zod schema / Python type hints |

### Python 领先的能力

| 功能 | TS | Python | 说明 |
|---|---|---|---|
| **文档加载器数量** | ⚠️ 少量 | ✅ 130+ | Python 有 LlamaHub 生态 |
| **LlamaParse（高级解析）** | ❌ | ✅ | 复杂 PDF 表格、OCR、结构化提取 |
| **Re-ranking** | ⚠️ 基础 | ✅ 完整 | LLMRerank、Cohere Rerank、SentenceTransformer |
| **Observability** | ⚠️ 有限 | ✅ 完整 | Agenta、LangSmith、Weights & Biases 集成 |
| **本地模型支持** | ⚠️ Ollama | ✅ 更多 | HuggingFace、llama.cpp、GGML 等 |
| **评估框架** | ❌ | ✅ | 内置评估指标和基准测试 |
| **知识图谱** | ❌ | ✅ | KnowledgeGraphIndex |
| **SQL 查询引擎** | ⚠️ 基础 | ✅ 完整 | NLSQLTableQueryEngine |
| **文档摘要** | ⚠️ 基础 | ✅ 完整 | 多种摘要策略 |

### TS 独有优势

| 优势 | 说明 |
|---|---|
| **Edge Runtime 支持** | 可运行在 Vercel Edge、Cloudflare Workers 等边缘环境 |
| **更小的包体积** | 模块化设计，按需引入 |
| **Zod schema** | 工具参数用 Zod 定义，类型安全 |
| **和现有 TS 项目统一** | 不需要引入 Python 运行时 |

---

## 代码风格对比

### RAG 文档入库

```typescript
// TypeScript
import { VectorStoreIndex, Document, SentenceSplitter } from "llamaindex";

const doc = new Document({ text: "..." });
const index = await VectorStoreIndex.fromDocuments([doc]);
```

```python
# Python
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader

documents = SimpleDirectoryReader("data").load_data()
index = VectorStoreIndex.from_documents(documents)
```

### 向量检索查询

```typescript
// TypeScript
const queryEngine = index.asQueryEngine();
const response = await queryEngine.query("xxx");
console.log(response.toString());
```

```python
# Python
query_engine = index.as_query_engine()
response = query_engine.query("xxx")
print(str(response))
```

### Agent 定义

```typescript
// TypeScript — 函数式 API
import { tool } from "llamaindex";
import { agent } from "@llamaindex/workflow";
import { openai } from "@llamaindex/openai";

const myAgent = agent({
  tools: [myTool],
  llm: openai({ model: "gpt-4o-mini" }),
});
const result = await myAgent.run("Tell me a joke");
```

```python
# Python — 类式 API
from llama_index.core.agent.workflow import FunctionAgent
from llama_index.llms.openai import OpenAI

my_agent = FunctionAgent(
    tools=[multiply, search_documents],
    llm=OpenAI(model="gpt-4o-mini"),
    system_prompt="You are a helpful assistant.",
)
response = await my_agent.run("What's 7 * 8?")
```

### 多 Agent 协作

```typescript
// TypeScript
import { multiAgent } from "@llamaindex/workflow";

const workflow = multiAgent({
  agents: [weatherAgent, converterAgent],
  rootAgent: weatherAgent,
});
const events = workflow.runStream("...");
```

```python
# Python — Workflow 类式
class RAGWorkflow(Workflow):
    @step
    async def ingest(self, ctx: Context, ev: StartEvent) -> StopEvent:
        documents = SimpleDirectoryReader(dirname).load_data()
        index = VectorStoreIndex.from_documents(documents)
        return StopEvent(result=index)

    @step
    async def retrieve(self, ctx: Context, ev: StartEvent) -> RetrieverEvent:
        retriever = index.as_retriever(similarity_top_k=2)
        nodes = await retriever.aretrieve(query)
        return RetrieverEvent(nodes=nodes)
```

### PG 向量存储

```typescript
// TypeScript
import { PGVectorStore } from "@llamaindex/pg";

const vectorStore = new PGVectorStore({
  clientConfig: { host: "localhost", port: 5432, database: "test", user: "postgres", password: "postgres" },
  dimensions: 1536,
  tableName: "llamaindex_vector",
});
```

```python
# Python
from llama_index.vector_stores.postgres import PGVectorStore

vector_store = PGVectorStore(
    connection_string="postgresql://postgres:postgres@localhost:5432/test",
    table_name="llamaindex_vector",
    embed_dim=1536,
)
```

---

## 选型决策

### 选择 TS 版本的场景

- 项目主体是 TypeScript / Node.js
- 核心需求是 RAG（文档入库 + 语义检索）
- 不需要 LlamaParse 等 Python 专属功能
- 希望统一技术栈，减少运维复杂度
- 需要部署到 Edge Runtime

### 选择 Python 版本的场景

- 项目主体是 Python
- 需要 LlamaParse（复杂 PDF 解析、OCR）
- 需要大量 LlamaHub 数据连接器
- 需要完整的 Re-ranking、评估框架
- 需要知识图谱、SQL 查询等高级功能

### 混合方案（本项目不采用）

如果同时需要两者，可以用 Python 微服务暴露 HTTP API，TS 后端调用。但这增加了架构复杂度，对于本项目的核心 RAG 需求，TS 版本完全够用。

---

## 本项目的选型结论

**采用 LlamaIndex TypeScript 版本**，安装以下包：

```bash
pnpm add llamaindex @llamaindex/openai @llamaindex/pg
```

理由：
1. 项目技术栈统一为 TypeScript
2. RAG 核心能力（入库、检索、查询）TS 版本完整支持
3. PGVectorStore 原生支持，和现有 PostgreSQL 直接集成
4. 不需要 LlamaParse 等 Python 专属功能
5. 多 Agent 协作 TS 版本也支持（`multiAgent`）

---

## 参考文档

- [LlamaIndex TS GitHub](https://github.com/run-llama/llama_index/tree/main/llama-index-ts)
- [LlamaIndex TS 文档](https://ts.llamaindex.ai/)
- [LlamaIndex Python 文档](https://docs.llamaindex.ai/)
- [PGVectorStore TS 示例](https://github.com/run-llama/llamaindexts/blob/main/examples/storage/pg/README.md)
- [RAG 教程 (TS)](https://ts.llamaindex.ai/docs/framework/tutorials/rag)
- [Agent Workflow (TS)](https://ts.llamaindex.ai/docs/framework/modules/agents/agent_workflow)
