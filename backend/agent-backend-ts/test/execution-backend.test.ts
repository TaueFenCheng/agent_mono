import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { SandboxManager, WorkspaceSandboxExecutionBackend } from "../src/runtime/execution-backend";

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) =>
      fs.rm(dir, { recursive: true, force: true })
    )
  );
});

describe("SandboxManager", () => {
  it("creates a preserved workspace snapshot for a subagent", async () => {
    const baseDir = await makeTempDir("agent-sandbox-base-");
    const sourceDir = await makeTempDir("agent-sandbox-source-");
    await fs.writeFile(path.join(sourceDir, "hello.txt"), "sandbox-ready", "utf-8");
    await fs.mkdir(path.join(sourceDir, "node_modules"), { recursive: true });
    await fs.writeFile(path.join(sourceDir, "node_modules", "ignored.txt"), "ignore", "utf-8");

    const manager = new SandboxManager({
      baseDir,
      sourceProjectRoot: sourceDir
    });

    const session = await manager.ensureSession("thread:sub:task-1", "coder");
    const copied = await fs.readFile(path.join(session.workspaceRoot, "hello.txt"), "utf-8");

    expect(copied).toBe("sandbox-ready");
    await expect(fs.access(path.join(session.workspaceRoot, "node_modules", "ignored.txt"))).rejects.toThrow();
    expect(session.preserved).toBe(true);
  });
});

describe("WorkspaceSandboxExecutionBackend", () => {
  it("rejects path escapes outside the workspace root", async () => {
    const rootDir = await makeTempDir("agent-sandbox-root-");
    const backend = new WorkspaceSandboxExecutionBackend("sandbox:test", rootDir);

    await expect(backend.readFile("../secrets.txt")).rejects.toThrow(/escapes workspace root|must be relative/i);
    await expect(backend.writeFile("/tmp/absolute.txt", "nope")).rejects.toThrow(/must be relative/i);
  });
});
