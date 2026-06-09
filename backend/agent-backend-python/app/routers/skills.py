"""Skill endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..deps import SkillRegistryDep
from ..models import SkillListResponse, SkillResponse

router = APIRouter(prefix="/v1/skills", tags=["skills"])


@router.get("", response_model=SkillListResponse)
async def list_skills(registry: SkillRegistryDep, enabled_only: bool = False) -> SkillListResponse:
    skills = registry.list_skills(enabled_only=enabled_only)
    return SkillListResponse(
        skills=[
            SkillResponse(
                name=s.name, description=s.description,
                path=str(s.path), metadata=s.metadata,
            )
            for s in skills
        ]
    )


@router.get("/{skill_name}", response_model=SkillResponse)
async def get_skill(skill_name: str, registry: SkillRegistryDep) -> SkillResponse:
    skill = registry.get_skill(skill_name)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    return SkillResponse(
        name=skill.name, description=skill.description,
        path=str(skill.path), metadata=skill.metadata, content=skill.content,
    )
