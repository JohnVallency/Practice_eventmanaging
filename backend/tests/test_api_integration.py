"""Интеграционные тесты CRUD API EventLMS против живого стека.

Тесты ходят по HTTP на http://localhost:8000 (docker compose).
Если живой стек недоступен, весь модуль пропускается — остальные
тесты набора не зависят от запущенного сервера.
"""

import uuid

import httpx
import pytest

BASE_URL = "http://localhost:8000"


def _server_up() -> bool:
    """Быстро проверить доступность живого API через /health."""
    try:
        response = httpx.get(f"{BASE_URL}/health", timeout=2.0)
    except httpx.HTTPError:
        return False
    return response.status_code == 200


pytestmark = pytest.mark.skipif(
    not _server_up(), reason="живой стек API недоступен (запустите docker compose up -d)"
)


def _event_payload(suffix: str) -> dict:
    """Валидная полезная нагрузка для создания события."""
    return {
        "name": f"IT {suffix} {uuid.uuid4().hex[:8]}",
        "start_date": "2026-01-01T00:00:00Z",
        "end_date": "2026-12-31T00:00:00Z",
        "total_budget": "1000.00",
    }


def _task_payload(event_id: str, duration: int, suffix: str) -> dict:
    """Валидная полезная нагрузка для создания задачи."""
    return {
        "event_id": event_id,
        "name": f"Task {suffix} {uuid.uuid4().hex[:8]}",
        "duration_days": duration,
    }


def _resource_payload(event_id: str, suffix: str, availability: str = "10.00") -> dict:
    """Валидная полезная нагрузка для создания ресурса."""
    return {
        "event_id": event_id,
        "name": f"Res {suffix} {uuid.uuid4().hex[:8]}",
        "type": "venue",
        "availability_per_day": availability,
        "cost_per_day": "100.00",
    }


def test_full_crud_lifecycle() -> None:
    """Полный жизненный цикл: событие → задачи → зависимость → ресурс → назначение → PUT → каскадный DELETE."""
    event_id: str | None = None
    task_a_id: str | None = None

    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            created = client.post("/api/events", json=_event_payload("lifecycle"))
            assert created.status_code == 201, created.text
            event = created.json()
            event_id = event["id"]
            assert event["status"] == "draft"

            task_a = client.post("/api/tasks", json=_task_payload(event_id, 3, "A"))
            task_b = client.post("/api/tasks", json=_task_payload(event_id, 5, "B"))
            assert task_a.status_code == 201, task_a.text
            assert task_b.status_code == 201, task_b.text
            task_a_id = task_a.json()["id"]
            task_b_id = task_b.json()["id"]

            dependency = client.post(
                f"/api/tasks/{task_a_id}/dependencies",
                json={
                    "predecessor_id": task_b_id,
                    "successor_id": task_a_id,
                    "dependency_type": "FS",
                    "lag_days": 0,
                },
            )
            assert dependency.status_code == 201, dependency.text

            resource = client.post("/api/resources", json=_resource_payload(event_id, "venue"))
            assert resource.status_code == 201, resource.text
            resource_id = resource.json()["id"]

            assignment = client.post(
                "/api/assignments",
                json={"task_id": task_a_id, "resource_id": resource_id, "units_allocated": "4.00"},
            )
            assert assignment.status_code == 201, assignment.text
            assignment_id = assignment.json()["id"]

            events_list = client.get("/api/events", params={"skip": 0, "limit": 10})
            assert events_list.status_code == 200
            assert any(item["id"] == event_id for item in events_list.json())

            dependencies_list = client.get(f"/api/tasks/{task_a_id}/dependencies")
            assert dependencies_list.status_code == 200
            assert len(dependencies_list.json()) >= 1

            renamed = client.put(f"/api/events/{event_id}", json={"name": "IT lifecycle renamed"})
            assert renamed.status_code == 200, renamed.text
            assert renamed.json()["name"] == "IT lifecycle renamed"

            reallocated = client.put(
                f"/api/assignments/{assignment_id}", json={"units_allocated": "5.00"}
            )
            assert reallocated.status_code == 200, reallocated.text
        finally:
            if event_id is not None:
                assert client.delete(f"/api/events/{event_id}").status_code == 204

        # Доходим сюда только если ни один assert выше не упал:
        # каскадное удаление события убрало и задачу.
        assert client.get(f"/api/tasks/{task_a_id}").status_code == 404


