---
pageType: home

hero:
  name: Intelligent Agent
  tagline: 全栈 Agent 平台作品。从运行时到网关，从对话到工具调用，从原型到可部署。
  actions:
    - theme: brand
      text: 架构学习指南
      link: /note/2026-06-09-agent-core-architecture-learning-guide
    - theme: alt
      text: MCP 源码走读
      link: /note/2026-06-09-mcp-implementation-walkthrough
    - theme: alt
      text: 面试问答
      link: /interview/2026-06-09-agent-mcp-interview-qa

features:
  - title: LangGraph ReAct 运行时
    details: 推理与工具调用闭环，流式 SSE，子代理派发，生产级编排内核。
  - title: MCP 与 Skills 扩展
    details: 协议化工具接入与 SKILL.md 技能注入，Agent 能力可组合、可演进。
  - title: 三层持久化
    details: Checkpoint 对话状态、Memory Facts 长期记忆、Redis 运行缓存。
  - title: 双栈 Gateway
    details: NestJS 与 FastAPI 对齐 API，TS 主路径，Python 按需补充 AI 能力。
  - title: 多端交付
    details: Web 控制台、Electron 桌面、Ink CLI，共享 Core 与 SDK。
  - title: RAG 知识管线
    details: 文档上传、异步解析、分块入库，向量检索增强回答（规划中）。
---

<div class="ia-home">

<div class="ia-section">
  <span class="ia-eyebrow">About</span>
  <h2>这是什么项目</h2>
  <p class="ia-lead">
    Intelligent Agent 是一套自研的 Agent 基础设施 Monorepo。目标不是做一个聊天窗口，而是把大模型能力以安全、可控、可扩展的方式嵌入业务：多轮记忆、工具调用、知识检索、多端交付，覆盖从 Demo 到生产的完整路径。
  </p>

  <div class="ia-split">
    <div>
      <p class="ia-lead" style="font-size: 1rem; margin-bottom: 1.5rem;">
        面向三类真实场景设计，每个场景对应可演示的产品能力与可讲解的技术深度。
      </p>
      <div class="ia-tags">
        <span>LangChain</span>
        <span>LangGraph</span>
        <span>NestJS</span>
        <span>FastAPI</span>
        <span>Next.js 15</span>
        <span>PostgreSQL</span>
        <span>Redis</span>
        <span>MCP</span>
      </div>
    </div>
    <ol class="ia-scenarios">
      <li>
        <strong>智能对话助手</strong>
        <span>多轮会话与线程持久化，流式输出，模型热切换，JWT 鉴权。Web 端左侧会话列表、右侧对话面板。</span>
      </li>
      <li>
        <strong>企业知识问答</strong>
        <span>PDF / Word / 图片上传，BullMQ 异步解析，分块入库。RAG 向量检索让 Agent 基于私有文档回答，数据不出域。</span>
      </li>
      <li>
        <strong>工具增强 Agent</strong>
        <span>MCP 协议与 Skills 体系让 Agent 从「只会说」到「能做」：查库、调 API、读代码库，内置 7+ 通用工具。</span>
      </li>
    </ol>
  </div>
</div>

<div class="ia-section">
  <span class="ia-eyebrow">Architecture</span>
  <h2>技术架构</h2>
  <p class="ia-lead">
    四层分离：客户端消费 Gateway，Gateway 调度 Agent Core，Core 路由 LLM Provider，基础设施承载状态与缓存。
  </p>

  <div class="ia-stack">
    <div class="ia-stack-row">
      <span class="ia-stack-label">Client</span>
      <span class="ia-stack-value"><em>Web :3000</em> · Electron 桌面 · Ink CLI。Next.js BFF 代理，共享 UI 与 SDK。</span>
    </div>
    <div class="ia-stack-row">
      <span class="ia-stack-label">Gateway</span>
      <span class="ia-stack-value"><em>NestJS :8080</em> · <em>FastAPI :8081</em>。HTTP API、JWT 鉴权、SSE 流式、附件队列、MCP 代理。</span>
    </div>
    <div class="ia-stack-row">
      <span class="ia-stack-label">Core</span>
      <span class="ia-stack-value"><em>agent-core-ts / py</em>。ReAct 编排、工具注册、Provider 路由、MCP 加载、记忆注入。</span>
    </div>
    <div class="ia-stack-row">
      <span class="ia-stack-label">Infra</span>
      <span class="ia-stack-value"><em>PostgreSQL 16</em> · <em>Redis 7</em> · MinIO/S3。Checkpointer、Memory Facts、运行缓存。</span>
    </div>
  </div>

  <div class="ia-columns">
    <div class="ia-block">
      <h3>核心机制</h3>
      <ul>
        <li>ReAct 循环：推理，选工具，执行，观察，再推理</li>
        <li>Checkpointer：LangGraph 状态图快照，postgres / memory 双模式</li>
        <li>Memory Facts：线程级事实记忆，跨轮次自动注入</li>
        <li>AsyncEventQueue：token / tool_call / tool_result 流式推送</li>
      </ul>
    </div>
    <div class="ia-block">
      <h3>工程取舍</h3>
      <ul>
        <li>TS 主路径：Core + Gateway + LlamaIndex TS，降低运维复杂度</li>
        <li>Python 按需：LlamaParse、高级 Re-ranking 等 TS 无法满足的能力</li>
        <li>双端 API 对齐：前端 / SDK 无感切换后端</li>
        <li>pnpm Monorepo：core-types → agent-core → sdk → ui → 后端 → 前端构建链</li>
      </ul>
    </div>
  </div>
