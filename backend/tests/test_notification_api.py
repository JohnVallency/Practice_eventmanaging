"""Интеграционные тесты API уведомлений EventLMS (GET /api/events/{eid}/notifications).

Тесты ходят по HTTP на живой стек http://localhost:8000 (как
test_resource_schedule_api.py); при его недоступности модуль пропускается.

Покрывают:
- хук task_overdue в CPM-расчёте (POST /api/events/{eid}/schedule/calculate):
  уведомление создаётся, когда actual_finish задачи позже её latest_finish;
- просрочку после ресурсного сдвига (leveling): ромб с avail 21 не даёт
  уведомлений, после снижения avail до 10 и повторного расчёта появляются
  ровно 2 уведомления (для сдвинутых B и D);
- отсутствие уведомлений без просрочки (actual_finish <= latest_finish);
- 404 уведомлений несуществующего события;
- пустой список для события без уведомлений;
- 400 «Event has no tasks» при расчёте ресурсного расписания на событии
  без задач.

Числа фиксированы контрактом serial_sgs (services/rcpsp.py) и эталонным
ромбом A(2), B(3), C(5), D(4), FS lag 0: CPM LS/LF: A 0/2, B 4/7, C 2/7,
D 7/11. Единственный ресурс avail 21, units A=6, B=5, C=6, D=4: SGS без
конфликтов даёт actual A 0/2, B 2/5, C 2/7, D 7/11. После снижения
доступности до 10: B 7/10 (> LF 7), D 10/14 (> LF 11), A и C без сдвига.
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
        "name": f"Notify {suffix} {uuid.uuid4().hex[:8]}",
        "start_date": "2026-03-01T00:00:00Z",
        "end_date": "2026-12-31T00:00:00Z",
        "total_budget": "1000.00",
    }


def _task_payload(event_id: str, name: str, duration: int) -> dict:
    """Валидная полезная нагрузка для создания задачи."""
    return {
        "event_id": event_id,
        "name": name,
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


def _create_task(
    client: httpx.Client, event_id: str, name: str, duration: int
) -> str:
    """Создать задачу в событии и вернуть её идентификатор."""
    created = client.post(
        "/api/tasks", json=_task_payload(event_id, name, duration)
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
    availability: str = "21.00",
) -> tuple[str, dict[str, str]]:
    """Собрать эталонный «ромб»: A(2), B(3), C(5), D(4) и ресурс.

    Зависимости A→B, A→C, B→D, C→D (FS, лаг 0); один ресурс
    availability_per_day=availability; units назначений A=6, B=5, C=6, D=4.

    Имена задач содержат литеру ключа ("Задача B ..."), чтобы по message
    уведомления можно было опознать просроченную задачу.

    Args:
        client: HTTP-клиент живого стека.
        suffix: суффикс имён сущностей.
        availability: доступность ресурса в день.

    Returns:
        (event_id, {"A": a_id, ..., "D": d_id, "R": resource_id,
        "names": {"A": имя, ..., "D": имя}}).
    """
    event_id = _create_event(client, suffix)
    ids: dict[str, str] = {}
    names: dict[str, str] = {}
    for key, duration in (("A", 2), ("B", 3), ("C", 5), ("D", 4)):
        name = f"Задача {key} {uuid.uuid4().hex[:8]}"
        names[key] = name
        ids[key] = _create_task(client, event_id, name, duration)

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

    units = {"A": "6", "B": "5", "C": "6", "D": "4"}

    # REST-ограничение: POST /api/assignments отклоняет назначение, если
    # СУММАРНАЯ (без учёта времени) нагрузка ресурса превысит доступность
    # (409). Эталонные units {6,5,6,4} суммарно 21, поэтому при целевой
    # доступности ниже 21 ресурс создаётся с временной 21, а после
    # назначений снижается до целевой.
    target = float(availability)
    total_units = sum(float(u) for u in units.values())
    initial = availability if total_units <= target else str(int(total_units))
    resource_id = _create_resource(client, event_id, initial, suffix)
    ids["R"] = resource_id

    for key in ("A", "B", "C", "D"):
        _create_assignment(client, ids[key], resource_id, units[key])
    if initial != availability:
        shrunk = client.put(
            f"/api/resources/{resource_id}",
            json={"availability_per_day": availability},
        )
        assert shrunk.status_code == 200, shrunk.text

    ids["names"] = names
    return event_id, ids


def test_overdue_notifications_created() -> None:
    """Хук task_overdue: 0 уведомлений без сдвига, 2 после leveling.

    Шаги: ресурсный расчёт при avail 21 (без конфликтов: actual == latest
    у всех) -> CPM-расчёт -> 0 уведомлений; снижение avail до 10 ->
    повторный ресурсный расчёт (B сдвигается на 7/10 > LF 7, D на
    10/14 > LF 11) -> CPM-расчёт -> ровно 2 уведомления task_overdue
    (для B и D), is_read=false, created_at не null, message содержит
    имя задачи и слово «просрочена».
    """
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id, ids = _build_diamond(client, "overdue", availability="21.00")
            names = ids["names"]

            # 1-й ресурсный расчёт: avail 21, конфликтов нет.
            first = client.post(f"/api/events/{event_id}/schedule/resource")
            assert first.status_code == 200, first.text
            first_schedule = first.json()["schedule"]
            assert first_schedule[ids["B"]]["actual_finish"] == 5, first_schedule
            assert first_schedule[ids["D"]]["actual_finish"] == 11, first_schedule

            # CPM-расчёт без просрочки: уведомлений нет (после 1-го расчёта).
            assert client.get(
                f"/api/events/{event_id}/notifications"
            ).json() == []

            calc = client.post(f"/api/events/{event_id}/schedule/calculate")
            assert calc.status_code == 200, calc.text
            before = client.get(f"/api/events/{event_id}/notifications")
            assert before.status_code == 200, before.text
            assert before.json() == [], before.text

            # Снижаем доступность и пересчитываем ресурсное расписание.
            shrunk = client.put(
                f"/api/resources/{ids['R']}",
                json={"availability_per_day": "10.00"},
            )
            assert shrunk.status_code == 200, shrunk.text

            second = client.post(f"/api/events/{event_id}/schedule/resource")
            assert second.status_code == 200, second.text
            second_schedule = second.json()["schedule"]
            assert second_schedule[ids["A"]]["actual_finish"] == 2, second_schedule
            assert second_schedule[ids["B"]] == {
                "actual_start": 7,
                "actual_finish": 10,
                "delay_days": 5,
                "is_critical": False,
            }, second_schedule
            assert second_schedule[ids["C"]]["actual_finish"] == 7, second_schedule
            assert second_schedule[ids["D"]] == {
                "actual_start": 10,
                "actual_finish": 14,
                "delay_days": 3,
                "is_critical": True,
            }, second_schedule

            # CPM-расчёт после сдвига: хук создаёт уведомления для B и D.
            recalc = client.post(f"/api/events/{event_id}/schedule/calculate")
            assert recalc.status_code == 200, recalc.text

            listed = client.get(f"/api/events/{event_id}/notifications")
            assert listed.status_code == 200, listed.text
            notifications = listed.json()
            assert len(notifications) == 2, notifications

            for notification in notifications:
                assert notification["event_id"] == event_id, notification
                assert notification["type"] == "task_overdue", notification
                assert notification["is_read"] is False, notification
                assert notification["created_at"] is not None, notification
                assert "просрочена" in notification["message"], notification

            messages = [notification["message"] for notification in notifications]
            assert sum(names["B"] in message for message in messages) == 1, messages
            assert sum(names["D"] in message for message in messages) == 1, messages
            # A и C без сдвига (actual == latest) — уведомлений нет.
            assert sum(names["A"] in message for message in messages) == 0, messages
            assert sum(names["C"] in message for message in messages) == 0, messages
        finally:
            if event_id is not None:
                assert client.delete(f"/api/events/{event_id}").status_code == 204


def test_no_overdue_without_delay() -> None:
    """Ромб с avail 21 без сдвигов: resource + calculate -> 0 уведомлений.

    SGS без конфликтов: actual B 2/5 <= LF 7, D 7/11 == LF 11 —
    хук task_overdue не срабатывает ни для одной задачи.
    """
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id, ids = _build_diamond(client, "nodelay", availability="21")

            calculated = client.post(f"/api/events/{event_id}/schedule/resource")
            assert calculated.status_code == 200, calculated.text
            schedule = calculated.json()["schedule"]
            assert schedule[ids["B"]]["actual_finish"] == 5, schedule
            assert schedule[ids["D"]]["actual_finish"] == 11, schedule

            recalc = client.post(f"/api/events/{event_id}/schedule/calculate")
            assert recalc.status_code == 200, recalc.text

            listed = client.get(f"/api/events/{event_id}/notifications")
            assert listed.status_code == 200, listed.text
            assert listed.json() == [], listed.text
        finally:
            if event_id is not None:
                assert client.delete(f"/api/events/{event_id}").status_code == 204


def test_unknown_event_404() -> None:
    """404 уведомлений для несуществующего события."""
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        missing = str(uuid.uuid4())
        response = client.get(f"/api/events/{missing}/notifications")
        assert response.status_code == 404, response.text


def test_empty_event_notifications() -> None:
    """Событие без задач и расчётов: GET notifications -> 200 []."""
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id = _create_event(client, "empty")

            response = client.get(f"/api/events/{event_id}/notifications")
            assert response.status_code == 200, response.text
            assert response.json() == [], response.text
        finally:
            if event_id is not None:
                assert client.delete(f"/api/events/{event_id}").status_code == 204


def test_calculate_empty_event_400() -> None:
    """400 «Event has no tasks» при расчёте расписания события без задач."""
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
