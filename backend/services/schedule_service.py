"""Сервисный слой расчёта расписания события (полный CPM).

Схема транзакций единая со всеми сервисами: методы работают внутри сессии
из зависимости ``get_session``; коммит выполняет сам ``get_session`` после
успешного ответа роута, сервис делает ``await session.flush()``.

Чистая математика вынесена в ``services.scheduling`` (только stdlib);
этот модуль отвечает за загрузку данных, bulk-обновление ORM-полей и
преобразование доменных ошибок.
"""

import uuid

from sqlalchemy import select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from core.exceptions import ValidationError
from models import Task, TaskDependency
from services.event_service import EventService
from services.scheduling import (
    CyclicDependencyError,
    calculate_backward_pass,
    calculate_floats,
    calculate_forward_pass,
    identify_critical_path,
)


class ScheduleService:
    """Расчёт расписания задач события методом критического пути (CPM)."""

    @staticmethod
    async def calculate_event_schedule(
        session: AsyncSession, event_id: uuid.UUID
    ) -> dict[str, object]:
        """Рассчитать и сохранить полный CPM-результат всех задач события.

        Шаги:
        1. Проверить, что событие существует (404 обеспечивает
           :meth:`EventService.get_or_404`).
        2. Загрузить задачи события; пустой набор -> ValidationError.
        3. Загрузить связи, у которых ОБЕ задачи (предшественник и
           последователь) принадлежат этому событию.
        4. Выполнить прямой проход CPM (топологическая сортировка + расчёт
           ES/EF); цикл зависимостей -> ValidationError("Cycle detected").
        5. Определить длительность проекта как максимум EF, выполнить
           обратный проход (LS/LF), рассчитать резервы (total/free float)
           и критический путь.
        6. Bulk-обновить поля дат и резервов одним ORM-UPDATE и отправить
           изменения через ``session.flush()``.

        Args:
            session: активная сессия SQLAlchemy.
            event_id: UUID события.

        Returns:
            dict: {"event_id": str, "calculated": int, "schedule": {task_id:
            {"earliest_start", "earliest_finish", "latest_start",
            "latest_finish", "total_float", "free_float", "is_critical"}},
            "critical_path": [task_id в топологическом порядке],
            "project_duration": int}.

        Raises:
            ResourceNotFound: если события с таким UUID нет.
            ValidationError: если у события нет задач либо граф зависимостей
                содержит цикл (сообщение "Cycle detected").
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

        # 4. Прямой проход CPM на чистом ядре; цикл -> доменная ошибка 400.
        try:
            forward = calculate_forward_pass(tasks, dependencies)
        except CyclicDependencyError as exc:
            raise ValidationError("Cycle detected") from exc

        # 5. Обратный проход, резервы и критический путь.
        # Длительность проекта — максимум EF (задачи гарантированно не пусты).
        project_duration = max(
            values["earliest_finish"] for values in forward.values()
        )
        backward = calculate_backward_pass(tasks, dependencies, project_duration)
        floats = calculate_floats(tasks, dependencies, forward, backward)
        total_floats = {
            tid: values["total_float"] for tid, values in floats.items()
        }
        critical_path: list[uuid.UUID] = identify_critical_path(
            tasks, total_floats
        )
        critical_ids: set[uuid.UUID] = set(critical_path)

        # 6. Bulk-обновление дат и резервов одним ORM-UPDATE по набору параметров.
        payload = [
            {
                "id": tid,
                "earliest_start": forward[tid]["earliest_start"],
                "earliest_finish": forward[tid]["earliest_finish"],
                "latest_start": backward[tid]["latest_start"],
                "latest_finish": backward[tid]["latest_finish"],
                "total_float": floats[tid]["total_float"],
                "free_float": floats[tid]["free_float"],
                "is_critical": tid in critical_ids,
            }
            for tid in forward
        ]
        if payload:
            await session.execute(sa_update(Task), payload)
        await session.flush()

        return {
            "event_id": str(event_id),
            "calculated": len(tasks),
            "schedule": {
                str(tid): {
                    "earliest_start": forward[tid]["earliest_start"],
                    "earliest_finish": forward[tid]["earliest_finish"],
                    "latest_start": backward[tid]["latest_start"],
                    "latest_finish": backward[tid]["latest_finish"],
                    "total_float": floats[tid]["total_float"],
                    "free_float": floats[tid]["free_float"],
                    "is_critical": tid in critical_ids,
                }
                for tid in forward
            },
            "critical_path": [str(tid) for tid in critical_path],
            "project_duration": int(project_duration),
        }
