"""Сервисный слой ресурсного расписания (RCPSP) и загрузки ресурсов.

Схема транзакций единая со всеми сервисами: методы работают внутри сессии
из зависимости ``get_session``; коммит выполняет сам ``get_session`` после
успешного ответа роута, сервис делает ``await session.flush()``.

Чистая математика: CPM-проходы — в ``services.scheduling``, серийный метод
SGS (Schedule Generation Scheme) с учётом ограничений по ресурсам — в
``services.rcpsp`` (``serial_sgs``). Этот модуль отвечает за загрузку
данных, расчёт CPM-полей В ПАМЯТИ (persisted ES/TF не читаются и не
пишутся), bulk-обновление фактических дат и агрегацию загрузки ресурсов.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from core.exceptions import ValidationError
from models import Assignment, Resource, Task, TaskDependency
from services.event_service import EventService
from services.rcpsp import serial_sgs
from services.scheduling import (
    calculate_backward_pass,
    calculate_floats,
    calculate_forward_pass,
)


@dataclass
class _TaskCpmView:
    """Представление задачи для ядра ``serial_sgs``.

    CPM-поля (``earliest_start``, ``total_float``, ``is_critical``)
    рассчитываются в памяти вызовом :func:`calculate_forward_pass` и не
    полагаются на persisted-поля ORM и не записываются в БД.

    Attributes:
        id: UUID задачи.
        duration_days: длительность задачи в днях.
        earliest_start: ранний старт по CPM (дней от старта события).
        total_float: полный резерв по CPM.
        is_critical: задача на критическом пути (total_float == 0).
    """

    id: uuid.UUID
    duration_days: int
    earliest_start: int
    total_float: int
    is_critical: bool


def _enum_value(raw: object) -> str:
    """Строковое значение enum (``ResourceType.HUMAN`` -> ``"human"``)."""
    return str(getattr(raw, "value", raw))


class ResourceSchedulingService:
    """Расчёт ресурсного расписания события и профиля загрузки ресурсов."""

    @staticmethod
    async def calculate_resource_schedule(
        session: AsyncSession, event_id: uuid.UUID
    ) -> dict[str, object]:
        """Рассчитать и сохранить фактические даты задач с учётом ресурсов.

        Шаги:
        1. Проверить существование события (404 через
           :meth:`EventService.get_or_404`).
        2. Загрузить задачи события; пустой набор -> ValidationError.
        3. Загрузить связи, у которых ОБЕ задачи принадлежат событию.
        4. Загрузить назначения задач события и ресурсы события.
        5. Рассчитать CPM-поля В ПАМЯТИ: прямой проход (ES/EF), обратный
           проход (LS/LF от max EF), резервы; ``is_critical`` = TF == 0.
           Persisted-поля ES/EF/LS/LF/TF не читаются и не обновляются.
        6. Выполнить серийный метод SGS (:func:`serial_sgs`): ValueError
           (цикл либо потребность > доступности) -> ValidationError (400).
        7. Bulk-обновить только ``actual_start``/``actual_finish`` одним
           ORM-UPDATE и отправить изменения через ``session.flush()``.

        Args:
            session: активная сессия SQLAlchemy.
            event_id: UUID события.

        Returns:
            dict: {"event_id": str, "calculated": int,
            "schedule": {task_id: {"actual_start", "actual_finish",
            "delay_days", "is_critical"}},
            "resource_project_duration": max actual_finish}.

        Raises:
            ResourceNotFound: если события с таким UUID нет.
            ValidationError: если у события нет задач либо ядро SGS
                отклонило граф (цикл, потребность > доступности).
        """
        # 1. Событие должно существовать; 404 бросает сам метод.
        await EventService.get_or_404(session, event_id)

        # 2. Задачи события.
        result = await session.execute(
            select(Task).where(Task.event_id == event_id)
        )
        tasks: list[Task] = list(result.scalars().all())
        if not tasks:
            raise ValidationError("Event has no tasks")

        # 3. Связи, где и предшественник, и последователь принадлежат событию.
        pred_task = aliased(Task)
        succ_task = aliased(Task)
        dep_result = await session.execute(
            select(TaskDependency)
            .join(pred_task, TaskDependency.predecessor_id == pred_task.id)
            .join(succ_task, TaskDependency.successor_id == succ_task.id)
            .where(
                pred_task.event_id == event_id,
                succ_task.event_id == event_id,
            )
        )
        dependencies: list[TaskDependency] = list(dep_result.scalars().all())

        # 4. Назначения задач события и ресурсы события.
        assignment_result = await session.execute(
            select(Assignment)
            .join(Task, Assignment.task_id == Task.id)
            .where(Task.event_id == event_id)
        )
        assignments: list[Assignment] = list(assignment_result.scalars().all())
        resource_result = await session.execute(
            select(Resource).where(Resource.event_id == event_id)
        )
        resources: list[Resource] = list(resource_result.scalars().all())

        # 5. CPM-поля только в памяти: ES из прямого прохода, TF из резервов,
        # критичность = TF == 0. Persisted-поля не читаются и не пишутся.
        forward = calculate_forward_pass(tasks, dependencies)
        # Длительность проекта — максимум EF (задачи гарантированно не пусты).
        project_duration = max(
            values["earliest_finish"] for values in forward.values()
        )
        backward = calculate_backward_pass(
            tasks, dependencies, project_duration
        )
        floats = calculate_floats(tasks, dependencies, forward, backward)

        cpm_tasks: list[_TaskCpmView] = []
        for task in tasks:
            total_float = int(floats[task.id]["total_float"])
            cpm_tasks.append(
                _TaskCpmView(
                    id=task.id,
                    duration_days=int(task.duration_days),
                    earliest_start=int(forward[task.id]["earliest_start"]),
                    total_float=total_float,
                    is_critical=(total_float == 0),
                )
            )
        critical_ids: set[uuid.UUID] = {
            view.id for view in cpm_tasks if view.is_critical
        }

        # 6. Серийный метод SGS: доменная ошибка ядра -> ValidationError 400.
        try:
            actual: dict[uuid.UUID, dict[str, int]] = serial_sgs(
                cpm_tasks, dependencies, assignments, resources
            )
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc

        # 7. Bulk-обновление фактических дат одним ORM-UPDATE по PK.
        payload = [
            {
                "id": tid,
                "actual_start": values["actual_start"],
                "actual_finish": values["actual_finish"],
            }
            for tid, values in actual.items()
        ]
        if payload:
            await session.execute(sa_update(Task), payload)
        await session.flush()

        return {
            "event_id": str(event_id),
            "calculated": len(tasks),
            "schedule": {
                str(tid): {
                    "actual_start": int(values["actual_start"]),
                    "actual_finish": int(values["actual_finish"]),
                    "delay_days": int(values["delay_days"]),
                    "is_critical": tid in critical_ids,
                }
                for tid, values in actual.items()
            },
            "resource_project_duration": max(
                int(values["actual_finish"]) for values in actual.values()
            ),
        }

    @staticmethod
    async def calculate_resource_utilization(
        session: AsyncSession, event_id: uuid.UUID
    ) -> dict[str, object]:
        """Рассчитать профиль загрузки каждого ресурса события по дням.

        Шаги:
        1. Проверить существование события (404) и загрузить задачи;
           пустой набор -> ValidationError("Event has no tasks").
        2. Если у ЛЮБОЙ задачи ``actual_start is None`` — ресурсное
           расписание ещё не рассчитано -> ValidationError(400).
        3. Горизонт планирования — максимум ``actual_finish``.
        4. Загрузить назначения (JOIN по задачам события) и ресурсы события;
           для каждого ресурса суммировать занятые units по дням: день d
           занят задачей t при ``d in range(actual_start, actual_finish)``.
           В ``allocated_by_day`` попадают только дни с суммой > 0.

        Args:
            session: активная сессия SQLAlchemy.
            event_id: UUID события.

        Returns:
            dict: {"event_id": str, "horizon_days": int,
            "resources": [{"resource_id", "resource_name", "resource_type",
            "availability_per_day", "allocated_by_day", "peak_allocated",
            "peak_day", "peak_utilization_percent"}]}. Ресурс без
            назначений: пустой ``allocated_by_day``, peak 0.0,
            ``peak_day`` None, загрузка 0.0%.

        Raises:
            ResourceNotFound: если события с таким UUID нет.
            ValidationError: если у события нет задач либо ресурсное
                расписание ещё не рассчитано.
        """
        # 1. Событие и задачи.
        await EventService.get_or_404(session, event_id)
        result = await session.execute(
            select(Task).where(Task.event_id == event_id)
        )
        tasks: list[Task] = list(result.scalars().all())
        if not tasks:
            raise ValidationError("Event has no tasks")

        # 2. Ресурсное расписание должно быть рассчитано ранее.
        if any(task.actual_start is None for task in tasks):
            raise ValidationError("Resource schedule not calculated")

        # 3. Горизонт — максимум фактического финиша.
        horizon = max(int(task.actual_finish) for task in tasks)  # type: ignore[type-var]

        # 4. Назначения задач события и ресурсы события.
        assignment_result = await session.execute(
            select(Assignment)
            .join(Task, Assignment.task_id == Task.id)
            .where(Task.event_id == event_id)
        )
        assignments: list[Assignment] = list(assignment_result.scalars().all())
        resource_result = await session.execute(
            select(Resource).where(Resource.event_id == event_id)
        )
        resources: list[Resource] = list(resource_result.scalars().all())

        # Занятость по дням: resource_id -> [(задача, units в день)].
        tasks_by_id: dict[uuid.UUID, Task] = {task.id: task for task in tasks}
        load_entries: dict[uuid.UUID, list[tuple[Task, float]]] = {}
        for assignment in assignments:
            task = tasks_by_id.get(assignment.task_id)
            if task is None:
                continue
            load_entries.setdefault(assignment.resource_id, []).append(
                (task, float(assignment.units_allocated))
            )

        resource_profiles: list[dict[str, object]] = []
        for resource in resources:
            allocated_by_day: dict[str, float] = {}
            day_totals: dict[int, float] = {}
            for task, units in load_entries.get(resource.id, []):
                start = int(task.actual_start)  # type: ignore[arg-type]
                finish = int(task.actual_finish)  # type: ignore[arg-type]
                for day in range(start, finish):
                    day_totals[day] = day_totals.get(day, 0.0) + units

            if day_totals:
                peak = max(day_totals.values())
                # При равных пиках выбирается самый ранний день.
                peak_day = min(
                    day
                    for day, total in day_totals.items()
                    if total == peak
                )
                allocated_by_day = {
                    str(day): total
                    for day, total in sorted(day_totals.items())
                    if total > 0
                }
            else:
                peak = 0.0
                peak_day = None

            availability = float(resource.availability_per_day)
            resource_profiles.append(
                {
                    "resource_id": str(resource.id),
                    "resource_name": resource.name,
                    "resource_type": _enum_value(resource.type),
                    "availability_per_day": availability,
                    "allocated_by_day": allocated_by_day,
                    "peak_allocated": float(peak),
                    "peak_day": peak_day,
                    "peak_utilization_percent": round(
                        peak / availability * 100, 2
                    ),
                }
            )

        return {
            "event_id": str(event_id),
            "horizon_days": int(horizon),
            "resources": resource_profiles,
        }
