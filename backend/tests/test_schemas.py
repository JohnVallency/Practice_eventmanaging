"""Чистые Pydantic-тесты схем EventLMS без обращения к БД.

Проверяются контракты валидации четырёх сущностей и частичного
обновления события. Тестам достаточно импорта схем — базы данных нет.
"""

import uuid
from decimal import Decimal

import pytest
from pydantic import ValidationError

from schemas.assignment import AssignmentCreate
from schemas.event import EventCreate, EventUpdate
from schemas.resource import ResourceCreate
from schemas.task import TaskCreate
from schemas.task_dependency import TaskDependencyCreate


class TestEventCreate:
    """Контракты валидации схемы создания события."""

    def test_valid_payload_passes(self, event_create_payload: dict) -> None:
        """Валидный payload создаёт схему с корректными полями."""
        schema = EventCreate(**event_create_payload)

        assert schema.name == "Конференция DevDays"
        assert schema.total_budget == Decimal("150000.50")
        assert schema.end_date > schema.start_date

    def test_end_date_not_after_start_raises(
        self, event_payload_end_not_after_start: dict
    ) -> None:
        """end_date <= start_date отклоняется model_validator-ом."""
        with pytest.raises(ValidationError):
            EventCreate(**event_payload_end_not_after_start)

    def test_negative_total_budget_raises(
        self, event_payload_negative_budget: dict
    ) -> None:
        """Отрицательный total_budget нарушает ограничение ge=0."""
        with pytest.raises(ValidationError):
            EventCreate(**event_payload_negative_budget)


class TestEventUpdate:
    """Контракты частичного обновления события."""

    def test_single_date_only_does_not_raise(self) -> None:
        """Одна дата без второй — валидный частичный payload."""
        schema = EventUpdate(start_date="2025-06-01T09:00:00Z")

        assert schema.start_date is not None
        assert schema.end_date is None

    def test_both_dates_wrong_order_raises(self) -> None:
        """Обе даты в неверном порядке — ValidationError."""
        with pytest.raises(ValidationError):
            EventUpdate(
                start_date="2025-06-03T18:00:00Z",
                end_date="2025-06-01T09:00:00Z",
            )

    def test_both_dates_valid_order_passes(self) -> None:
        """Обе даты в правильном порядке — валидный payload."""
        schema = EventUpdate(
            start_date="2025-06-01T09:00:00Z",
            end_date="2025-06-03T18:00:00Z",
        )

        assert schema.end_date > schema.start_date


class TestTaskCreate:
    """Контракты валидации схемы создания задачи."""

    def test_valid_payload_passes(self, task_create_payload: dict) -> None:
        """Валидный payload создаёт схему."""
        schema = TaskCreate(**task_create_payload)

        assert schema.duration_days == 3
        assert isinstance(schema.event_id, uuid.UUID)

    def test_zero_duration_raises(self, task_payload_zero_duration: dict) -> None:
        """duration_days=0 нарушает ограничение gt=0."""
        with pytest.raises(ValidationError):
            TaskCreate(**task_payload_zero_duration)


class TestTaskDependencyCreate:
    """Контракты валидации схемы связи задач."""

    def test_valid_payload_passes(
        self, task_dependency_create_payload: dict
    ) -> None:
        """Валидный payload создаёт схему."""
        schema = TaskDependencyCreate(**task_dependency_create_payload)

        assert schema.dependency_type.value == "FS"
        assert schema.lag_days == 0

    def test_self_dependency_raises(
        self, task_dependency_payload_self_dependency: dict
    ) -> None:
        """predecessor_id == successor_id запрещён model_validator-ом."""
        with pytest.raises(ValidationError):
            TaskDependencyCreate(**task_dependency_payload_self_dependency)


class TestResourceCreate:
    """Контракты валидации схемы создания ресурса."""

    def test_valid_payload_passes(self, resource_create_payload: dict) -> None:
        """Валидный payload создаёт схему."""
        schema = ResourceCreate(**resource_create_payload)

        assert schema.availability_per_day == Decimal("8")
        assert schema.type.value == "equipment"

    def test_zero_availability_raises(
        self, resource_payload_zero_availability: dict
    ) -> None:
        """availability_per_day=0 нарушает ограничение gt=0."""
        with pytest.raises(ValidationError):
            ResourceCreate(**resource_payload_zero_availability)


class TestAssignmentCreate:
    """Контракты валидации схемы назначения ресурса на задачу."""

    def test_valid_payload_passes(self, assignment_create_payload: dict) -> None:
        """Валидный payload создаёт схему."""
        schema = AssignmentCreate(**assignment_create_payload)

        assert schema.units_allocated == Decimal("2.5")

    def test_zero_units_raises(self, assignment_payload_zero_units: dict) -> None:
        """units_allocated=0 нарушает ограничение gt=0."""
        with pytest.raises(ValidationError):
            AssignmentCreate(**assignment_payload_zero_units)
