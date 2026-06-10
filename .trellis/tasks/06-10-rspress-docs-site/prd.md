# 建立 RSPress 文档服务预览 docs 目录

## Goal

在 `agent_mono` monorepo 中接入 RSPress 文档站点，使开发者可通过本地 dev server 预览 `docs/` 下已有 Markdown 文档。参考 `lowcode-platform` 的 docs 包模式（独立 workspace 包 + 根级 `docs:dev` 脚本 + Makefile 入口）。

## What I already know

- 现有文档位于 `docs/`，含根级 `.md` 与 `yunfan/`、`interview/` 子目录
- `lowcode-platform` 在 `docs/` 目录内放置 VitePress 配置与 `package.json`，根 `package.json` 提供 `docs:dev` / `docs:build` / `docs:preview`
- RSPress v2 使用 `@rspress/core`，支持 `_nav.json` / `_meta.json` 自动生成导航

## MVP Scope

### In scope

1. 在 `docs/` 新增 RSPress 工程文件：`package.json`、`rspress.config.ts`、`tsconfig.json`
2. 将 `docs` 加入 `pnpm-workspace.yaml`
3. 根 `package.json` 与 `Makefile` 增加 `docs:dev` / `docs:build` / `docs:preview` 与 `make dev-docs`
4. 新增 `docs/index.md` 首页及 `_nav.json`、`_meta.json` 导航配置
5. 子目录 `yunfan/`、`interview/` 使用 `_meta.json` 或自动侧边栏
6. 本地 `pnpm docs:dev` 可启动并预览现有文档

### Out of scope

- 文档内容改写或迁移
- CI 部署到静态托管
- 搜索、多语言、Mermaid 插件（后续可加）

## Acceptance Criteria

- [x] `pnpm install` 成功安装 `@rspress/core` 依赖
- [x] `pnpm docs:dev` 启动 dev server（默认端口可访问）
- [x] 浏览器可浏览 `docs/` 下所有现有 Markdown 页面
- [x] `pnpm docs:build` 构建成功

## Reference

- `lowcode-platform/docs/package.json` — workspace docs 包模式
- `lowcode-platform/package.json` — 根级 docs 脚本
- RSPress auto nav/sidebar: https://rspress.rs/guide/basic/auto-nav-sidebar
