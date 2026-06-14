"""Health router for the standalone RAG service."""

from fastapi import APIRouter, Request

from ..responses import success_response

router = APIRouter(tags=["health"])


@router.get("/health")
def health(request: Request):
    payload = request.app.state.rag_service.health_payload()
    return success_response(payload)
