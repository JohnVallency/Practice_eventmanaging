"""Схемы Pydantic v2 для ответов расчёта расписания события."""

import uuid

from pydantic import BaseModel


class ScheduleItem(BaseModel):
    """Ранние даты одной задачи (результат прямого прохода CPM)."""

    earliest_start: int
    earliest_finish: int


class ScheduleCalculationResponse(BaseModel):
    """Ответ на расчёт расписания события.

    Attributes:
        event_id: UUID рассчитанного события.
        calculated: сколько задач было рассчитано.
        schedule: словарь {task_id: ранние даты задачи}.
    """

    event_id: uuid.UUID
    calculated: int
    schedule: dict[str, ScheduleItem]
