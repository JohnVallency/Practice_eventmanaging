"""Схемы Pydantic v2 для ответов расчёта расписания события."""

import uuid

from pydantic import BaseModel


class ScheduleItem(BaseModel):
    """Полный CPM-результат одной задачи (прямой + обратный проходы).

    Attributes:
        earliest_start: ранний старт (дней от старта события).
        earliest_finish: ранний финиш.
        latest_start: поздний старт.
        latest_finish: поздний финиш.
        total_float: общий резерв (на сколько можно сдвинуть задачу
            без сдвига длительности проекта).
        free_float: свободный резерв (без сдвига ранних дат последователей).
        is_critical: задача лежит на критическом пути (total_float == 0).
    """

    earliest_start: int
    earliest_finish: int
    latest_start: int
    latest_finish: int
    total_float: int
    free_float: int
    is_critical: bool


class ScheduleCalculationResponse(BaseModel):
    """Ответ на расчёт расписания события.

    Attributes:
        event_id: UUID рассчитанного события.
        calculated: сколько задач было рассчитано.
        schedule: словарь {task_id: полный CPM-результат задачи}.
        critical_path: id критических задач в топологическом порядке.
        project_duration: длительность проекта (максимум EF по задачам).
    """

    event_id: uuid.UUID
    calculated: int
    schedule: dict[str, ScheduleItem]
    critical_path: list[uuid.UUID]
    project_duration: int
