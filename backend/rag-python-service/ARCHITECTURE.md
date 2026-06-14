# RAG Python Service 代码分层说明

本文说明独立 RAG 服务的代码分层，以及每一层应该承担什么职责。

相关目录：

- [`app/main.py`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/main.py>)
- [`app/routers`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/routers>)
- [`app/services`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/services>)
- [`app/models.py`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/models.py>)
- [`app/config.py`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/config.py>)
- [`app/responses.py`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/responses.py>)

## 总体原则

这个服务按“入口层、路由层、业务层、数据结构层、基础设施层”拆开。

目标是：

- `main.py` 只负责应用启动
- `routers` 只负责 HTTP 接口
- `services` 只负责业务逻辑
- `models` 只负责请求和响应结构
- `config` 和 `responses` 负责通用基础能力

这样做的直接好处是：

- 代码职责清晰
- 业务逻辑不会堆到路由里
- 测试时可以单独替换 service
- 后续扩展接口时不会把入口文件写乱

## 1. `main.py` 的职责

文件：
[`app/main.py`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/main.py>)

它的职责只有四类：

1. 创建 FastAPI 应用
2. 注册生命周期逻辑
3. 注册中间件
4. 注册异常处理和路由

它不应该做的事：

- 不直接写 RAG 检索逻辑
- 不直接写 SQL
- 不直接处理请求参数
- 不直接拼业务响应

当前它负责的关键点有：

- `lifespan` 启动时初始化 `RagService`
- 把 `rag_service` 挂到 `app.state`
- 注册 CORS
- 注册 request id 中间件
- 注册异常处理
- `include_router(...)`

可以把 `main.py` 理解成“应用装配文件”。

## 2. `routers` 的职责

目录：
[`app/routers`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/routers>)

当前有两个路由文件：

- [`app/routers/health.py`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/routers/health.py>)
- [`app/routers/rag.py`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/routers/rag.py>)

路由层只负责：

1. 定义 URL
2. 接收请求参数
3. 调用 service
4. 返回统一响应

例如：

```python
payload = request.app.state.rag_service.index_text_documents(request_body)
return success_response(payload.model_dump())
```

这里路由只做两件事：

- 调 service
- 包返回

它不关心：

- embedding 怎么生成
- pgvector 怎么写入
- LlamaIndex 怎么构造
- SQL 怎么查附件 chunk

这些都应该留在 service 层。

### `health.py`

职责很单一：

- 暴露 `/health`
- 调 `rag_service.health_payload()`
- 返回统一格式

### `rag.py`

负责 RAG 相关接口：

- `/v1/rag/index`
- `/v1/rag/index/attachments`
- `/v1/rag/search`
- `/v1/rag/query`

这个文件应该始终保持“薄路由”，不要把检索、索引、问答逻辑写进去。

## 3. `services` 的职责

目录：
[`app/services`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/services>)

当前核心文件：

- [`app/services/rag_service.py`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/services/rag_service.py>)

这是业务层，也是这个服务最核心的一层。

它负责：

1. 启动准备
2. 建索引
3. 附件 chunk 读取
4. 语义检索
5. 检索增强问答
6. LlamaIndex 和 pgvector 的对接

### 这一层应该做什么

比如：

- `ensure_ready()`
  - 确保 `vector` extension 可用
- `index_text_documents()`
  - 把直接传入的文本转成 `TextNode`
  - 写入向量库
- `index_attachments()`
  - 从共享数据库加载附件 chunk
  - 转成节点后写入向量库
- `semantic_search()`
  - 执行向量检索
- `answer()`
  - 先检索，再基于上下文生成回答

### 这一层不应该做什么

- 不处理 HTTP 细节
- 不直接依赖 `Request`
- 不拼统一的 HTTP 包装结构
- 不写路由定义

换句话说，service 层应该尽量保持“脱离 FastAPI 也能调用”。

## 4. `models.py` 的职责

文件：
[`app/models.py`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/models.py>)

这一层只负责定义数据结构。

现在主要包含：

- 请求模型
  - `IndexTextRequest`
  - `IndexAttachmentRequest`
  - `SearchRequest`
  - `QueryRequest`
- 返回数据模型
  - `IndexResponse`
  - `SearchResponse`
  - `QueryResponse`
  - `SearchHit`

它的职责是：

1. 明确接口输入输出结构
2. 提供类型约束
3. 让 service 和 router 之间的数据边界稳定

它不应该做的事：

- 不写业务逻辑
- 不访问数据库
- 不做外部调用

## 5. `config.py` 的职责

文件：
[`app/config.py`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/config.py>)

这一层负责集中管理配置，例如：

- Postgres 连接
- 向量表名
- embedding 维度
- OpenAI 兼容模型配置
- 服务端口

这样做的好处是：

- 配置来源统一
- service 不需要散落读取环境变量
- 后续换模型或数据库时改动集中

## 6. `responses.py` 的职责

文件：
[`app/responses.py`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/responses.py>)

这一层负责统一响应协议。

它做两件事：

1. 成功响应包装
2. 失败响应包装

这样路由层不需要每个接口都重复写：

```python
{
  "code": 0,
  "message": "ok",
  "data": ...
}
```

或者错误结构。

也就是说，它负责“协议统一”，不负责业务。

## 7. 一次请求的完整链路

以 `POST /v1/rag/search` 为例：

1. 请求进入 FastAPI
2. `main.py` 注册的中间件处理 request id 和日志
3. 路由命中 [`app/routers/rag.py`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/routers/rag.py>)
4. FastAPI 把 JSON 解析成 `SearchRequest`
5. 路由调用 `request.app.state.rag_service.semantic_search(...)`
6. [`app/services/rag_service.py`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/services/rag_service.py>) 执行检索
7. service 返回 `SearchResponse`
8. 路由调用 `success_response(...)`
9. 返回统一格式 JSON

这个链路里每层只做自己的事情。

## 8. 为什么这种分层是必要的

如果不分层，最常见的问题是把所有东西都写进路由：

- 解析请求
- 拼 SQL
- 调 LlamaIndex
- 包响应
- 处理异常

最后会得到一个很难维护的文件。

当前这套拆法的重点不是“形式好看”，而是实际可维护：

- 改协议，主要动 `responses.py`
- 改业务逻辑，主要动 `rag_service.py`
- 加新接口，主要动 `routers`
- 改模型字段，主要动 `models.py`
- 改配置，主要动 `config.py`

## 9. 后续扩展建议

如果后面继续扩展这个服务，建议保持这个分层不变。

优先按下面方式增加代码：

1. 加新的请求/响应结构，先补 `models.py`
2. 加新的业务逻辑，写进 `services`
3. 最后加路由入口

如果出现更多独立业务，可以继续拆 service，例如：

- `index_service.py`
- `retrieval_service.py`
- `query_service.py`

但前提是业务复杂度真的增长了。当前规模下，一个 `RagService` 足够。
