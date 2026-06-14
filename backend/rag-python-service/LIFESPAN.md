# FastAPI `lifespan` 与 `app.state` 用法说明

本文说明 [`app/main.py`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/main.py>) 中这段代码的作用：

```python
async def lifespan(app: FastAPI):
    rag_service = getattr(app.state, "rag_service", None)
    if rag_service is None:
        rag_service = RagService(settings)
        rag_service.ensure_ready()
        app.state.rag_service = rag_service
    yield


app = FastAPI(
    title="rag-python-service",
    version="0.1.0",
    lifespan=lifespan,
)
```

## 结论

这段代码是在做两件事：

1. 用 `lifespan` 管理应用启动和关闭阶段
2. 用 `app.state` 挂载全局共享的 `RagService` 实例

也就是说，`RagService` 不是每个请求都新建一次，而是在应用启动时初始化一次，后续所有路由复用同一个实例。

## `lifespan` 是什么

`lifespan` 是 FastAPI 的应用生命周期钩子。

它会在两个时机执行：

1. 应用启动前，执行 `yield` 之前的代码
2. 应用关闭时，执行 `yield` 之后的代码

当前实现里：

```python
async def lifespan(app: FastAPI):
    rag_service = getattr(app.state, "rag_service", None)
    if rag_service is None:
        rag_service = RagService(settings)
        rag_service.ensure_ready()
        app.state.rag_service = rag_service
    yield
```

`yield` 之前做的是启动初始化：

- 检查 `app.state` 上是否已经有 `rag_service`
- 如果没有，就创建一个 `RagService`
- 调用 `ensure_ready()` 做启动前准备
- 挂到 `app.state.rag_service`

这里 `yield` 之后目前没有清理逻辑，所以关闭时不做额外处理。

## `app.state` 是什么

`app.state` 是 FastAPI/Starlette 提供的应用级共享状态对象。

它适合放这类内容：

- 数据库连接
- 缓存客户端
- 配置好的服务对象
- 单例资源

当前代码里：

```python
app.state.rag_service = rag_service
```

意思是把 `rag_service` 保存到应用实例上，后续任何请求都可以通过 `request.app.state.rag_service` 拿到它。

例如在 [`app/routers/rag.py`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/routers/rag.py>)：

```python
payload = request.app.state.rag_service.index_text_documents(request_body)
```

这里就是从应用共享状态里取出 `RagService`，再调用具体业务方法。

## 为什么要这样写

这种写法的目的是把“初始化”和“请求处理”分开。

如果不这么做，常见的坏写法会变成：

```python
@router.post("/index")
def index_text(request_body: IndexTextRequest):
    rag_service = RagService(settings)
    rag_service.ensure_ready()
    return rag_service.index_text_documents(request_body)
```

问题很明显：

- 每个请求都重新创建 `RagService`
- 每个请求都重复做 `ensure_ready()`
- 启动成本高
- 资源管理混乱

现在的写法更合理：

- 服务初始化一次
- 请求里只做业务调用
- 路由层保持干净

## `getattr(app.state, "rag_service", None)` 为什么不用直接取

这里用了：

```python
rag_service = getattr(app.state, "rag_service", None)
```

而不是：

```python
rag_service = app.state.rag_service
```

原因是前者更安全。

如果 `rag_service` 还没挂进去，直接访问：

```python
app.state.rag_service
```

会抛 `AttributeError`。

而 `getattr(..., None)` 的效果是：

- 有这个属性就返回它
- 没有就返回 `None`

这样可以自然进入：

```python
if rag_service is None:
```

这也是当前测试里可复用假对象的一个基础。

## 为什么加 `if rag_service is None`

这是为了避免重复初始化。

虽然正常服务启动时只会初始化一次，但这里做了额外保护，带来的好处有两个：

1. 测试中可以先手动注入 `app.state.rag_service = FakeRagService()`
2. 以后如果启动流程有变化，不容易重复 new 出多个实例

所以这不是多余代码，是有明确用途的。

## `ensure_ready()` 在这里做什么

当前 [`app/services/rag_service.py`](</Users/tangjiaqiang/code/tangAgent/backend/rag-python-service/app/services/rag_service.py>) 里：

```python
def ensure_ready(self) -> None:
    with psycopg.connect(self.settings.postgres_sync_dsn) as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
```

它的职责是做启动期准备，确保 Postgres 里的 `vector` extension 可用。

这类逻辑就应该放在启动阶段，而不是放在每个请求里反复执行。

## 整体调用链

当前调用链可以这样理解：

1. FastAPI 启动
2. 执行 `lifespan`
3. 创建并准备 `RagService`
4. 保存到 `app.state.rag_service`
5. 请求进入路由
6. 路由通过 `request.app.state.rag_service` 拿到共享实例
7. 调用具体方法，例如 `index_text_documents()`

## 适用场景

这种模式适合下面这些场景：

- 单服务内共享一个业务服务实例
- 启动时需要预热资源
- 路由层不想直接管理初始化细节

对这个项目来说，`RagService` 很适合这样管理，因为它依赖：

- 配置
- Postgres
- pgvector
- LlamaIndex 相关资源

## 什么时候不适合

如果对象是：

- 强请求级别状态
- 每次请求都不同
- 需要按用户或租户隔离

那就不应该挂在 `app.state` 上，而应该走依赖注入或请求级构造。

`RagService` 当前不是这种场景，所以挂 `app.state` 是合理的。
