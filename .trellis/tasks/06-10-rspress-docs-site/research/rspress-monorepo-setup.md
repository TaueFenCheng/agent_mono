# RSPress Monorepo 接入研究

## 参考项目：lowcode-platform

`lowcode-platform` 使用 **VitePress**（非 RSPress），但结构可复用：

| 项 | lowcode-platform | agent_mono 计划 |
|---|---|---|
| docs 包位置 | `docs/package.json` | 同 |
| workspace | `pnpm-workspace.yaml` 含 `docs` | 新增 `docs` |
| 根脚本 | `docs:dev` → `pnpm --filter docs dev` | `docs:dev` → `pnpm --filter @intelligent-agent/docs dev` |
| 配置 | `docs/.vitepress/config.ts` | `docs/rspress.config.ts` |

## RSPress v2 要点

- 包名：`@rspress/core`（v1 为 `rspress`）
- 配置：`defineConfig` from `@rspress/core`
- `root`：文档根目录，相对 cwd；在 `docs/` 包内可设 `root: '.'` 或 `path.join(__dirname)`
- 自动导航：根目录 `_nav.json` + 各子目录 `_meta.json`；**不要在 rspress.config.ts 中同时声明 nav/sidebar**

## 推荐目录结构

```
docs/
├── package.json
├── rspress.config.ts
├── tsconfig.json
├── index.md
├── _nav.json
├── _meta.json
├── interview/
│   └── *.md
├── yunfan/
│   └── *.md
└── *.md
```

## 命令

```bash
# 在 docs 包目录
rspress dev
rspress build
rspress preview
```
