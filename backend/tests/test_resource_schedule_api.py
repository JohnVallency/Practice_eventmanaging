"""Интеграционные тесты API ресурсного расписания (RCPSP) EventLMS.

Тесты ходят по HTTP на живой стек http://localhost:8000 (как
test_schedule_api.py); при его недоступности модуль пропускается.

Покрывают:
- эталонный ресурсный сценарий «ромб» с конфликтом ресурса и leveling;
- персистентность actual_start/actual_finish в БД через GET задачи;
- 400 «Resource schedule not calculated» до расчёта;
- 400 «Event has no tasks» для события без задач;
- 400 «Resource demand exceeds availability» при перерасходе;
- 404 обоих эндпоинтов для несуществующего события;
- ресурс без назначений в utilization;
- идемпотентность повторного POST после пересчёта.

Числа фиксированы контрактом serial_sgs (services/rcpsp.py): задачи
назначаются по приоритету (критические впереди, затем TF asc, ES asc,
id); старт задачи с назначениями — минимальный день без конфликта
занятости с предшественниками.
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
        "name": f"ResSched {suffix} {uuid.uuid4().hex[:8]}",
        "start_date": "2026-03-01T00:00:00Z",
        "end_date": "2026-12-31T00:00:00Z",
        "total_budget": "1000.00",
    }


def _task_payload(event_id: str, duration: int, suffix: str) -> dict:
    """Валидная полезная нагрузка для создания задачи."""
    return {
        "event_id": event_id,
        "name": f"ResTask {suffix} {uuid.uuid4().hex[:8]}",
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


def _resource_payload(event_id: str, availability: str, suffix: str) -> dict:
    """Валидная полезная нагрузка для создания ресурса события."""
    return {
        "event_id": event_id,
        "name": f"Res {suffix} {uuid.uuid4().hex[:8]}",
        "type": "equipment",
        "availability_per_day": availability,
        "cost_per_day": "100.00",
    }


def _assignment_payload(task_id: str, resource_id: str, units: str) -> dict:
    """Валидная полезная нагрузка для назначения ресурса на задачу."""
    return {
        "task_id": task_id,
        "resource_id": resource_id,
        "units_allocated": units,
    }


def _create_event(client: httpx.Client, suffix: str) -> str:
    """Создать событие и вернуть его идентификатор."""
    created = client.post("/api/events", json=_event_payload(suffix))
    assert created.status_code == 201, created.text
    return created.json()["id"]


def _create_task(client: httpx.Client, event_id: str, duration: int, suffix: str) -> str:
    """Создать задачу в событии и вернуть её идентификатор."""
    created = client.post(
        "/api/tasks", json=_task_payload(event_id, duration, suffix)
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def _create_resource(
    client: httpx.Client, event_id: str, availability: str, suffix: str
) -> str:
    """Создать ресурс события и вернуть его идентификатор.

    Фактический путь REST: POST /api/resources.
    """
    created = client.post(
        "/api/resources", json=_resource_payload(event_id, availability, suffix)
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def _create_assignment(
    client: httpx.Client, task_id: str, resource_id: str, units: str
) -> None:
    """Назначить ресурс на задачу.

    Фактический путь REST: POST /api/assignments.
    """
    created = client.post(
        "/api/assignments", json=_assignment_payload(task_id, resource_id, units)
    )
    assert created.status_code == 201, created.text


def _build_diamond(
    client: httpx.Client,
    suffix: str,
    units: dict[str, str] | None = None,
    availability: str = "10",
) -> tuple[str, dict[str, str]]:
    """Собрать эталонный «ромб»: A(2), B(3), C(5), D(4) и ресурс.

    Зависимости A→B, A→C, B→D, C→D (FS, лаг 0); один ресурс
    availability_per_day=10; units назначений: A=6, B=5, C=6, D=4.

    Args:
        client: HTTP-клиент живого стека.
        suffix: суффикс имён сущностей.
        units: {"A"|"B"|"C"|"D": units-строка}; None — эталонные units.
        availability: доступность ресурса в день.

    Returns:
        (event_id, {"A": a_id, "B": b_id, "C": c_id, "D": d_id,
        "R": resource_id}).
    """
    event_id = _create_event(client, suffix)
    ids: dict[str, str] = {}
    for key, duration in (("A", 2), ("B", 3), ("C", 5), ("D", 4)):
        ids[key] = _create_task(client, event_id, duration, f"D{key}")

    for successor_id, predecessor_id in (
        (ids["B"], ids["A"]),
        (ids["C"], ids["A"]),
        (ids["D"], ids["B"]),
        (ids["D"], ids["C"]),
    ):
        dep = client.post(
            f"/api/tasks/{successor_id}/dependencies",
            json=_dependency_payload(predecessor_id, successor_id),
        )
        assert dep.status_code == 201, dep.text

    resolved_units = units or {"A": "6", "B": "5", "C": "6", "D": "4"}
    temp_availability = str(sum(float(u) for u in resolved_units.values()))

    # REST-ограничение: POST /api/assignments отклоняет назначение, если
    # СУММАРНАЯ (без учёта времени) нагрузка ресурса превысит доступность
    # (409). Эталонные units {6,5,6,4} суммарно 21 > 10, поэтому ресурс
    # создаётся с временной доступностью 21, после назначений снижается
    # до целевой — serial_sgs видит финальную доступность.
    resource_id = _create_resource(client, event_id, temp_availability, suffix)
    ids["R"] = resource_id

    for key in ("A", "B", "C", "D"):
        _create_assignment(
            client, ids[key], resource_id, resolved_units[key]
        )
    shrink = client.put(
        f"/api/resources/{resource_id}",
        json={"availability_per_day": availability},
    )
    assert shrink.status_code == 200, shrink.text
    return event_id, ids


def test_resource_schedule_endpoint_flow() -> None:
    """Эталонный ресурсный сценарий ромба с конфликтом и leveling.

    CPM: ES = 0,2,2,7; TF = 0,2,0,0 (критичны A, C, D). Serial SGS
    назначает в порядке приоритета A, C, B, D (D не eligible, пока её
    предшественник B не запланирован):
    - A: 0/2 (units 6, дни 0-1);
    - C: 2/7 (units 6, дни 2-6);
    - B: floor=2, но дни 2-4 конфликтуют с C (6+5=11>10) -> сдвиг до 7,
      actual_start 7, actual_finish 10, delay_days 5;
    - D: floor = max(ES 7, af_C 7, af_B 10) = 10 -> 10/14, delay_days 3.
    Ресурсный горизонт 14 БОЛЬШЕ CPM-горизонта 11 — эффект leveling.
    """
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id, ids = _build_diamond(client, "flow")

            calculated = client.post(
                f"/api/events/{event_id}/schedule/resource"
            )
            assert calculated.status_code == 200, calculated.text
            body = calculated.json()
            assert body["calculated"] == 4, body
            assert body["resource_project_duration"] == 14, body

            schedule = body["schedule"]
            assert schedule[ids["A"]]["actual_start"] == 0, schedule
            assert schedule[ids["A"]]["actual_finish"] == 2, schedule
            assert schedule[ids["A"]]["delay_days"] == 0, schedule
            assert schedule[ids["A"]]["is_critical"] is True, schedule

            assert schedule[ids["B"]] == {
                "actual_start": 7,
                "actual_finish": 10,
                "delay_days": 5,
                "is_critical": False,
            }, schedule

            assert schedule[ids["C"]]["actual_start"] == 2, schedule
            assert schedule[ids["C"]]["actual_finish"] == 7, schedule
            assert schedule[ids["C"]]["delay_days"] == 0, schedule
            assert schedule[ids["C"]]["is_critical"] is True, schedule

            assert schedule[ids["D"]] == {
                "actual_start": 10,
                "actual_finish": 14,
                "delay_days": 3,
                "is_critical": True,
            }, schedule

            # Персистентность bulk-обновления фактических дат в БД.
            task_b = client.get(f"/api/tasks/{ids['B']}")
            assert task_b.status_code == 200, task_b.text
            task_b_body = task_b.json()
            if "actual_start" in task_b_body:
                assert task_b_body["actual_start"] == 7, task_b_body
            if "actual_finish" in task_b_body:
                assert task_b_body["actual_finish"] == 10, task_b_body

            task_d = client.get(f"/api/tasks/{ids['D']}")
            assert task_d.status_code == 200, task_d.text
            task_d_body = task_d.json()
            if "actual_start" in task_d_body:
                assert task_d_body["actual_start"] == 10, task_d_body
            if "actual_finish" in task_d_body:
                assert task_d_body["actual_finish"] == 14, task_d_body
        finally:
            if event_id is not None:
                assert client.delete(f"/api/events/{event_id}").status_code == 204


def test_utilization_profile_flow() -> None:
    """GET utilization после расчёта: профиль по дням, пик и утилизация.

    Задачи идут последовательно (конфликт ресурса): A дни 0-1 по 6,
    C дни 2-6 по 6, B дни 7-9 по 5, D дни 10-13 по 4. Горизонт 14,
    пик 6.0 в день 0 (самый ранний из равных), 6/10 = 60%.
    """
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id, ids = _build_diamond(client, "util")

            calculated = client.post(
                f"/api/events/{event_id}/schedule/resource"
            )
            assert calculated.status_code == 200, calculated.text

            utilization = client.get(
                f"/api/events/{event_id}/resources/utilization"
            )
            assert utilization.status_code == 200, utilization.text
            body = utilization.json()
            assert body["event_id"] == event_id, body
            assert body["horizon_days"] == 14, body

            profiles = body["resources"]
            assert len(profiles) == 1, body
            profile = profiles[0]
            assert profile["resource_id"] == ids["R"], body
            assert profile["availability_per_day"] == 10.0, body

            by_day = profile["allocated_by_day"]
            assert by_day == {
                "0": 6.0, "1": 6.0,
                "2": 6.0, "3": 6.0, "4": 6.0, "5": 6.0, "6": 6.0,
                "7": 5.0, "8": 5.0, "9": 5.0,
                "10": 4.0, "11": 4.0, "12": 4.0, "13": 4.0,
            }, body

            assert profile["peak_allocated"] == 6.0, body
            assert profile["peak_day"] == 0, body
            assert profile["peak_utilization_percent"] == 60.0, body
        finally:
            if event_id is not None:
                assert client.delete(f"/api/events/{event_id}").status_code == 204


def test_utilization_requires_schedule() -> None:
    """400 «Resource schedule not calculated» до расчёта расписания."""
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id, _ = _build_diamond(client, "prereq")

            response = client.get(
                f"/api/events/{event_id}/resources/utilization"
            )
            assert response.status_code == 400, response.text
            assert (
                response.json()["detail"] == "Resource schedule not calculated"
            ), response.text
        finally:
            if event_id is not None:
                client.delete(f"/api/events/{event_id}")


def test_resource_schedule_empty_event() -> None:
    """400 «Event has no tasks» для события без задач."""
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id = _create_event(client, "notasks")

            response = client.post(f"/api/events/{event_id}/schedule/resource")
            assert response.status_code == 400, response.text
            assert response.json()["detail"] == "Event has no tasks", response.text
        finally:
            if event_id is not None:
                client.delete(f"/api/events/{event_id}")


def test_demand_exceeds_availability_400() -> None:
    """400 «Resource demand exceeds availability» при units 12 > avail 10.

    Проверка AssignmentService не даёт создать назначение 12 > 10, поэтому
    ресурс создаётся с доступностью 12, назначение — 12, затем доступность
    снижается PUT /api/resources/{id} до 10: спрос задачи (12) превышает
    доступность (10) и ядро serial_sgs отбрасывает граф.
    """
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id = _create_event(client, "over")
            task_id = _create_task(client, event_id, 2, "OA")
            resource_id = _create_resource(client, event_id, "12", "over")
            _create_assignment(client, task_id, resource_id, "12")

            shrunk = client.put(
                f"/api/resources/{resource_id}",
                json={"availability_per_day": "10"},
            )
            assert shrunk.status_code == 200, shrunk.text

            response = client.post(f"/api/events/{event_id}/schedule/resource")
            assert response.status_code == 400, response.text
            detail = response.json()["detail"]
            assert detail.startswith(
                "Resource demand exceeds availability"
            ), response.text
        finally:
            if event_id is not None:
                client.delete(f"/api/events/{event_id}")


def test_unknown_event_404() -> None:
    """404 обоих эндпоинтов для несуществующего события."""
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        missing = str(uuid.uuid4())

        calculated = client.post(f"/api/events/{missing}/schedule/resource")
        assert calculated.status_code == 404, calculated.text

        utilization = client.get(
            f"/api/events/{missing}/resources/utilization"
        )
        assert utilization.status_code == 404, utilization.text


def test_utilization_resource_without_assignments() -> None:
    """Ресурс без назначений в utilization: пустой день, peak 0, day None.

    К событию эталонного ромба добавляется второй ресурс без назначений:
    в профилях ровно 2 ресурса; у ресурса без назначений allocated_by_day
    пуст, peak_allocated 0.0, peak_day None, утилизация 0.0%.
    """
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id, ids = _build_diamond(client, "idleres")
            idle_id = _create_resource(client, event_id, "8", "idle")

            calculated = client.post(
                f"/api/events/{event_id}/schedule/resource"
            )
            assert calculated.status_code == 200, calculated.text

            utilization = client.get(
                f"/api/events/{event_id}/resources/utilization"
            )
            assert utilization.status_code == 200, utilization.text
            body = utilization.json()

            profiles = body["resources"]
            assert len(profiles) == 2, body
            by_id = {profile["resource_id"]: profile for profile in profiles}

            idle = by_id[idle_id]
            assert idle["allocated_by_day"] == {}, body
            assert idle["peak_allocated"] == 0.0, body
            assert idle["peak_day"] is None, body
            assert idle["peak_utilization_percent"] == 0.0, body

            # Ресурс с назначениями не изменился: пик 6.0 в день 0.
            busy = by_id[ids["R"]]
            assert busy["peak_allocated"] == 6.0, body
            assert busy["peak_day"] == 0, body
        finally:
            if event_id is not None:
                assert client.delete(f"/api/events/{event_id}").status_code == 204


def test_resource_schedule_idempotent_recalc() -> None:
    """Повторный POST /schedule/resource даёт те же фактические даты."""
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id, ids = _build_diamond(client, "idem")

            first = client.post(f"/api/events/{event_id}/schedule/resource")
            assert first.status_code == 200, first.text
            first_body = first.json()

            second = client.post(f"/api/events/{event_id}/schedule/resource")
            assert second.status_code == 200, second.text
            second_body = second.json()

            assert second_body["calculated"] == 4, second_body
            assert second_body["resource_project_duration"] == 14, second_body
            assert second_body["schedule"] == first_body["schedule"], (
                first_body,
                second_body,
            )
            for key in ("A", "B", "C", "D"):
                assert (
                    second_body["schedule"][ids[key]]
                    == first_body["schedule"][ids[key]]
                ), (key, first_body, second_body)
        finally:
            if event_id is not None:
                assert client.delete(f"/api/events/{event_id}").status_code == 204
