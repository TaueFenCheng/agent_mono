import { execSync } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";

export interface FileReadOptions {
  offset?: number;
  limit?: number;
}

export interface CommandOptions {
  workdir?: string;
  timeout?: number;
}

export interface ExecutionBackend {
  readonly id: string;
  readonly kind: "host" | "workspace_sandbox";
  readonly rootDir: string;
  readFile(filePath: string, options?: FileReadOptions): Promise<string>;
  writeFile(filePath: string, content: string): Promise<string>;
  listFiles(dirPath: string, pattern?: string): Promise<Array<{ name: string; type: "dir" | "file"; size: number | null }>>;
  execute(command: string, options?: CommandOptions): Promise<string>;
}

export interface SandboxSessionInfo {
  backendId: string;
  workspaceRoot: string;
  preserved: boolean;
}

const SNAPSHOT_EXCLUDES = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "coverage",
  ".turbo",
  ".agent",
  ".DS_Store"
]);

function sanitizeId(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function toGlobRegExp(pattern: string): RegExp {
  return new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
}

abstract class BaseExecutionBackend implements ExecutionBackend {
  constructor(
    public readonly id: string,
    public readonly kind: "host" | "workspace_sandbox",
    public readonly rootDir: string
  ) {}

  abstract resolveFilePath(inputPath: string, kind: "file" | "dir" | "workdir"): Promise<string>;

  async readFile(filePath: string, options: FileReadOptions = {}): Promise<string> {
    const resolved = await this.resolveFilePath(filePath, "file");
    const content = await fs.readFile(resolved, "utf-8");
    if (options.offset === undefined && options.limit === undefined) {
      return content;
    }
    const lines = content.split("\n");
    const start = options.offset ?? 0;
    const end = options.limit ? start + options.limit : lines.length;
    return lines.slice(start, end).join("\n");
  }

  async writeFile(filePath: string, content: string): Promise<string> {
    const resolved = await this.resolveFilePath(filePath, "file");
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, "utf-8");
    const stat = await fs.stat(resolved);
    return `Written ${resolved} (${stat.size} bytes)`;
  }

  async listFiles(dirPath: string, pattern?: string): Promise<Array<{ name: string; type: "dir" | "file"; size: number | null }>> {
    const resolved = await this.resolveFilePath(dirPath, "dir");
    const entries = await fs.readdir(resolved, { withFileTypes: true });
    const matcher = pattern ? toGlobRegExp(pattern) : null;
    const results: Array<{ name: string; type: "dir" | "file"; size: number | null }> = [];
    for (const entry of entries) {
      if (matcher && !matcher.test(entry.name)) continue;
      const isDir = entry.isDirectory();
      const size = isDir ? null : (await fs.stat(path.join(resolved, entry.name))).size;
      results.push({ name: entry.name, type: isDir ? "dir" : "file", size });
    }
    return results;
  }

  async execute(command: string, options: CommandOptions = {}): Promise<string> {
    const cwd = await this.resolveFilePath(options.workdir ?? ".", "workdir");
    try {
      const output = execSync(command, {
        cwd,
        timeout: options.timeout ?? 30_000,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024
      });
      return output || "(command completed with no output)";
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; message?: string };
      if (err.stdout) return err.stdout;
      if (err.stderr) return `Error: ${err.stderr}`;
      return `Execution failed: ${err.message ?? String(error)}`;
    }
  }
}

export class HostExecutionBackend extends BaseExecutionBackend {
  constructor(rootDir = process.cwd()) {
    super("host", "host", path.resolve(rootDir));
  }

  async resolveFilePath(inputPath: string, kind: "file" | "dir" | "workdir"): Promise<string> {
    const candidate = kind === "dir" || kind === "workdir" ? inputPath || "." : inputPath;
    return path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(this.rootDir, candidate);
  }
}

export class WorkspaceSandboxExecutionBackend extends BaseExecutionBackend {
  constructor(id: string, rootDir: string) {
    super(id, "workspace_sandbox", path.resolve(rootDir));
  }

  private async ensureNoSymlinkEscape(candidate: string): Promise<void> {
    let current = this.rootDir;
    const relative = path.relative(this.rootDir, candidate);
    if (!relative || relative === ".") return;
    const segments = relative.split(path.sep).filter(Boolean);
    for (const segment of segments) {
      current = path.join(current, segment);
      try {
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink()) {
          throw new Error(`Sandbox path cannot traverse symlink: ${current}`);
        }
      } catch (error: unknown) {
        const code = (error as { code?: string }).code;
        if (code === "ENOENT") {
          return;
        }
        throw error;
      }
    }
  }

  async resolveFilePath(inputPath: string, kind: "file" | "dir" | "workdir"): Promise<string> {
    const candidate = inputPath?.trim() ? inputPath : ".";
    if (path.isAbsolute(candidate)) {
      throw new Error(`Sandbox paths must be relative to workspace root: ${candidate}`);
    }
    const resolved = path.resolve(this.rootDir, candidate);
    const relative = path.relative(this.rootDir, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Sandbox path escapes workspace root: ${candidate}`);
    }
    await this.ensureNoSymlinkEscape(kind === "file" ? path.dirname(resolved) : resolved);
    return resolved;
  }
}

export interface SandboxSession extends SandboxSessionInfo {
  subThreadId: string;
  backend: WorkspaceSandboxExecutionBackend;
  role: string;
}

export interface SandboxManagerOptions {
  baseDir?: string;
  sourceProjectRoot?: string;
}

export class SandboxManager {
  private readonly baseDir: string;
  private readonly sourceProjectRoot: string;
  private readonly sessions = new Map<string, SandboxSession>();

  constructor(options: SandboxManagerOptions = {}) {
    this.baseDir = path.resolve(options.baseDir ?? path.join(process.cwd(), ".agent", "sandboxes"));
    this.sourceProjectRoot = path.resolve(options.sourceProjectRoot ?? process.cwd());
  }

  async ensureSession(subThreadId: string, role: string): Promise<SandboxSession> {
    const existing = this.sessions.get(subThreadId);
    if (existing) return existing;

    const workspaceRoot = path.join(this.baseDir, sanitizeId(subThreadId), "workspace");
    await fs.mkdir(workspaceRoot, { recursive: true });
    await this.seedWorkspace(workspaceRoot);

    const backendId = `sandbox:${sanitizeId(subThreadId)}`;
    const session: SandboxSession = {
      subThreadId,
      role,
      backendId,
      workspaceRoot,
      preserved: true,
      backend: new WorkspaceSandboxExecutionBackend(backendId, workspaceRoot)
    };
    this.sessions.set(subThreadId, session);
    return session;
  }

  getSession(subThreadId: string): SandboxSession | null {
    return this.sessions.get(subThreadId) ?? null;
  }

  listSessions(): SandboxSession[] {
    return [...this.sessions.values()];
  }

  private async seedWorkspace(workspaceRoot: string): Promise<void> {
    const marker = path.join(workspaceRoot, ".sandbox-ready");
    try {
      await fs.access(marker);
      return;
    } catch {
      // continue
    }

    await fs.cp(this.sourceProjectRoot, workspaceRoot, {
      recursive: true,
      filter: (src) => {
        const name = path.basename(src);
        return !SNAPSHOT_EXCLUDES.has(name);
      }
    });
    await fs.writeFile(
      marker,
      JSON.stringify(
        {
          sourceProjectRoot: this.sourceProjectRoot,
          createdAt: new Date().toISOString(),
          hostname: os.hostname()
        },
        null,
        2
      ),
      "utf-8"
    );
  }
}
