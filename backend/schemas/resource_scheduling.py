"""Схемы Pydantic v2 для ресурсного расписания (RCPSP) и загрузки ресурсов."""

import uuid

from pydantic import BaseModel


class ResourceScheduleItem(BaseModel):
    """Фактические даты одной задачи после серийного метода SGS.

    Attributes:
        actual_start: фактический старт с учётом ресурсных ограничений
            (дней от старта события).
        actual_finish: фактический финиш.
        delay_days: задержка относительно раннего старта CPM
            (actual_start - earliest_start).
        is_critical: задача лежит на критическом пути (total_float == 0).
    """

    actual_start: int
    actual_finish: int
    delay_days: int
    is_critical: bool


class ResourceScheduleResponse(BaseModel):
    """Ответ на расчёт ресурсного расписания события.

    Attributes:
        event_id: UUID рассчитанного события.
        calculated: сколько задач было рассчитано.
        schedule: словарь {task_id: фактические даты задачи}.
        resource_project_duration: длительность проекта с учётом ресурсов
            (максимум actual_finish по задачам).
    """

    event_id: uuid.UUID
    calculated: int
    schedule: dict[str, ResourceScheduleItem]
    resource_project_duration: int


class ResourceUtilization(BaseModel):
    """Профиль загрузки одного ресурса события по дням.

    Attributes:
        resource_id: UUID ресурса.
        resource_name: название ресурса.
        resource_type: тип ресурса (строковое значение enum:
            "human" / "equipment" / "venue").
        availability_per_day: доступность ресурса в день.
        allocated_by_day: {день (строка): сумма units} — только дни
            с загрузкой > 0.
        peak_allocated: максимальная одновременная загрузка.
        peak_day: день пика загрузки (None, если назначений нет).
        peak_utilization_percent: peak / availability * 100, 2 знака.
    """

    resource_id: uuid.UUID
    resource_name: str
    resource_type: str
    availability_per_day: float
    allocated_by_day: dict[str, float]
    peak_allocated: float
    peak_day: int | None
    peak_utilization_percent: float


class ResourceUtilizationResponse(BaseModel):
    """Ответ на расчёт загрузки ресурсов события.

    Attributes:
        event_id: UUID события.
        horizon_days: горизонт планирования (максимум actual_finish).
        resources: профили загрузки каждого ресурса события.
    """

    event_id: uuid.UUID
    horizon_days: int
    resources: list[ResourceUtilization]
