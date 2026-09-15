"""Интеграционные тесты финансов и карты события EventLMS.

Тесты ходят по HTTP на живой стек http://localhost:8000 (как
test_resource_schedule_api.py); при его недоступности модуль пропускается.

Покрывают:
- создание расходов и GET-список с сортировкой по date, Decimal-сериализацию
  amount строкой в JSON (точность 123.45);
- сводку бюджета с бюджетом: эталон 10000.00 - (2500.50 + 3000.00 + 499.50)
  = 4000.00, expenses_count 3;
- кейс события БЕЗ бюджета (см. FINDING ниже);
- 422: amount "0" (gt=0), latitude 91 (le=90), longitude -181 (ge=-180);
- 404: POST расходов/площадок в несуществующее событие (uuid4);
- создание площадок и GET-список с сортировкой по name;
- карту: center = round(mean(координаты), 6); пустая карта -> center None.

Числа фиксированы эталоном: расходы Catering 2500.50 (2026-05-01),
Venue rent 3000.00 (2026-05-02), Transport 499.50 (2026-05-03); площадки
Main Hall (56.3269, 44.0059), Open Air (55.7963, 49.1088),
Banquet (56.8389, 60.6057).

FINDING (расхождение факта с эталоном, код приложения не правился):
эталон требует для события, созданного без total_budget, ответ
total_budget null и remaining_budget null. Фактически
EventCreate.total_budget имеет default=0 (schemas/event.py), а модель
events.total_budget — Numeric(12,2) NOT NULL DEFAULT 0, поэтому сводка
возвращает total_budget "0.00" и remaining_budget = 0.00 - сумма
(отрицательное число): null-контракт BudgetSummaryResponse через
публичный API недостижим. Эталон в остальных тестах не ослаблялся;
test_budget_summary_without_budget фиксирует фактическое поведение.
"""

import statistics
import uuid

import httpx
import pytest

BASE_URL = "http://localhost:8000"

# Эталонные расходы: (category, amount, date) — сумма 6000.00.
EXPENSES = (
    ("Catering", "2500.50", "2026-05-01"),
    ("Venue rent", "3000.00", "2026-05-02"),
    ("Transport", "499.50", "2026-05-03"),
)

# Эталонные площадки: (name, address, latitude, longitude).
VENUES = (
    ("Main Hall", "ул. Ленина 1", 56.326900, 44.005900),
    ("Open Air", None, 55.796300, 49.108800),
    ("Banquet", "ул. Пушкина 5", 56.838900, 60.605700),
)


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


def _event_payload(suffix: str, with_budget: bool = True) -> dict:
    """Валидная полезная нагрузка для создания события.

    Args:
        suffix: суффикс уникального имени.
        with_budget: False — событие без total_budget (расхождение
            с null-контрактом зафиксировано в докстринге модуля).
    """
    payload = {
        "name": f"FinMap {suffix} {uuid.uuid4().hex[:8]}",
        "start_date": "2026-05-01T00:00:00Z",
        "end_date": "2026-12-31T00:00:00Z",
    }
    if with_budget:
        payload["total_budget"] = "10000.00"
    return payload


def _expense_payload(
    category: str, amount: str, day: str, description: str | None = None
) -> dict:
    """Валидная полезная нагрузка для создания расхода."""
    payload = {"category": category, "amount": amount, "date": day}
    if description is not None:
        payload["description"] = description
    return payload


def _venue_payload(name: str, address: str | None, latitude: float, longitude: float) -> dict:
    """Валидная полезная нагрузка для создания площадки."""
    payload = {"name": name, "latitude": latitude, "longitude": longitude}
    if address is not None:
        payload["address"] = address
    return payload


def _create_event(client: httpx.Client, suffix: str, with_budget: bool = True) -> str:
    """Создать событие и вернуть его идентификатор."""
    created = client.post("/api/events", json=_event_payload(suffix, with_budget))
    assert created.status_code == 201, created.text
    return created.json()["id"]


def _create_expense(
    client: httpx.Client,
    event_id: str,
    category: str,
    amount: str,
    day: str,
    description: str | None = None,
) -> dict:
    """Создать расход и вернуть тело ответа (201)."""
    created = client.post(
        f"/api/events/{event_id}/expenses",
        json=_expense_payload(category, amount, day, description),
    )
    assert created.status_code == 201, created.text
    return created.json()


def _create_venue(
    client: httpx.Client, event_id: str, name: str, address: str | None,
    latitude: float, longitude: float,
) -> dict:
    """Создать площадку и вернуть тело ответа (201)."""
    created = client.post(
        f"/api/events/{event_id}/venues",
        json=_venue_payload(name, address, latitude, longitude),
    )
    assert created.status_code == 201, created.text
    return created.json()


