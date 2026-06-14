from fastapi.testclient import TestClient

from app.main import app


class _FakeRagService:
    async def index_text_documents(self, request_body):
        return type("Resp", (), {"model_dump": lambda self: {"indexedCount": len(request_body.documents), "items": []}})()

    async def index_attachments(self, request_body):
        return type("Resp", (), {"model_dump": lambda self: {"indexedCount": len(request_body.attachmentIds), "items": []}})()

    async def semantic_search(self, request_body):
        return type(
            "Resp",
            (),
            {
                "model_dump": lambda self: {
                    "query": request_body.query,
                    "hits": [
                        {
                            "score": 0.9,
                            "text": "hello rag",
                            "documentId": "doc-1",
                            "nodeId": "doc-1:0",
                            "threadId": None,
                            "attachmentId": None,
                            "fileName": None,
                            "sourceType": "text",
                            "chunkIndex": None,
                            "metadata": {},
                        }
                    ],
                }
            },
        )()

    async def answer(self, request_body):
        return type(
            "Resp",
            (),
            {
                "model_dump": lambda self: {
                    "query": request_body.query,
                    "answer": "answer from context",
                    "hits": [],
                }
            },
        )()


def test_rag_routes_are_wrapped():
    app.state.rag_service = _FakeRagService()
    with TestClient(app) as client:
        index_resp = client.post(
            "/v1/rag/index",
            json={"documents": [{"documentId": "doc-1", "text": "hello world"}]},
        )
        search_resp = client.post("/v1/rag/search", json={"query": "hello"})
        query_resp = client.post("/v1/rag/query", json={"query": "hello"})

    assert index_resp.status_code == 200
    assert index_resp.json()["data"]["indexedCount"] == 1
    assert search_resp.status_code == 200
    assert search_resp.json()["data"]["hits"][0]["documentId"] == "doc-1"
    assert query_resp.status_code == 200
    assert query_resp.json()["data"]["answer"] == "answer from context"
