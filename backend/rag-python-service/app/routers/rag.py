"""RAG routes."""

from fastapi import APIRouter, Request

from ..models import IndexAttachmentRequest, IndexTextRequest, QueryRequest, SearchRequest
from ..responses import success_response

router = APIRouter(prefix="/v1/rag", tags=["rag"])


@router.post("/index")
async def index_text(request_body: IndexTextRequest, request: Request):
    payload = await request.app.state.rag_service.index_text_documents(request_body)
    return success_response(payload.model_dump())


@router.post("/index/attachments")
async def index_attachments(request_body: IndexAttachmentRequest, request: Request):
    payload = await request.app.state.rag_service.index_attachments(request_body)
    return success_response(payload.model_dump())


@router.post("/search")
async def search(request_body: SearchRequest, request: Request):
    payload = await request.app.state.rag_service.semantic_search(request_body)
    return success_response(payload.model_dump())


@router.post("/query")
async def query(request_body: QueryRequest, request: Request):
    payload = await request.app.state.rag_service.answer(request_body)
    return success_response(payload.model_dump())