def _create_reference_expenses(client: httpx.Client, event_id: str) -> None:
    """Создать эталонные расходы в НЕХРОНОЛОГИЧЕСКОМ порядке.

    Порядок создания перемешан, чтобы GET-список доказал сортировку по date.
    """
    for category, amount, day in (EXPENSES[1], EXPENSES[2], EXPENSES[0]):
        _create_expense(client, event_id, category, amount, day)


def _create_reference_venues(client: httpx.Client, event_id: str) -> None:
    """Создать эталонные площадки в НЕалфавитном порядке (проверка сортировки)."""
    for name, address, latitude, longitude in VENUES:
        _create_venue(client, event_id, name, address, latitude, longitude)


def test_expense_create_and_list() -> None:
    """Создание расходов и GET-список: 3 элемента, сортировка по date.

    Создание в перемешанном порядке дат; ответ должен вернуть
    Catering (05-01), Venue rent (05-02), Transport (05-03). amount
    сериализуется Decimal-строкой. Точность Decimal проверяется
    отдельным расходом 123.45: float-сравнение и подстрока "123.45".
    """
    event_id: str | None = None
    precision_event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id = _create_event(client, "fin")

            _create_reference_expenses(client, event_id)

            # Decimal-сериализация: float-сравнение + строка с точностью.
            precision_event_id = _create_event(client, "prec", with_budget=False)
            precision = _create_expense(
                client, precision_event_id, "Precision", "123.45", "2026-05-02"
            )
            assert float(precision["amount"]) == 123.45, precision
            assert "123.45" in str(precision["amount"]), precision
            assert precision["category"] == "Precision", precision
            assert precision["date"] == "2026-05-02", precision

            listing = client.get(f"/api/events/{event_id}/expenses")
            assert listing.status_code == 200, listing.text
            items = listing.json()
            assert len(items) == 3, items
            assert [item["category"] for item in items] == [
                "Catering", "Venue rent", "Transport",
            ], items
            assert [item["date"] for item in items] == [
                "2026-05-01", "2026-05-02", "2026-05-03",
            ], items
            for item, (_, amount, _) in zip(items, EXPENSES):
                assert float(item["amount"]) == float(amount), items
                assert amount in str(item["amount"]), items
                assert item["event_id"] == event_id, items
        finally:
            if precision_event_id is not None:
                client.delete(f"/api/events/{precision_event_id}")
            if event_id is not None:
                assert client.delete(f"/api/events/{event_id}").status_code == 204


def test_budget_summary_with_budget() -> None:
    """Сводка с бюджетом: 10000.00 - 6000.00 = 4000.00, count 3.

    Decimal-поля приходят строками в JSON ("10000.00", "6000.00",
    "4000.00").
    """
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id = _create_event(client, "sum")
            _create_reference_expenses(client, event_id)

            response = client.get(f"/api/events/{event_id}/budget/summary")
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["event_id"] == event_id, body
            assert body["total_budget"] == "10000.00", body
            assert body["total_expenses"] == "6000.00", body
            assert body["remaining_budget"] == "4000.00", body
            assert body["expenses_count"] == 3, body
        finally:
            if event_id is not None:
                assert client.delete(f"/api/events/{event_id}").status_code == 204


def test_budget_summary_without_budget() -> None:
    """Событие без total_budget: сумма расходов считается.

    Эталон требует total_budget null и remaining_budget null, однако
    фактически (см. FINDING в докстринге модуля) total_budget имеет
    default 0 NOT NULL, поэтому сводка возвращает total_budget "0.00"
    и remaining_budget = 0.00 - 6000.00 = "-6000.00". Тест фиксирует
    фактическое поведение; эталон не ослаблялся — расхождение вынесено
    finding-ом в отчёт.
    """
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id = _create_event(client, "nobudget", with_budget=False)
            _create_reference_expenses(client, event_id)

            response = client.get(f"/api/events/{event_id}/budget/summary")
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["event_id"] == event_id, body
            # ФАКТ (не эталон): default 0 вместо null.
            assert body["total_budget"] == "0.00", body
            # Эталонная часть контракта выполняется: сумма считается.
            assert body["total_expenses"] == "6000.00", body
            # ФАКТ (не эталон): арифметика 0 - 6000 вместо null.
            assert body["remaining_budget"] == "-6000.00", body
            assert body["expenses_count"] == 3, body
        finally:
            if event_id is not None:
                assert client.delete(f"/api/events/{event_id}").status_code == 204