</div>

<div class="ia-section">
  <span class="ia-eyebrow">Interview</span>
  <h2>面试怎么讲</h2>

  <blockquote class="ia-pull">
    我用 LangGraph 搭建了 ReAct Agent 运行时，做了 TS/Python 双端 Core 和双 Gateway，接入了 MCP 协议和 Skills 体系，用 PostgreSQL 持久化对话状态与记忆，并交付了 Web、Electron、CLI 三种客户端。
    <cite>开场 30 秒版本</cite>
  </blockquote>

  <div class="ia-columns">
    <div class="ia-block">
      <h3>可深入展开</h3>
      <ul>
        <li>LangGraph Checkpointer 原理与 postgres 模式实现</li>
        <li>MCP 协议握手、工具发现与调用链路</li>
        <li>多 Provider 路由与 OpenAI 兼容层抽象</li>
        <li>BFF 代理模式 vs 直连后端的取舍</li>
        <li>TS 主路径 + Python 微服务的混合架构决策</li>
        <li>RAG 管线：解析，分块，Embedding，检索</li>
      </ul>
    </div>
    <div class="ia-block">
      <h3>工程能力体现</h3>
      <ul>
        <li>Monorepo 多包协作与构建顺序管理</li>
        <li>TS / Python 双端 API 对齐与类型共享</li>
        <li>Docker Compose 本地环境标准化</li>
        <li>Vitest + pytest 双端测试覆盖</li>
        <li>Trellis 任务驱动开发与文档沉淀</li>
        <li>JWT 鉴权、BullMQ 削峰、Redis 缓存</li>
      </ul>
    </div>
  </div>
</div>

<div class="ia-section">
  <span class="ia-eyebrow">Documentation</span>
  <h2>文档索引</h2>
  <p class="ia-lead" style="margin-bottom: 2rem;">
    本站点同时是技术知识库与面试作品集。按模块进入，每篇文档标注了适合在面试中讲解的切入点。
  </p>

  <div class="ia-doc-groups">
    <div class="ia-doc-group">
      <h3>知识笔记</h3>
      <ul>
        <li>
          <a href="/note/2026-06-09-agent-core-architecture-learning-guide">Agent Core 架构学习指南</a>
          <p>分层设计、调用链路、API 速查</p>
        </li>
        <li>
          <a href="/note/2026-06-09-mcp-implementation-walkthrough">MCP 实现走读</a>
          <p>协议原理、插件加载、调用全流程</p>
        </li>
        <li>
          <a href="/note/2026-06-09-agent-backend-module-guide">后端模块指南</a>
          <p>NestJS 模块、鉴权、BullMQ 队列</p>
        </li>
        <li>
          <a href="/note/2026-06-09-checkpointer-manager-guide">Checkpointer 管理器</a>
          <p>对话状态持久化设计</p>
        </li>
      </ul>
    </div>
    <div class="ia-doc-group">
      <h3>架构设计</h3>
      <ul>
        <li>
          <a href="/implementation/rag-integration-plan">RAG 集成方案</a>
          <p>LlamaIndex TS + pgvector 规划</p>
        </li>
        <li>
          <a href="/implementation/python-microservice-architecture">Python 微服务架构</a>
          <p>TS/Python 混合架构取舍</p>
        </li>
        <li>
          <a href="/implementation/llamaindex-ts-vs-python">LlamaIndex 选型对比</a>
          <p>TS vs Python 能力矩阵</p>
        </li>
      </ul>
    </div>
    <div class="ia-doc-group">
      <h3>面试问答</h3>
      <ul>
        <li>
          <a href="/interview/2026-06-09-agent-mcp-interview-qa">MCP 面试 Q&A</a>
          <p>协议相关高频题与参考答案</p>
        </li>
        <li>
          <a href="/interview/2026-06-09-agent-storage-interview-qa">存储面试 Q&A</a>
          <p>Checkpoint / Memory 相关题</p>
        </li>
      </ul>
    </div>
  </div>
</div>

<div class="ia-section">
  <span class="ia-eyebrow">Quick Start</span>
  <h2>本地运行</h2>
  <pre class="ia-terminal"><code>cp .env.example .env && make setup
make dev-api-ts    # 后端  :8080
make dev-web       # Web   :3000
make dev-doc       # 文档  :3002</code></pre>
  <p class="ia-footnote">
    Web 与文档站端口分离。文档站固定 3002，避免与 Next.js 控制台冲突。
  </p>
</div>

</div>
