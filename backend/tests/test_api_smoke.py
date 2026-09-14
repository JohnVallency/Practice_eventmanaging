"""DB-free смоук-тесты API EventLMS.

Проверяются /health и /openapi.json на TestClient без обращения к БД.
Проверки контрактов роутов оборачиваются в skipif через has_module():
пока параллельная разработка не положила модули в репозиторий, тесты
аккуратно пропускаются, не ломая общий прогон.
"""

import pytest

from conftest import has_module
from main import app

from fastapi.testclient import TestClient


def _router_prefix_mounted(prefix: str) -> bool:
    """Проверить, что маршруты с данным префиксом смонтированы в приложении.

    Модуль роута может существовать, но ещё не быть включённым в main.py
    (main.py не в зоне ответственности тестов), поэтому гейт активности
    проверяет фактические маршруты, а не только импортируемость.

    Args:
        prefix: префикс пути, например "/api/events".

    Returns:
        True, если найден хотя бы один смонтированный маршрут с префиксом.
    """
    for route in app.router.routes:
        path = getattr(route, "path", "")
        if path == prefix or path.startswith(prefix + "/"):
            return True
    return False


def _route_ready(route_name: str) -> bool:
    """Гейт активности смоук-проверок для сущности.

    Проверка активна, когда модуль роута импортируется И его маршруты
    уже смонтированы в приложении (значит, попадут в OpenAPI).

    Args:
        route_name: короткое имя сущности, например "events".

    Returns:
        True, если проверку по сущности можно выполнять.
    """
    if not has_module(f"api.routes.{route_name}"):
        return False
    return _router_prefix_mounted(f"/api/{route_name}")


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
    not _route_ready("events"),
    reason="api.routes.events ещё не реализованы или не смонтированы",
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
    not _route_ready("tasks"),
    reason="api.routes.tasks ещё не реализованы или не смонтированы",
)
def test_tasks_routes_documented(client: TestClient) -> None:
    """Пути /api/tasks присутствуют в OpenAPI-схеме."""
    response = client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert any(path.startswith("/api/tasks") for path in schema["paths"])


@pytest.mark.skipif(
    not _route_ready("resources"),
    reason="api.routes.resources ещё не реализованы или не смонтированы",
)
def test_resources_routes_documented(client: TestClient) -> None:
    """Пути /api/resources присутствуют в OpenAPI-схеме."""
    response = client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert any(path.startswith("/api/resources") for path in schema["paths"])


@pytest.mark.skipif(
    not _route_ready("assignments"),
    reason="api.routes.assignments ещё не реализованы или не смонтированы",
)
def test_assignments_routes_documented(client: TestClient) -> None:
    """Пути /api/assignments присутствуют в OpenAPI-схеме."""
    response = client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert any(path.startswith("/api/assignments") for path in schema["paths"])
