from fastapi.testclient import TestClient

from app.main import app


class _FakeRagService:
    async def health_payload(self):
        return {
            "status": "ok",
            "postgres": "up",
            "vectorTable": "rag_documents",
            "at": "2026-06-14T00:00:00+00:00",
        }


def test_health_response_is_wrapped():
    app.state.rag_service = _FakeRagService()
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["message"] == "ok"
    assert body["data"]["vectorTable"] == "rag_documents"
