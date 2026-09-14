"""DB-free смоук-тесты API EventLMS.

Проверяются /health и /openapi.json на TestClient без обращения к БД.
Проверки контрактов роутов оборачиваются в skipif через has_module():
пока параллельная разработка не положила модули в репозиторий, тесты
аккуратно пропускаются, не ломая общий прогон.
"""

import pytest

from conftest import has_module

from fastapi.testclient import TestClient


def _has_route_module(route_name: str) -> bool:
    """Проверить наличие модуля роута (плюс связанного сервиса и схемы).

    Args:
        route_name: короткое имя сущности, например "events".

    Returns:
        True, если импортируются и роут, и соответствующий сервис.
    """
    return has_module(f"api.routes.{route_name}") and has_module(
        f"services.{route_name}"
    )


def test_health_returns_ok(client: TestClient) -> None:
    """GET /health отвечает 200 и телом {"status": "ok"}."""
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_available_with_health_path(client: TestClient) -> None:
    """OpenAPI-схема доступна и содержит служебный путь /health."""
    response = client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert "/health" in schema["paths"]


@pytest.mark.skipif(
    not has_module("api.routes.events"),
    reason="api.routes.events ещё не реализованы",
)
def test_openapi_contains_events_paths(client: TestClient) -> None:
    """После подключения роутера /api/events появляется в OpenAPI."""
    response = client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert "/api/events" in schema["paths"]


@pytest.mark.skipif(
    not _has_route_module("events"),
    reason="api.routes.events/services.events ещё не реализованы",
)
def test_events_routes_have_response_models(client: TestClient) -> None:
    """CRUD-пути /api/events объявлены в OpenAPI с response_model.

    Проверяется только декларация контрактов — реальных вызовов БД
    тест не выполняет.
    """
    response = client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    events_paths = {
        path: spec
        for path, spec in schema["paths"].items()
        if path.startswith("/api/events")
    }
    assert events_paths, "ожидались пути /api/events в OpenAPI"

    response_codes = {"200", "201", "202", "204"}
    for path, spec in events_paths.items():
        for method, operation in spec.items():
            if method.lower() not in {"get", "post", "put", "patch", "delete"}:
                continue
            declared_responses = operation.get("responses", {})
            documented = set(declared_responses) & response_codes
            assert documented, (
                f"{method.upper()} {path}: нет успешного ответа в OpenAPI"
            )
            if method.lower() == "delete":
                continue
            for code in documented:
                assert "content" in declared_responses[code], (
                    f"{method.upper()} {path} [{code}]: ожидалась response_model"
                )


@pytest.mark.skipif(
    not _has_route_module("tasks"),
    reason="api.routes.tasks/services.tasks ещё не реализованы",
)
def test_tasks_routes_documented(client: TestClient) -> None:
    """Пути /api/tasks присутствуют в OpenAPI-схеме."""
    response = client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert any(path.startswith("/api/tasks") for path in schema["paths"])


@pytest.mark.skipif(
    not _has_route_module("resources"),
    reason="api.routes.resources/services.resources ещё не реализованы",
)
def test_resources_routes_documented(client: TestClient) -> None:
    """Пути /api/resources присутствуют в OpenAPI-схеме."""
    response = client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert any(path.startswith("/api/resources") for path in schema["paths"])


@pytest.mark.skipif(
    not _has_route_module("assignments"),
    reason="api.routes.assignments/services.assignments ещё не реализованы",
)
def test_assignments_routes_documented(client: TestClient) -> None:
    """Пути /api/assignments присутствуют в OpenAPI-схеме."""
    response = client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert any(path.startswith("/api/assignments") for path in schema["paths"])
