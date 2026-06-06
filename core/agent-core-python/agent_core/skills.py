from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Sequence

import yaml

from .types import Skill


LOCAL_SKILL_DIR_CANDIDATES: tuple[str, ...] = ("skills", ".agents/skills", ".claude/skills", ".codex/skills")
HOME_SKILL_DIR_CANDIDATES: tuple[str, ...] = (".codex/skills", ".agents/skills", ".claude/skills")


def _is_dir(path: Path) -> bool:
    try:
        return path.is_dir()
    except OSError:
        return False


def _parse_env_skill_dirs(raw: str | None, cwd: Path) -> list[Path]:
    if not raw:
        return []
    result: list[Path] = []
    for item in raw.split(os.pathsep):
        value = item.strip()
        if not value:
            continue
        path = Path(value)
        if not path.is_absolute():
            path = (cwd / path).resolve()
        result.append(path)
    return result


def _default_skills_dirs(start_cwd: Path | None = None) -> list[Path]:
    cwd = (start_cwd or Path.cwd()).resolve()
    result: list[Path] = []
    seen: set[Path] = set()

    def _push(candidate: Path) -> None:
        resolved = candidate.resolve()
        if resolved in seen:
            return
        seen.add(resolved)
        if _is_dir(resolved):
            result.append(resolved)

    for env_dir in _parse_env_skill_dirs(os.getenv("AGENT_SKILLS_DIR"), cwd):
        _push(env_dir)

    for base in [cwd, *cwd.parents]:
        for relative_dir in LOCAL_SKILL_DIR_CANDIDATES:
            _push(base / relative_dir)

    codex_home = os.getenv("CODEX_HOME")
    if codex_home:
        _push((Path(codex_home).expanduser() / "skills").resolve())

    home = Path.home()
    for relative_dir in HOME_SKILL_DIR_CANDIDATES:
        _push(home / relative_dir)

    return result


def _enabled_skill_names_from_env() -> list[str]:
    raw = os.getenv("AGENT_ENABLED_SKILLS", "")
    return [item.strip() for item in raw.split(",") if item.strip()]


def _parse_skill_markdown(path: Path) -> Skill | None:
    raw = path.read_text(encoding="utf-8").strip()
    metadata: dict[str, Any] = {}
    body = raw

    if raw.startswith("---"):
        parts = raw.split("---", 2)
        if len(parts) == 3:
            _, frontmatter, body = parts
            parsed = yaml.safe_load(frontmatter.strip()) or {}
            if isinstance(parsed, dict):
                metadata = {str(key): value for key, value in parsed.items()}

    name = str(metadata.get("name") or path.parent.name).strip()
    description = str(metadata.get("description") or "").strip()
    if not name:
        return None

    return Skill(
        name=name,
        description=description,
        content=body.strip(),
        path=path,
        metadata=metadata,
    )


class SkillRegistry:
    def __init__(self, skills_dir: str | Path | Sequence[str | Path] | None = None) -> None:
        if isinstance(skills_dir, Sequence) and not isinstance(skills_dir, (str, Path)):
            self._skills_dirs = [Path(item).expanduser().resolve() for item in skills_dir if _is_dir(Path(item).expanduser().resolve())]
            return

        if isinstance(skills_dir, (str, Path)) and str(skills_dir).strip():
            value = Path(skills_dir).expanduser()
            self._skills_dirs = [value.resolve()] if _is_dir(value.resolve()) else []
            return

        self._skills_dirs = _default_skills_dirs()

    def resolved_skill_dirs(self) -> list[Path]:
        return list(self._skills_dirs)

    def list_skills(
        self,
        *,
        enabled_only: bool = False,
        enabled_names: Sequence[str] | None = None,
    ) -> list[Skill]:
        enabled_set = {item.strip() for item in enabled_names or _enabled_skill_names_from_env() if item.strip()}
        if not self._skills_dirs:
            return []

        skills_by_name: dict[str, Skill] = {}
        for skill_dir in self._skills_dirs:
            for path in sorted(skill_dir.rglob("SKILL.md")):
                skill = _parse_skill_markdown(path)
                if skill is None or skill.name in skills_by_name:
                    continue
                skills_by_name[skill.name] = skill

        skills = sorted(skills_by_name.values(), key=lambda item: item.name)

        if enabled_set:
            skills = [skill for skill in skills if skill.name in enabled_set]
        return skills

    def get_skill(self, name: str) -> Skill | None:
        target = name.strip()
        for skill in self.list_skills():
            if skill.name == target:
                return skill
        return None

    def render_prompt_context(self, *, enabled_names: Sequence[str] | None = None) -> str:
        skills = self.list_skills(
            enabled_only=bool(enabled_names or _enabled_skill_names_from_env()),
            enabled_names=enabled_names,
        )
        if not skills:
            return ""

        lines = ["Available skills:"]
        for skill in skills:
            summary = f"- {skill.name}"
            if skill.description:
                summary += f": {skill.description}"
            lines.append(summary)
        lines.append("Use the list_skills or read_skill tools when you need exact skill instructions.")
        return "\n".join(lines)
