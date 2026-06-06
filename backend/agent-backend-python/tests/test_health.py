from fastapi.testclient import TestClient
from app.main import app


def test_health_shape():
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert "postgres" in body
    assert "redis" in body
    assert body["checkpointer"] in {"memory", "postgres"}