def test_not_found_errors() -> None:
    """404 на несуществующие сущности и на чужой event_id при создании задачи."""
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        missing = str(uuid.uuid4())

        assert client.get(f"/api/events/{missing}").status_code == 404

        ghost_task = client.post("/api/tasks", json=_task_payload(missing, 1, "ghost"))
        assert ghost_task.status_code == 404, ghost_task.text

        assert client.get(f"/api/tasks/{missing}/dependencies").status_code == 404


def test_reallocation_conflict() -> None:
    """409 при суммарной загрузке ресурса выше availability_per_day."""
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        event_id = client.post("/api/events", json=_event_payload("realloc")).json()["id"]
        try:
            task_id = client.post(
                "/api/tasks", json=_task_payload(event_id, 2, "realloc")
            ).json()["id"]
            resource_id = client.post(
                "/api/resources", json=_resource_payload(event_id, "realloc")
            ).json()["id"]

            conflict = client.post(
                "/api/assignments",
                json={"task_id": task_id, "resource_id": resource_id, "units_allocated": "20.00"},
            )
            assert conflict.status_code == 409, conflict.text
            assert "ереаллокация" in conflict.json()["detail"]
        finally:
            client.delete(f"/api/events/{event_id}")


def test_duplicate_dependency_conflict() -> None:
    """409 при повторном создании той же пары зависимостей."""
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        event_id = client.post("/api/events", json=_event_payload("dupdep")).json()["id"]
        try:
            task_a_id = client.post("/api/tasks", json=_task_payload(event_id, 2, "D1")).json()["id"]
            task_b_id = client.post("/api/tasks", json=_task_payload(event_id, 4, "D2")).json()["id"]

            payload = {
                "predecessor_id": task_b_id,
                "successor_id": task_a_id,
                "dependency_type": "FS",
                "lag_days": 0,
            }
            first = client.post(f"/api/tasks/{task_a_id}/dependencies", json=payload)
            assert first.status_code == 201, first.text

            second = client.post(f"/api/tasks/{task_a_id}/dependencies", json=payload)
            assert second.status_code == 409, second.text
        finally:
            client.delete(f"/api/events/{event_id}")


def test_cross_event_resource_business_400() -> None:
    """400 «Ресурс привязан к другому событию» при назначении ресурса чужого события."""
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        event_first = client.post("/api/events", json=_event_payload("cross1")).json()["id"]
        event_second = client.post("/api/events", json=_event_payload("cross2")).json()["id"]
        try:
            task_id = client.post(
                "/api/tasks", json=_task_payload(event_first, 2, "cross")
            ).json()["id"]
            resource_id = client.post(
                "/api/resources", json=_resource_payload(event_second, "cross")
            ).json()["id"]

            rejected = client.post(
                "/api/assignments",
                json={"task_id": task_id, "resource_id": resource_id, "units_allocated": "1.00"},
            )
            assert rejected.status_code == 400, rejected.text
            assert "другому событию" in rejected.json()["detail"]
        finally:
            client.delete(f"/api/events/{event_first}")
            client.delete(f"/api/events/{event_second}")


def test_request_schema_validation_is_422() -> None:
    """Факт контракта: pydantic-ошибки тела FastAPI отдаёт как 422, а не 400.

    Бизнес-400 (валидации сервисов) покрыт test_cross_event_resource_business_400.
    """
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        payload = _event_payload("schema")
        payload["end_date"] = "2025-01-01T00:00:00Z"  # раньше start_date
        response = client.post("/api/events", json=payload)
        assert response.status_code == 422, response.text
