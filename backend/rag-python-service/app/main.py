"""Standalone FastAPI RAG microservice using LlamaIndex and pgvector."""

from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .responses import http_exception_handler, unhandled_exception_handler
from .routers.health import router as health_router
from .routers.rag import router as rag_router
from .services.rag_service import RagService

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s"
)
logger = logging.getLogger("rag-python-service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    
    rag_service = getattr(app.state, "rag_service", None)
    if rag_service is None:
        rag_service = RagService(settings)
        rag_service.ensure_ready()
        app.state.rag_service = rag_service
    yield


app = FastAPI(
    title="rag-python-service",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.request_id = request_id
    start = time.monotonic()
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    elapsed_ms = (time.monotonic() - start) * 1000
    logger.info("%s %s %d %.1fms", request.method, request.url.path, response.status_code, elapsed_ms)
    return response


app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(health_router)
app.include_router(rag_router)
