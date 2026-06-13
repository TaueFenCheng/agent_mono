import type { StructuredToolInterface } from "@langchain/core/tools";
import type {
  AgentToolEvent,
  BuildToolOptions,
  LocalToolSpec,
  ToolExecutionMode
} from "../types";

async function emitToolEvent(
  emit: BuildToolOptions["onToolEvent"],
  event: AgentToolEvent
): Promise<void> {
  if (!emit) return;
  try {
    await emit(event);
  } catch {
    // Ignore hook errors to avoid breaking tool execution.
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, toolName: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Tool "${toolName}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export class ToolExecutionCoordinator {
  private chain: Promise<void> = Promise.resolve();

  run<T>(mode: ToolExecutionMode, task: () => Promise<T>): Promise<T> {
    if (mode !== "sequential") return task();

    const run = this.chain.then(task, task);
    this.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

function getToolExecutionMode(options: {
  defaultMode?: ToolExecutionMode;
  localMode?: ToolExecutionMode;
}): ToolExecutionMode {
  if (options.defaultMode === "sequential") return "sequential";
  if (options.localMode === "sequential") return "sequential";
  return "parallel";
}

export function wrapToolWithPolicy(
  baseTool: StructuredToolInterface,
  options: BuildToolOptions,
  coordinator: ToolExecutionCoordinator,
  localSpec?: LocalToolSpec
): StructuredToolInterface {
  const invokeWithPolicy = async (rawInput: unknown, config?: unknown): Promise<unknown> => {
    const executionMode = getToolExecutionMode({
      defaultMode: options.executionPolicy?.mode,
      localMode: localSpec?.executionMode
    });
    const timeoutMs = localSpec?.timeoutMs ?? options.executionPolicy?.timeoutMs;
    const input = localSpec?.prepareArguments
      ? localSpec.prepareArguments(rawInput, {
          threadId: options.threadId,
          runId: options.runId,
          metadata: options.metadata
        })
      : rawInput;
    const validatedInput = localSpec?.schema ? localSpec.schema.parse(input) : input;
    const startedAt = Date.now();

    await emitToolEvent(options.onToolEvent, {
      type: "tool_start",
      toolName: baseTool.name,
      input: validatedInput,
      threadId: options.threadId
    });

    const execute = async () => {
      const invoke = baseTool.invoke as unknown as (
        this: StructuredToolInterface,
        input: unknown,
        config?: unknown
      ) => Promise<unknown>;
      const result = await withTimeout(
        Promise.resolve(invoke.call(baseTool, validatedInput, config)),
        timeoutMs ?? Number.NaN,
        baseTool.name
      );
      await emitToolEvent(options.onToolEvent, {
        type: "tool_end",
        toolName: baseTool.name,
        input: validatedInput,
        output: result,
        durationMs: Date.now() - startedAt,
        threadId: options.threadId
      });
      return result;
    };

    try {
      return await coordinator.run(executionMode, execute);
    } catch (error) {
      await emitToolEvent(options.onToolEvent, {
        type: "tool_error",
        toolName: baseTool.name,
        input: validatedInput,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
        threadId: options.threadId
      });
      throw error;
    }
  };

  return new Proxy(baseTool, {
    get(target, prop, receiver) {
      if (prop === "invoke") {
        return invokeWithPolicy;
      }
      return Reflect.get(target, prop, receiver);
    }
  }) as StructuredToolInterface;
}
