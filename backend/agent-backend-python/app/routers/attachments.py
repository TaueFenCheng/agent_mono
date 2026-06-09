"""Attachment endpoints: upload, list, search, detail."""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone

import boto3
from botocore.config import Config as BotoConfig
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import or_, select

from ..config import settings
from ..db_models import AttachmentChunkORM, AttachmentORM
from ..deps import DbSession

router = APIRouter(prefix="/v1/attachments", tags=["attachments"])


def _get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.OBJECT_STORAGE_ENDPOINT,
        region_name=settings.OBJECT_STORAGE_REGION,
        aws_access_key_id=settings.OBJECT_STORAGE_ACCESS_KEY,
        aws_secret_access_key=settings.OBJECT_STORAGE_SECRET_KEY,
        config=BotoConfig(s3={"addressing_style": "path" if settings.OBJECT_STORAGE_FORCE_PATH_STYLE else "auto"}),
    )


class AttachmentResponse(BaseModel):
    id: str
    fileName: str
    contentType: str
    sizeBytes: int
    status: str
    sha256: str
    threadId: str | None = None
    createdAt: str
    previewUrl: str | None = None


class AttachmentDetailResponse(AttachmentResponse):
    textContent: str | None = None
    parser: str | None = None
    chunks: list[dict] = []


class AttachmentListResponse(BaseModel):
    attachments: list[AttachmentResponse]


def _to_response(row: AttachmentORM, preview_url: str | None = None) -> AttachmentResponse:
    return AttachmentResponse(
        id=row.id, fileName=row.file_name, contentType=row.content_type,
        sizeBytes=row.size_bytes, status=row.status, sha256=row.sha256,
        threadId=row.thread_id, createdAt=row.created_at.isoformat(),
        previewUrl=preview_url,
    )


@router.post("", response_model=AttachmentResponse)
async def upload_attachment(
    file: UploadFile = File(...),
    threadId: str | None = Form(default=None),
    runId: str | None = Form(default=None),
    session: DbSession = None,
) -> AttachmentResponse:
    max_bytes = settings.ATTACHMENT_MAX_UPLOAD_MB * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File exceeds {settings.ATTACHMENT_MAX_UPLOAD_MB}MB limit")

    sha256 = hashlib.sha256(content).hexdigest()
    attachment_id = str(uuid.uuid4())
    ext = ""
    if file.filename and "." in file.filename:
        ext = "." + file.filename.rsplit(".", 1)[-1]
    object_key = f"attachments/{datetime.now(timezone.utc).strftime('%Y-%m-%d')}/{attachment_id}{ext}"

    # Upload to S3
    try:
        s3 = _get_s3_client()
        s3.put_object(
            Bucket=settings.OBJECT_STORAGE_BUCKET,
            Key=object_key,
            Body=content,
            ContentType=file.content_type or "application/octet-stream",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"S3 upload failed: {exc}") from exc

    row = AttachmentORM(
        id=attachment_id,
        file_name=file.filename or "unnamed",
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        bucket=settings.OBJECT_STORAGE_BUCKET,
        object_key=object_key,
        sha256=sha256,
        status="uploaded",
        thread_id=threadId,
        run_id=runId,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)

    return _to_response(row)


@router.get("", response_model=AttachmentListResponse)
async def list_attachments(
    session: DbSession,
    threadId: str | None = None,
    limit: int = 50,
) -> AttachmentListResponse:
    query = select(AttachmentORM).order_by(AttachmentORM.created_at.desc()).limit(min(limit, 100))
    if threadId:
        query = query.where(AttachmentORM.thread_id == threadId)
    rows = (await session.scalars(query)).all()
    return AttachmentListResponse(attachments=[_to_response(r) for r in rows])


@router.get("/search", response_model=AttachmentListResponse)
async def search_attachments(
    session: DbSession,
    q: str = "",
    threadId: str | None = None,
    limit: int = 20,
) -> AttachmentListResponse:
    if not q.strip():
        raise HTTPException(status_code=400, detail="Query parameter `q` is required")

    pattern = f"%{q}%"
    query = (
        select(AttachmentORM)
        .where(
            or_(
                AttachmentORM.file_name.ilike(pattern),
                AttachmentORM.text_content.ilike(pattern),
            )
        )
        .order_by(AttachmentORM.created_at.desc())
        .limit(min(limit, 100))
    )
    if threadId:
        query = query.where(AttachmentORM.thread_id == threadId)

    rows = (await session.scalars(query)).all()
    return AttachmentListResponse(attachments=[_to_response(r) for r in rows])


@router.get("/{attachment_id}", response_model=AttachmentDetailResponse)
async def get_attachment(attachment_id: str, session: DbSession) -> AttachmentDetailResponse:
    row = await session.get(AttachmentORM, attachment_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Generate signed URL
    preview_url = None
    try:
        s3 = _get_s3_client()
        preview_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": row.bucket, "Key": row.object_key},
            ExpiresIn=settings.OBJECT_STORAGE_SIGN_TTL_SEC,
        )
    except Exception:
        pass

    # Load chunks
    chunks = (
        await session.scalars(
            select(AttachmentChunkORM)
            .where(AttachmentChunkORM.attachment_id == attachment_id)
            .order_by(AttachmentChunkORM.chunk_index)
            .limit(20)
        )
    ).all()

    return AttachmentDetailResponse(
        **_to_response(row, preview_url).model_dump(),
        textContent=row.text_content,
        parser=row.parser,
        chunks=[{"index": c.chunk_index, "content": c.content, "tokenCount": c.token_count} for c in chunks],
    )
