# `frontend/web`

Next.js 15 Web 控制台，当前承担这些职责：

1. 登录与本地认证存储
2. Agent 对话工作台
3. 附件上传入口
4. 到 TS 后端的 BFF 代理

## 附件上传与 RAG 自动索引

Web 端现在已经补齐附件上传调用链：

```text
浏览器附件面板
  -> POST /api/attachments
  -> NestJS /v1/attachments
  -> BullMQ 附件解析任务
  -> 附件处理完成后自动调用 RAG 服务 /v1/rag/index/attachments
```

页面组件：

- [`/Users/tangjiaqiang/code/tangAgent/frontend/web/components/agent-page-shell.tsx`](</Users/tangjiaqiang/code/tangAgent/frontend/web/components/agent-page-shell.tsx>)
- [`/Users/tangjiaqiang/code/tangAgent/frontend/web/components/attachment-upload-panel.tsx`](</Users/tangjiaqiang/code/tangAgent/frontend/web/components/attachment-upload-panel.tsx>)
- [`/Users/tangjiaqiang/code/tangAgent/frontend/web/components/agent-workspace-wrapper.tsx`](</Users/tangjiaqiang/code/tangAgent/frontend/web/components/agent-workspace-wrapper.tsx>)

对应代理路由：

- [`/Users/tangjiaqiang/code/tangAgent/frontend/web/app/api/attachments/route.ts`](</Users/tangjiaqiang/code/tangAgent/frontend/web/app/api/attachments/route.ts>)
- [`/Users/tangjiaqiang/code/tangAgent/frontend/web/app/api/attachments/[attachmentId]/route.ts`](</Users/tangjiaqiang/code/tangAgent/frontend/web/app/api/attachments/[attachmentId]/route.ts>)
- [`/Users/tangjiaqiang/code/tangAgent/frontend/web/app/api/attachments/jobs/[jobId]/route.ts`](</Users/tangjiaqiang/code/tangAgent/frontend/web/app/api/attachments/jobs/[jobId]/route.ts>)

## 运行

```bash
pnpm --filter @intelligent-agent/web dev
```

默认地址：

- [http://localhost:3000](http://localhost:3000)

## 相关文档

- [`/Users/tangjiaqiang/code/tangAgent/frontend/web/ARCHITECTURE.md`](</Users/tangjiaqiang/code/tangAgent/frontend/web/ARCHITECTURE.md>)
