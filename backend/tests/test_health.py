"""Pytest-тесты API EventLMS."""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    """GET /health отвечает 200 и телом {"status": "ok"}."""
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_schema_available() -> None:
    """OpenAPI-схема генерируется автоматически."""
    response = client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert schema["info"]["title"] == "EventLMS API"
    assert "/health" in schema["paths"]
