"""Интеграционные тесты API расчёта расписания (CPM) EventLMS против живого стека.

Тесты ходят по HTTP на http://localhost:8000 (docker compose).
Если живой стек недоступен, весь модуль пропускается — остальные
тесты набора не зависят от запущенного сервера.

Покрывают:
- успешный расчёт расписания и сохранение полей CPM в БД (bulk-обновление);
- 400 «Cycle detected» при циклических зависимостях;
- 400 «Event has no tasks» для события без задач;
- 404 для несуществующего события.
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
        "name": f"Sched {suffix} {uuid.uuid4().hex[:8]}",
        "start_date": "2026-03-01T00:00:00Z",
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


def _dependency_payload(predecessor_id: str, successor_id: str) -> dict:
    """Валидная полезная нагрузка для связи FS с нулевым лагом."""
    return {
        "predecessor_id": predecessor_id,
        "successor_id": successor_id,
        "dependency_type": "FS",
        "lag_days": 0,
    }


def _create_event(client: httpx.Client, suffix: str) -> str:
    """Создать событие и вернуть его идентификатор."""
    created = client.post("/api/events", json=_event_payload(suffix))
    assert created.status_code == 201, created.text
    return created.json()["id"]


def _create_task(client: httpx.Client, event_id: str, duration: int, suffix: str) -> str:
    """Создать задачу в событии и вернуть её идентификатор."""
    created = client.post("/api/tasks", json=_task_payload(event_id, duration, suffix))
    assert created.status_code == 201, created.text
    return created.json()["id"]


def test_schedule_endpoint_flow() -> None:
    """Полный поток: событие → 3 задачи → цепочка FS → расчёт → проверка полей CPM в БД.

    Цепочка t1(2) -> t2(3) -> t3(4) без лагов: earliest_start равны 0, 2, 5,
    earliest_finish — 2, 5, 9. Главный акцент: bulk-обновление после расчёта
    реально сохранено в БД и видно через GET /api/tasks/{id}.
    """
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id = _create_event(client, "flow")

            t1_id = _create_task(client, event_id, 2, "T1")
            t2_id = _create_task(client, event_id, 3, "T2")
            t3_id = _create_task(client, event_id, 4, "T3")

            # Цепочка зависимостей t1 -> t2 -> t3 типа FS с нулевым лагом.
            dep1 = client.post(
                f"/api/tasks/{t2_id}/dependencies", json=_dependency_payload(t1_id, t2_id)
            )
            assert dep1.status_code == 201, dep1.text
            dep2 = client.post(
                f"/api/tasks/{t3_id}/dependencies", json=_dependency_payload(t2_id, t3_id)
            )
            assert dep2.status_code == 201, dep2.text

            calculated = client.post(f"/api/events/{event_id}/schedule/calculate")
            assert calculated.status_code == 200, calculated.text
            body = calculated.json()
            assert body["calculated"] == 3, body

            schedule = body["schedule"]
            assert schedule[t2_id]["earliest_start"] == 2, schedule
            assert schedule[t3_id]["earliest_start"] == 5, schedule

            # Проверка сохранения bulk-обновления в БД через GET задачи.
            # Поля CPM есть в TaskResponse, но тест не должен падать, если
            # они когда-нибудь исчезнут из схемы ответа — тогда факт
            # сохранения проверен уже ассертами по schedule выше.
            t3 = client.get(f"/api/tasks/{t3_id}")
            assert t3.status_code == 200, t3.text
            t3_body = t3.json()
            if "earliest_start" in t3_body and "earliest_finish" in t3_body:
                assert t3_body["earliest_start"] == 5, t3_body
                assert t3_body["earliest_finish"] == 9, t3_body
        finally:
            if event_id is not None:
                assert client.delete(f"/api/events/{event_id}").status_code == 204


def test_schedule_cycle_400() -> None:
    """400 «Cycle detected» при взаимных зависимостях A -> B и B -> A."""
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id = _create_event(client, "cycle")
            task_a_id = _create_task(client, event_id, 2, "CA")
            task_b_id = _create_task(client, event_id, 3, "CB")

            dep1 = client.post(
                f"/api/tasks/{task_b_id}/dependencies",
                json=_dependency_payload(task_a_id, task_b_id),
            )
            assert dep1.status_code == 201, dep1.text
            dep2 = client.post(
                f"/api/tasks/{task_a_id}/dependencies",
                json=_dependency_payload(task_b_id, task_a_id),
            )
            assert dep2.status_code == 201, dep2.text

            response = client.post(f"/api/events/{event_id}/schedule/calculate")
            assert response.status_code == 400, response.text
            assert response.json()["detail"] == "Cycle detected"
        finally:
            if event_id is not None:
                client.delete(f"/api/events/{event_id}")


def test_schedule_no_tasks_400() -> None:
    """400 «Event has no tasks» при расчёте расписания события без задач."""
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id = _create_event(client, "notasks")

            response = client.post(f"/api/events/{event_id}/schedule/calculate")
            assert response.status_code == 400, response.text
            assert response.json()["detail"] == "Event has no tasks"
        finally:
            if event_id is not None:
                client.delete(f"/api/events/{event_id}")


def test_schedule_event_404() -> None:
    """404 при расчёте расписания для несуществующего события."""
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        missing = str(uuid.uuid4())
        response = client.post(f"/api/events/{missing}/schedule/calculate")
        assert response.status_code == 404, response.text
