import type { AgentRunEvent } from "./events";
import type { AgentInvokeOutput, SubagentFailurePolicy, SubagentResult, SubagentRole, SubagentRunInput, SubagentRunOutput, SubagentTask } from "./types";

export interface SubagentExecutionOptions {
  defaultMaxConcurrency: number;
  defaultTaskTimeoutMs: number;
  maxTasksPerRun: number;
  failurePolicy: SubagentFailurePolicy;
  roleModelOverrides?: Partial<Record<SubagentRole, { provider?: string; model?: string }>>;
  roleToolAllowlist?: Partial<Record<SubagentRole, string[]>>;
}

export interface SubagentInvokeDelegate {
  invoke(input: {
    prompt: string;
    threadId: string;
    provider?: string;
    model?: string;
    metadata?: Record<string, unknown>;
    enabledSkills?: string[];
    runId?: string;
    toolAllowlist?: string[];
  }): Promise<AgentInvokeOutput>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0 || !Number.isFinite(timeoutMs)) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Subagent task timed out after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => clearTimeout(timer));
  });
}

function extractJsonArray(text: string): unknown[] | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  const jsonText = candidate.slice(start, end + 1);
  try {
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizePlannedTasks(raw: unknown[]): SubagentTask[] {
  const tasks: SubagentTask[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const prompt = (item as { prompt?: unknown }).prompt;
    if ((role === "planner" || role === "researcher" || role === "coder") && typeof prompt === "string" && prompt.trim()) {
      tasks.push({
        taskId: typeof (item as { taskId?: unknown }).taskId === "string" ? (item as { taskId: string }).taskId : undefined,
        role,
        prompt: prompt.trim(),
        provider: typeof (item as { provider?: unknown }).provider === "string" ? ((item as { provider: string }).provider as any) : undefined,
        model: typeof (item as { model?: unknown }).model === "string" ? (item as { model: string }).model : undefined
      });
    }
  }
  return tasks;
}

function defaultPlan(prompt: string): SubagentTask[] {
  return [
    { taskId: "task-1", role: "researcher", prompt: `研究并拆解以下任务的关键事实、约束和风险：${prompt}` },
    { taskId: "task-2", role: "coder", prompt: `基于研究结论给出可执行的实现方案与关键代码结构：${prompt}` }
  ];
}

async function planTasks(
  input: SubagentRunInput,
  invokeDelegate: SubagentInvokeDelegate,
  options: SubagentExecutionOptions
): Promise<SubagentTask[]> {
  if (input.tasks && input.tasks.length > 0) return input.tasks;
  if (!input.prompt?.trim()) throw new Error("Subagent run requires `prompt` when `tasks` is empty.");

  const plannerOverride = input.roleModelOverrides?.planner ?? options.roleModelOverrides?.planner;
  const plannerPrompt = [
    "你是任务规划器。请将用户目标拆解为最多 3 个可并行子任务。",
    "只输出 JSON 数组，每项格式：{\"taskId\":\"task-1\",\"role\":\"researcher|coder\",\"prompt\":\"...\"}",
    "不要输出额外解释。",
    `用户目标：${input.prompt}`
  ].join("\n");

  try {
    const planned = await invokeDelegate.invoke({
      prompt: plannerPrompt,
      threadId: `${input.threadId}:sub:${input.runId ?? input.threadId}:planner`,
      provider: plannerOverride?.provider ?? input.provider,
      model: plannerOverride?.model ?? input.model,
      metadata: input.metadata,
      enabledSkills: input.enabledSkills,
      runId: `${input.runId ?? input.threadId}:planner`,
      toolAllowlist: options.roleToolAllowlist?.planner
    });
    const parsed = extractJsonArray(planned.output ?? "");
    if (!parsed) return defaultPlan(input.prompt);
    const tasks = normalizePlannedTasks(parsed);
    return tasks.length > 0 ? tasks : defaultPlan(input.prompt);
  } catch {
    return defaultPlan(input.prompt);
  }
}

function buildRolePrompt(role: SubagentRole, taskPrompt: string, parentPrompt?: string): string {
  const roleHeader =
    role === "researcher"
      ? "你是研究子代理。产出应包含事实、假设、风险和可验证结论。"
      : role === "coder"
        ? "你是实现子代理。产出应包含可执行步骤、关键代码建议和验证点。"
        : "你是规划子代理。产出应结构化、可执行。";
  return [roleHeader, parentPrompt ? `上游目标：${parentPrompt}` : "", `当前子任务：${taskPrompt}`].filter(Boolean).join("\n\n");
}

async function summarizeResults(
  input: SubagentRunInput,
  invokeDelegate: SubagentInvokeDelegate,
  results: SubagentResult[],
  partial: boolean
): Promise<string> {
  const concise = results.map((item) => ({
    taskId: item.taskId,
    role: item.role,
    status: item.status,
    output: item.output?.slice(0, 2000) ?? null,
    error: item.error ?? null
  }));
  try {
    const summary = await invokeDelegate.invoke({
      prompt: [
        "你是 supervisor，总结子代理执行结果，输出精炼中文总结。",
        partial ? "注意：有部分子任务失败，请给出降级建议。" : "全部子任务已完成，请给出整合结论。",
        `原目标：${input.prompt ?? "N/A"}`,
        `子任务结果：${JSON.stringify(concise)}`
      ].join("\n\n"),
      threadId: input.threadId,
      provider: input.provider,
      model: input.model,
      metadata: input.metadata,
      enabledSkills: input.enabledSkills,
      runId: `${input.runId ?? input.threadId}:summary`
    });
    return summary.output || "Subagent run completed.";
  } catch {
    const succ = results.filter((item) => item.status === "succeeded").length;
    const fail = results.length - succ;
    return `Subagent run completed. succeeded=${succ}, failed=${fail}.`;
  }
}

export async function runSubagents(
  input: SubagentRunInput,
  invokeDelegate: SubagentInvokeDelegate,
  options: SubagentExecutionOptions,
  emit?: (event: AgentRunEvent) => void | Promise<void>
): Promise<SubagentRunOutput> {
  const runId = input.runId ?? `subrun-${Date.now()}`;
  const createdAt = nowIso();
  const maxTasksPerRun = options.maxTasksPerRun;
  const maxConcurrency = Math.max(1, Math.min(input.maxConcurrency ?? options.defaultMaxConcurrency, 8));
  const taskTimeoutMs = Math.max(500, input.taskTimeoutMs ?? options.defaultTaskTimeoutMs);
  const failurePolicy = options.failurePolicy;

  const plannedTasks = await planTasks({ ...input, runId }, invokeDelegate, options);
  if (plannedTasks.length === 0) throw new Error("Subagent plan returned no tasks.");
  if (plannedTasks.length > maxTasksPerRun) {
    throw new Error(`Too many subagent tasks: ${plannedTasks.length}, max=${maxTasksPerRun}`);
  }

  await emit?.({
    type: "plan_created",
    runId,
    threadId: input.threadId,
    taskCount: plannedTasks.length,
    at: nowIso()
  });

  const results: SubagentResult[] = new Array(plannedTasks.length);
  let cursor = 0;
  let aborted = false;

  const worker = async () => {
    while (true) {
      if (aborted) return;
      const index = cursor;
      cursor += 1;
      if (index >= plannedTasks.length) return;
      const task = plannedTasks[index];
      const taskId = task.taskId?.trim() || `task-${index + 1}`;
      const subThreadId = `${input.threadId}:sub:${runId}:${taskId}`;
      const startedAt = nowIso();
      const started = Date.now();

      await emit?.({
        type: "subagent_start",
        runId,
        threadId: input.threadId,
        taskId,
        role: task.role,
        subThreadId,
        at: startedAt
      });

      const roleOverride = input.roleModelOverrides?.[task.role] ?? options.roleModelOverrides?.[task.role];
      const provider = task.provider ?? roleOverride?.provider ?? input.provider;
      const model = task.model ?? roleOverride?.model ?? input.model;
      const allowlist = options.roleToolAllowlist?.[task.role];

      try {
        const output = await withTimeout(
          invokeDelegate.invoke({
            prompt: buildRolePrompt(task.role, task.prompt, input.prompt),
            threadId: subThreadId,
            provider,
            model,
            metadata: { ...(input.metadata ?? {}), ...(task.metadata ?? {}), parent_thread_id: input.threadId, subagent_role: task.role },
            enabledSkills: input.enabledSkills,
            runId: `${runId}:${taskId}`,
            toolAllowlist: allowlist
          }),
          taskTimeoutMs
        );
        const endedAt = nowIso();
        const durationMs = Date.now() - started;
        results[index] = {
          taskId,
          role: task.role,
          status: "succeeded",
          threadId: subThreadId,
          provider: output.provider,
          model,
          output: output.output,
          error: null,
          startedAt,
          endedAt,
          durationMs,
          checkpointId: output.checkpointId ?? null
        };
        await emit?.({
          type: "subagent_end",
          runId,
          threadId: input.threadId,
          taskId,
          role: task.role,
          subThreadId,
          status: "succeeded",
          durationMs,
          at: endedAt
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const timedOut = /timed out/i.test(message);
        const endedAt = nowIso();
        const durationMs = Date.now() - started;
        results[index] = {
          taskId,
          role: task.role,
          status: timedOut ? "timed_out" : "failed",
          threadId: subThreadId,
          provider: provider ?? null,
          model: model ?? null,
          output: null,
          error: message,
          startedAt,
          endedAt,
          durationMs,
          checkpointId: null
        };
        await emit?.({
          type: "subagent_error",
          runId,
          threadId: input.threadId,
          taskId,
          role: task.role,
          subThreadId,
          message,
          at: endedAt
        });
        await emit?.({
          type: "subagent_end",
          runId,
          threadId: input.threadId,
          taskId,
          role: task.role,
          subThreadId,
          status: timedOut ? "timed_out" : "failed",
          durationMs,
          at: endedAt
        });
        if (failurePolicy === "fail_fast") {
          aborted = true;
        }
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(maxConcurrency, plannedTasks.length) }, () => worker()));

  const finalResults = results.filter(Boolean) as SubagentResult[];
  const succeededTasks = finalResults.filter((item) => item.status === "succeeded");
  const failedTasks = finalResults.filter((item) => item.status !== "succeeded");
  const partial = failedTasks.length > 0;
  const summary = await summarizeResults({ ...input, runId, tasks: plannedTasks }, invokeDelegate, finalResults, partial);

  return {
    runId,
    threadId: input.threadId,
    partial,
    summary,
    tasks: plannedTasks.map((task, index) => ({ ...task, taskId: task.taskId ?? `task-${index + 1}` })),
    results: finalResults,
    succeededTasks,
    failedTasks,
    createdAt
  };
}