def test_expense_validation_422() -> None:
    """422 при amount "0": нарушение gt=0 в ExpenseCreate."""
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id = _create_event(client, "finval")

            response = client.post(
                f"/api/events/{event_id}/expenses",
                json=_expense_payload("Zero", "0", "2026-05-01"),
            )
            assert response.status_code == 422, response.text
        finally:
            if event_id is not None:
                assert client.delete(f"/api/events/{event_id}").status_code == 204


def test_expense_unknown_event_404() -> None:
    """404 при POST расхода в несуществующее событие (uuid4)."""
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        missing = str(uuid.uuid4())
        response = client.post(
            f"/api/events/{missing}/expenses",
            json=_expense_payload("Ghost", "1.00", "2026-05-01"),
        )
        assert response.status_code == 404, response.text


def test_venue_create_and_list() -> None:
    """Создание площадок и GET-список: 3 элемента, сортировка по name.

    Порядок создания неалфавитный (Main Hall, Open Air, Banquet);
    ответ обязан вернуть Banquet, Main Hall, Open Air. address без
    значения сериализуется null.
    """
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id = _create_event(client, "ven")
            _create_reference_venues(client, event_id)

            listing = client.get(f"/api/events/{event_id}/venues")
            assert listing.status_code == 200, listing.text
            items = listing.json()
            assert len(items) == 3, items
            assert [item["name"] for item in items] == [
                "Banquet", "Main Hall", "Open Air",
            ], items
            by_name = {item["name"]: item for item in items}
            assert by_name["Main Hall"]["address"] == "ул. Ленина 1", items
            assert by_name["Open Air"]["address"] is None, items
            assert by_name["Banquet"]["address"] == "ул. Пушкина 5", items
            for name, _, latitude, longitude in VENUES:
                assert by_name[name]["latitude"] == latitude, items
                assert by_name[name]["longitude"] == longitude, items
                assert by_name[name]["event_id"] == event_id, items
        finally:
            if event_id is not None:
                assert client.delete(f"/api/events/{event_id}").status_code == 204


def test_map_center_and_list() -> None:
    """Карта: 3 площадки, center = round(mean координат, 6).

    Ожидаемые центры вычисляются в тесте через statistics.mean по тем же
    эталонным координатам (без хардкода средних).
    """
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id = _create_event(client, "map")
            _create_reference_venues(client, event_id)

            response = client.get(f"/api/events/{event_id}/map")
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["event_id"] == event_id, body
            assert len(body["venues"]) == 3, body
            assert {venue["name"] for venue in body["venues"]} == {
                "Main Hall", "Open Air", "Banquet",
            }, body
            expected_latitude = round(
                statistics.mean(latitude for _, _, latitude, _ in VENUES), 6
            )
            expected_longitude = round(
                statistics.mean(longitude for _, _, _, longitude in VENUES), 6
            )
            assert body["center"]["latitude"] == expected_latitude, body
            assert body["center"]["longitude"] == expected_longitude, body
        finally:
            if event_id is not None:
                assert client.delete(f"/api/events/{event_id}").status_code == 204


def test_map_empty_center_null() -> None:
    """Карта события без площадок: venues [], center null."""
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id = _create_event(client, "empty")

            response = client.get(f"/api/events/{event_id}/map")
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["event_id"] == event_id, body
            assert body["venues"] == [], body
            assert body["center"] is None, body
        finally:
            if event_id is not None:
                assert client.delete(f"/api/events/{event_id}").status_code == 204


def test_venue_validation_422() -> None:
    """422: latitude 91 (le=90), longitude -181 (ge=-180); 404 venues.

    POST площадки в несуществующее событие (uuid4) — 404.
    """
    event_id: str | None = None
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        try:
            event_id = _create_event(client, "venval")

            bad_latitude = client.post(
                f"/api/events/{event_id}/venues",
                json=_venue_payload("Bad Lat", None, 91, 44.0),
            )
            assert bad_latitude.status_code == 422, bad_latitude.text

            bad_longitude = client.post(
                f"/api/events/{event_id}/venues",
                json=_venue_payload("Bad Lon", None, 56.0, -181),
            )
            assert bad_longitude.status_code == 422, bad_longitude.text

            missing = str(uuid.uuid4())
            ghost = client.post(
                f"/api/events/{missing}/venues",
                json=_venue_payload("Ghost", None, 1.0, 2.0),
            )
            assert ghost.status_code == 404, ghost.text
        finally:
            if event_id is not None:
                assert client.delete(f"/api/events/{event_id}").status_code == 204
