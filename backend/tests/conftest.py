"""Общие pytest-фикстуры тестов EventLMS.

Стратегия "костяка": работаем без БД. Тестовый клиент поднимает уже
собранное приложение main.app, а проверки Pydantic-схем выполняются
напрямую по моделям. SQLite+aiosqlite сознательно не используется:
диалект не поддерживает UUID/ENUM PostgreSQL, поэтому любые сценарии,
которым нужна база, в этот набор не включаются.
"""

import importlib
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from main import app

# Эталонные даты события в формате ISO-8601 с суффиксом "Z" (UTC).
EVENT_START_ISO = "2025-06-01T09:00:00Z"
EVENT_END_ISO = "2025-06-03T18:00:00Z"


def has_module(module_name: str) -> bool:
    """Проверить, что модуль доступен для импорта.

    Служит условием skipif для смоук-тестов: пока параллельная
    разработка роутов/сервисов не завершена, связанные тесты
    молча пропускаются вместо падения коллекции.

    Args:
        module_name: полное имя модуля, например "api.routes.events".

    Returns:
        True, если импорт проходит без исключений, иначе False.
    """
    try:
        importlib.import_module(module_name)
    except Exception:
        return False
    return True


@pytest.fixture
def client() -> TestClient:
    """TestClient приложения EventLMS без обращения к БД.

    raise_server_exceptions=False позволяет смоук-тестам получать
    HTTP-ответы (в том числе 500) вместо проброса исключений.

    Returns:
        Готовый к запросам TestClient.
    """
    return TestClient(app, raise_server_exceptions=False)


# --- Фабрики валидных payload-ов (свежий dict при каждом вызове) ---


def _event_create_payload() -> dict[str, Any]:
    """Собрать валидный payload для EventCreate."""
    return {
        "name": "Конференция DevDays",
        "start_date": EVENT_START_ISO,
        "end_date": EVENT_END_ISO,
        "status": "draft",
        "total_budget": "150000.50",
    }


def _task_create_payload() -> dict[str, Any]:
    """Собрать валидный payload для TaskCreate."""
    return {
        "event_id": str(uuid.uuid4()),
        "name": "Монтаж сцены",
        "duration_days": 3,
    }


def _task_dependency_create_payload() -> dict[str, Any]:
    """Собрать валидный payload для TaskDependencyCreate."""
    return {
        "predecessor_id": str(uuid.uuid4()),
        "successor_id": str(uuid.uuid4()),
        "dependency_type": "FS",
        "lag_days": 0,
    }


def _resource_create_payload() -> dict[str, Any]:
    """Собрать валидный payload для ResourceCreate."""
    return {
        "event_id": str(uuid.uuid4()),
        "name": "Звуковой пульт",
        "type": "equipment",
        "availability_per_day": "8",
        "cost_per_day": "1200.00",
    }


def _assignment_create_payload() -> dict[str, Any]:
    """Собрать валидный payload для AssignmentCreate."""
    return {
        "task_id": str(uuid.uuid4()),
        "resource_id": str(uuid.uuid4()),
        "units_allocated": "2.5",
    }


# --- Фикстуры валидных payload-ов ---


@pytest.fixture
def event_create_payload() -> dict[str, Any]:
    """Валидный payload EventCreate."""
    return _event_create_payload()


@pytest.fixture
def task_create_payload() -> dict[str, Any]:
    """Валидный payload TaskCreate."""
    return _task_create_payload()


@pytest.fixture
def task_dependency_create_payload() -> dict[str, Any]:
    """Валидный payload TaskDependencyCreate."""
    return _task_dependency_create_payload()


@pytest.fixture
def resource_create_payload() -> dict[str, Any]:
    """Валидный payload ResourceCreate."""
    return _resource_create_payload()


@pytest.fixture
def assignment_create_payload() -> dict[str, Any]:
    """Валидный payload AssignmentCreate."""
    return _assignment_create_payload()


# --- Фикстуры невалидных payload-ов ---


@pytest.fixture
def event_payload_end_not_after_start() -> dict[str, Any]:
    """EventCreate: end_date раньше start_date — нарушение диапазона."""
    payload = _event_create_payload()
    payload["end_date"] = "2025-05-31T18:00:00Z"
    return payload


@pytest.fixture
def event_payload_negative_budget() -> dict[str, Any]:
    """EventCreate: отрицательный total_budget — нарушение ge=0."""
    payload = _event_create_payload()
    payload["total_budget"] = "-100.00"
    return payload


@pytest.fixture
def task_payload_zero_duration() -> dict[str, Any]:
    """TaskCreate: duration_days=0 — нарушение gt=0."""
    payload = _task_create_payload()
    payload["duration_days"] = 0
    return payload


@pytest.fixture
def task_dependency_payload_self_dependency() -> dict[str, Any]:
    """TaskDependencyCreate: predecessor совпадает с successor."""
    same_id = str(uuid.uuid4())
    return {
        "predecessor_id": same_id,
        "successor_id": same_id,
        "dependency_type": "FS",
        "lag_days": 0,
    }


@pytest.fixture
def resource_payload_zero_availability() -> dict[str, Any]:
    """ResourceCreate: availability_per_day=0 — нарушение gt=0."""
    payload = _resource_create_payload()
    payload["availability_per_day"] = "0"
    return payload


@pytest.fixture
def assignment_payload_zero_units() -> dict[str, Any]:
    """AssignmentCreate: units_allocated=0 — нарушение gt=0."""
    payload = _assignment_create_payload()
    payload["units_allocated"] = "0"
    return payload
