# Next.js Web 项目架构说明

## 基本信息

| 项目 | 说明 |
|------|------|
| 包名 | `@intelligent-agent/web` |
| Next.js 版本 | 15.3.3 |
| 路由方式 | App Router（纯 `app/` 目录，无 `pages/`） |
| 渲染方式 | **纯 CSR**（客户端渲染） |
| 样式方案 | Tailwind CSS 3.x + CSS 变量主题系统 |
| UI 组件库 | `@intelligent-agent/ui`（monorepo 内部包） |
| 数据请求 | 原生 `fetch` + 自研 `AsyncResource` hook |
| 测试 | Vitest + @testing-library/react + jsdom |
| 包管理 | pnpm workspace（monorepo） |

---

## 目录结构

```
frontend/web/
├── app/
│   ├── layout.tsx               # 根布局（Server Component，无数据获取）
│   ├── page.tsx                 # 首页（"use client"）
│   ├── globals.css              # Tailwind 入口 + CSS 变量主题
│   ├── api/
│   │   ├── agent-run/route.ts   # POST 代理 → 后端 /v1/agents/runs
│   │   ├── health/route.ts      # GET 代理 → 后端 /health
│   │   ├── model-configs/
│   │   │   ├── route.ts         # GET/POST 代理 → 后端 /v1/model-configs
│   │   │   └── [id]/
│   │   │       ├── route.ts     # GET/PUT/DELETE 代理 → 后端 /v1/model-configs/:id
│   │   │       └── activate/
│   │   │           └── route.ts # POST 代理 → 后端 /v1/model-configs/:id/activate
│   │   └── providers/route.ts   # GET 代理 → 后端 /v1/providers
│   ├── login/
│   │   └── page.tsx             # 登录页
│   ├── agent/
│   │   └── page.tsx             # Agent 工作台
│   └── settings/
│       ├── layout.tsx           # 设置页面布局（侧边导航）
│       ├── page.tsx             # 设置首页（重定向到 models）
│       └── models/
│           └── page.tsx         # 模型配置管理页
├── components/
│   ├── agent-page-shell.tsx     # Agent 页面外壳（认证守卫 + 顶栏）
│   ├── agent-workspace-wrapper.tsx # AgentWorkspace 客户端包装
│   ├── async-resource.tsx       # 通用异步资源渲染组件
│   ├── auth-storage.ts          # 认证存储工具（localStorage）
│   ├── health-status-panel.tsx  # 健康状态面板
│   └── login-form.tsx           # 登录表单组件
├── lib/
│   └── use-async-resource.ts    # 自定义异步数据 hook
├── test/
│   ├── setup.ts                 # 测试初始化
│   └── async-resource.test.tsx  # 组件测试
├── next.config.ts               # 极简配置，仅 reactStrictMode
└── tailwind.config.ts           # Tailwind 配置
```

---

## 路由方式：App Router

使用 Next.js 15 的 **App Router**（`app/` 目录约定），不使用旧版 Pages Router。

当前路由结构非常扁平：

**页面路由：**

| 路由 | 文件 | 类型 |
|------|------|------|
| `/` | `app/page.tsx` | 首页重定向 |
| `/login` | `app/login/page.tsx` | 登录页（Client Component） |
| `/agent` | `app/agent/page.tsx` | Agent 工作台（Client Component） |
| `/settings` | `app/settings/page.tsx` | 设置首页（重定向到 models） |
| `/settings/models` | `app/settings/models/page.tsx` | 模型配置管理（Client Component） |

**API 路由（BFF 代理层）：**

| 路由 | 文件 | 方法 | 代理目标 |
|------|------|------|---------|
| `/api/health` | `app/api/health/route.ts` | GET | 后端 `/health` |
| `/api/agent-run` | `app/api/agent-run/route.ts` | POST | 后端 `/v1/agents/runs` |
| `/api/threads` | `app/api/threads/route.ts` | GET | 后端 `/v1/threads` |
| `/api/auth/login` | `app/api/auth/login/route.ts` | POST | 后端 `/v1/auth/token` |
| `/api/model-configs` | `app/api/model-configs/route.ts` | GET/POST | 后端 `/v1/model-configs` |
| `/api/model-configs/:id` | `app/api/model-configs/[id]/route.ts` | GET/PUT/DELETE | 后端 `/v1/model-configs/:id` |
| `/api/model-configs/:id/activate` | `app/api/model-configs/[id]/activate/route.ts` | POST | 后端 `/v1/model-configs/:id/activate` |
| `/api/providers` | `app/api/providers/route.ts` | GET | 后端 `/v1/providers` |

