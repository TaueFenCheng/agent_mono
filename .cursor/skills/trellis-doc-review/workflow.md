# Doc Review Workflow — agent_mono

## 0. 隔离原则（强制）

| 角色 | 谁来做 | 禁止 |
| --- | --- | --- |
| 主会话（可能刚 brainstorm） | **只调度**，不写审查结论 | 主会话通读 PRD 自评 |
| `trellis-doc-review` 协调 Agent | 并行 `Task` + 汇总报告 | 协调者代替角色审查 |
| 各角色子 Agent | 只读审查 + 角色 Markdown | 修改文档/写代码 |

与 Phase 2 的 `trellis-implement` / `trellis-check` 同级：**审查工作不在主会话完成**。

## 1. 定位任务与文档

```bash
python3 ./.trellis/scripts/task.py current --source
```

- 必须有 `{task_dir}/prd.md`
- 跨包/跨层任务另读 `docs/implementation/<slug>/` 四件套（若已创建）

## 2. 调度协调 Agent（主会话）

**Agent type**: `trellis-doc-review`（`.cursor/agents/trellis-doc-review.md`）

**Task description 要点**：

- `TASK_DIR` = 当前任务目录
- 按协调 Agent 说明并行 4～5 个角色子 Agent
- 产出 `{task_dir}/doc-review-report.md`

主会话 **不得** 在子 Agent 返回前自行填写 CRITICAL。

## 3. 并行角色审查（协调 Agent 内部）

| 顺序 | 角色 | 说明文件 | 建议 subagent_type |
| --- | --- | --- | --- |
| 并行 | 产品 | `roles/product.md` | `generalPurpose` |
| 并行 | 开发 | `roles/development.md` | `trellis-research` 或 `generalPurpose` |
| 并行 | 测试 | `roles/qa.md` | `generalPurpose` |
| 并行 | UX | `roles/ux.md` | `generalPurpose` |
| 并行* | 架构 | `roles/architecture.md` | `trellis-research` 或 `generalPurpose` |

\* 仅跨包/跨层/复杂任务。

## 4. 汇总

- 模板：`report-template.md`
- 输出：`{task_dir}/doc-review-report.md`

## 5. 门禁

- 未处理 **CRITICAL** → 阻塞 Phase 2 → dispatch `trellis-doc-fix`
- fix 后 → **重新调度** `trellis-doc-review`（新一轮审查子 Agent），勿由 fix 链自评通过

## 6. 向用户汇报

- CRITICAL/HIGH 摘要表
- 报告路径
- 是否可 implement
