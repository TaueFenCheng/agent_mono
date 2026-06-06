import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Skill, SkillRegistryLike } from "./types.js";

const LOCAL_SKILL_DIR_CANDIDATES = ["skills", ".agents/skills", ".claude/skills", ".codex/skills"] as const;
const HOME_SKILL_DIR_CANDIDATES = [".codex/skills", ".agents/skills", ".claude/skills"] as const;

function asAbsolute(inputPath: string, cwd = process.cwd()): string {
  if (!inputPath.trim()) return "";
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(cwd, inputPath);
}

function existsDirectory(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function collectAncestorDirectories(startDir: string): string[] {
  const result: string[] = [];
  let current = path.resolve(startDir);
  while (true) {
    result.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return result;
}

function pushUnique(result: string[], value: string): void {
  if (!value) return;
  if (!result.includes(value)) {
    result.push(value);
  }
}

function parseSkillsDirsFromEnv(raw: string | undefined, cwd = process.cwd()): string[] {
  if (!raw) return [];
  return raw
    .split(path.delimiter)
    .map((item) => asAbsolute(item.trim(), cwd))
    .filter(Boolean);
}

function defaultSkillsDirs(startCwd = process.cwd()): string[] {
  const result: string[] = [];
  const cwd = path.resolve(startCwd);

  for (const envDir of parseSkillsDirsFromEnv(process.env.AGENT_SKILLS_DIR, cwd)) {
    pushUnique(result, envDir);
  }

  for (const baseDir of collectAncestorDirectories(cwd)) {
    for (const relativeDir of LOCAL_SKILL_DIR_CANDIDATES) {
      pushUnique(result, path.join(baseDir, relativeDir));
    }
  }

  const codexHome = process.env.CODEX_HOME?.trim();
  if (codexHome) {
    pushUnique(result, path.join(asAbsolute(codexHome, cwd), "skills"));
  }

  const homeDir = os.homedir();
  for (const relativeDir of HOME_SKILL_DIR_CANDIDATES) {
    pushUnique(result, path.join(homeDir, relativeDir));
  }

  return result.filter((dirPath) => existsDirectory(dirPath));
}

function enabledSkillNamesFromEnv(): string[] {
  const raw = process.env.AGENT_ENABLED_SKILLS ?? "";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSkillMarkdown(skillPath: string): Skill | null {
  const raw = fs.readFileSync(skillPath, "utf8").trim();
  let metadata: Record<string, unknown> = {};
  let body = raw;

  if (raw.startsWith("---")) {
    const parts = raw.split("---", 3);
    if (parts.length === 3) {
      metadata = (parseYaml(parts[1]?.trim() ?? "") as Record<string, unknown> | null) ?? {};
      body = parts[2] ?? "";
    }
  }

  const name = String(metadata.name ?? path.basename(path.dirname(skillPath))).trim();
  if (!name) return null;

  return {
    name,
    description: String(metadata.description ?? "").trim(),
    content: body.trim(),
    path: skillPath,
    metadata
  };
}

function walkSkillFiles(dir: string, result: string[] = []): string[] {
  if (!fs.existsSync(dir)) return result;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSkillFiles(fullPath, result);
      continue;
    }
    if (entry.isFile() && entry.name === "SKILL.md") {
      result.push(fullPath);
    }
  }

  return result;
}

export class SkillRegistry implements SkillRegistryLike {
  private readonly skillsDirs: string[];

  constructor(skillsDirOrDirs?: string | string[]) {
    if (Array.isArray(skillsDirOrDirs)) {
      this.skillsDirs = skillsDirOrDirs.map((item) => asAbsolute(item)).filter((item) => existsDirectory(item));
      return;
    }

    if (typeof skillsDirOrDirs === "string" && skillsDirOrDirs.trim()) {
      this.skillsDirs = [asAbsolute(skillsDirOrDirs)].filter((item) => existsDirectory(item));
      return;
    }

    this.skillsDirs = defaultSkillsDirs();
  }

  getResolvedSkillDirs(): string[] {
    return [...this.skillsDirs];
  }

  listSkills(options: { enabledOnly?: boolean; enabledNames?: string[] } = {}): Skill[] {
    const enabledSet = new Set((options.enabledNames ?? enabledSkillNamesFromEnv()).map((item) => item.trim()).filter(Boolean));
    const byName = new Map<string, Skill>();
    for (const skillDir of this.skillsDirs) {
      for (const skillPath of walkSkillFiles(skillDir)) {
        const skill = parseSkillMarkdown(skillPath);
        if (!skill) continue;
        if (!byName.has(skill.name)) {
          byName.set(skill.name, skill);
        }
      }
    }
    const skills = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));

    if (enabledSet.size > 0) {
      return skills.filter((skill) => enabledSet.has(skill.name));
    }

    if (options.enabledOnly) {
      return [];
    }

    return skills;
  }

  getSkill(name: string): Skill | null {
    const target = name.trim();
    return this.listSkills().find((skill) => skill.name === target) ?? null;
  }

  renderPromptContext(options: { enabledNames?: string[] } = {}): string {
    const skills = this.listSkills({
      enabledOnly: Boolean(options.enabledNames?.length || enabledSkillNamesFromEnv().length),
      enabledNames: options.enabledNames
    });
    if (skills.length === 0) return "";

    const lines = ["Available skills:"];
    for (const skill of skills) {
      lines.push(skill.description ? `- ${skill.name}: ${skill.description}` : `- ${skill.name}`);
    }
    lines.push("Use the list_skills or read_skill tools when you need exact skill instructions.");
    return lines.join("\n");
  }
}