**未使用的 App Router 特性：**
- 无 `loading.tsx`（加载态由自研组件处理）
- 无 `error.tsx`（错误态由自研组件处理）
- 无 `not-found.tsx`
- 无嵌套路由组 `(group)`、平行路由 `@slot`
- 无 `middleware.ts`

---

## 渲染方式：纯 CSR

**整个应用是 100% 客户端渲染，没有使用 SSR / SSG / ISR。**

### 判定依据

1. 所有组件都标记了 `"use client"`，包括 `page.tsx`
2. `layout.tsx` 是同步函数组件，不获取任何服务端数据
3. 没有 `"use server"` 标记，不使用 Server Actions
4. 没有 `generateStaticParams`、动态 `generateMetadata` 等 SSG/ISR API
5. `next.config.ts` 无 `revalidate` 等配置

### CSR 在本项目中的工作流程

```
┌─────────────────────────────────────────────────────┐
│  浏览器                                              │
│                                                      │
│  1. 加载 JS Bundle                                   │
│  2. React 挂载 → "use client" 组件                   │
│  3. useEffect 触发 → fetch 请求                      │
│  4. 收到响应 → setState → 重新渲染                    │
└──────────────┬──────────────────────────────────────┘
               │ fetch
               ▼
┌──────────────────────────────────────────────────────┐
│  Next.js API Route（BFF 代理层）                      │
│  /api/health, /api/agent-run, /api/model-configs     │
│                                                      │
│  接收前端请求 → 转发到后端服务 → 返回 JSON             │
└──────────────┬──────────────────────────────────────┘
               │ fetch
               ▼
┌──────────────────────────────────────────────────────┐
│  后端服务（默认 http://127.0.0.1:8080）               │
│  NestJS / FastAPI                                    │
└──────────────────────────────────────────────────────┘
```

---

## 数据请求方式

### 两层架构

#### 第一层：客户端 → BFF（浏览器到 Next.js API Route）

使用原生 `fetch` + 自研 `AsyncResource` 模式：

**`useAsyncResource` hook** — 核心数据请求 hook：
- 封装 `useState` + `useEffect` + 竞态处理（`requestIdRef`）
- 四状态机：`idle` → `loading` → `success` / `error`
- 支持 `deps` 依赖变化自动重新请求
- 支持 `immediate` 控制是否自动执行

**`AsyncResource` 组件** — 基于 hook 的渲染组件：
- Render Props 模式
- 内置 loading / error / empty 默认 UI

使用示例：

```tsx
"use client";
import { AsyncResource } from "@/components/async-resource";

export default function Page() {
  return (
    <AsyncResource loader={() => fetch("/api/health").then(r => r.json())}>
      {(data) => <div>{data.status}</div>}
    </AsyncResource>
  );
}
```

#### 第二层：BFF → 后端服务（Next.js API Route 到后端）

API Route Handler 使用原生 `fetch` 代理请求：

```ts
// app/api/health/route.ts
export async function GET() {
  const res = await fetch(`${BACKEND_URL}/health`);
  const data = await res.json();
  return NextResponse.json(data);
}
```

### 数据流总结

```
浏览器 --fetch--> /api/* (BFF) --fetch--> 后端服务 (8080)
         JSON              JSON
```

**BFF 代理层的作用：**
- 解决跨域问题（浏览器只与同源的 `/api/*` 通信）
- 集中管理认证和请求头
- 后端地址通过环境变量 `NEXT_PUBLIC_AGENT_API_BASE_URL` 配置

### 模型配置数据流

```
┌─────────────────────────────────────────────────────────┐
│  /settings/models 页面                                    │
│  - 创建/编辑/删除模型配置                                  │
│  - 激活指定配置                                           │
└──────────────┬──────────────────────────────────────────┘
               │ fetch
               ▼
┌─────────────────────────────────────────────────────────┐
│  /api/model-configs (BFF 代理)                            │
│  转发到后端 /v1/model-configs                             │
└──────────────┬──────────────────────────────────────────┘
               │ fetch
               ▼
┌─────────────────────────────────────────────────────────┐
│  后端 ModelConfigService                                  │
│  - CRUD 操作存储到 PostgreSQL                              │
│  - activate 切换当前激活配置                               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  /agent 页面（对话时）                                     │
│  - 顶栏显示模型选择器                                      │
│  - 发送消息时附带 provider/model                           │
└──────────────┬──────────────────────────────────────────┘
               │ fetch
               ▼
┌─────────────────────────────────────────────────────────┐
│  /api/agent-run → 后端 /v1/agents/runs                   │
│  Agent Runtime 读取激活的模型配置                          │
│  使用对应 provider 的 apiKey/baseUrl 创建 LLM 实例         │
└─────────────────────────────────────────────────────────┘
```

---

## CSR / SSR / SSG 对比与本项目选择

| 渲染方式 | 含义 | 本项目是否使用 | 说明 |
|----------|------|---------------|------|
| **CSR** | 客户端渲染，JS 加载后在浏览器渲染 | ✅ 是 | 全部组件 `"use client"` |
| **SSR** | 服务端渲染，每次请求在服务端生成 HTML | ❌ 否 | 无 `async` 组件、无服务端数据获取 |
| **SSG** | 静态生成，构建时生成 HTML | ❌ 否 | 无 `generateStaticParams` |
| **ISR** | 增量静态再生，定期更新静态页面 | ❌ 否 | 无 `revalidate` 配置 |

### 为什么选择 CSR

本项目是 **Agent 交互式应用**，特点是：
1. 页面内容高度动态，依赖实时 API 响应
2. 交互密集（聊天、状态轮询），SEO 不重要
3. BFF 层已解决跨域和认证问题
4. 项目处于早期，保持简单优先

### 如果后续需要 SSR 的改造路径

```tsx
// 将 page.tsx 改为 Server Component（去掉 "use client"）
// 在服务端获取数据，传递给 Client Component

// app/page.tsx — Server Component
export default async function Page() {
  const data = await fetch("http://backend/health"); // 服务端直接调用
  return <HealthPanel initialData={data} />;          // 传递给客户端组件
}

// components/health-panel.tsx — Client Component
"use client";
export function HealthPanel({ initialData }) {
  // 使用 initialData 渲染，后续交互仍走客户端
}
```

---

## 开发指南

### 启动开发服务器

```bash
# 在 monorepo 根目录
make dev-web                # 或
pnpm --filter @intelligent-agent/web dev
```

开发服务器运行在 `http://localhost:3000`。

### 新增页面

在 `app/` 目录下创建文件夹 + `page.tsx`：

```
app/
├── page.tsx              # /
├── dashboard/
│   └── page.tsx          # /dashboard
└── settings/
    ├── page.tsx          # /settings
    └── profile/
        └── page.tsx      # /settings/profile
```

### 新增 API Route

在 `app/api/` 下创建文件夹 + `route.ts`：

```ts
// app/api/example/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "ok" });
}

export async function POST(request: Request) {
  const body = await request.json();
  return NextResponse.json({ received: body });
}
```

### 新增客户端组件

```tsx
// components/my-component.tsx
"use client";

import { useState } from "react";

export function MyComponent() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

### 数据请求模式

使用已有的 `AsyncResource` 组件：

```tsx
"use client";
import { AsyncResource } from "@/components/async-resource";

export function MyPanel() {
  return (
    <AsyncResource
      loader={() => fetch("/api/my-endpoint").then(r => r.json())}
      deps={[]}  // 依赖变化时自动重新请求
    >
      {(data) => (
        <div>
          {/* 渲染数据 */}
        </div>
      )}
    </AsyncResource>
  );
}
```

或直接使用 `useAsyncResource` hook：

```tsx
"use client";
import { useAsyncResource } from "@/lib/use-async-resource";

export function MyPanel() {
  const { state, data, error, execute } = useAsyncResource(
    () => fetch("/api/my-endpoint").then(r => r.json()),
    { immediate: true, deps: [] }
  );

  if (state === "loading") return <div>加载中...</div>;
  if (state === "error") return <div>错误: {error?.message}</div>;
  if (state === "success") return <div>{JSON.stringify(data)}</div>;
  return null;
}
```

### 样式开发

使用 Tailwind CSS，主题通过 CSS 变量定义在 `globals.css` 中：

```tsx
// 直接使用 Tailwind 类名
<div className="bg-background text-foreground p-4 rounded-lg">
  <h1 className="text-2xl font-bold">标题</h1>
</div>
```

### 测试

```bash
pnpm --filter @intelligent-agent/web test     # 运行测试
pnpm --filter @intelligent-agent/web test:watch  # watch 模式
```

组件测试示例：

```tsx
import { render, screen } from "@testing-library/react";
import { MyComponent } from "./my-component";

test("renders correctly", () => {
  render(<MyComponent />);
  expect(screen.getByText("hello")).toBeInTheDocument();
});
```
