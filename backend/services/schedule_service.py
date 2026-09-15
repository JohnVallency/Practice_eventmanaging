"""Сервисный слой расчёта расписания события (прямой проход CPM).

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
from services.scheduling import CyclicDependencyError, calculate_forward_pass


class ScheduleService:
    """Расчёт ранних дат задач события методом критического пути."""

    @staticmethod
    async def calculate_event_schedule(
        session: AsyncSession, event_id: uuid.UUID
    ) -> dict[str, object]:
        """Рассчитать и сохранить ранние даты всех задач события.

        Шаги:
        1. Проверить, что событие существует (404 обеспечивает
           :meth:`EventService.get_or_404`).
        2. Загрузить задачи события; пустой набор -> ValidationError.
        3. Загрузить связи, у которых ОБЕ задачи (предшественник и
           последователь) принадлежат этому событию.
        4. Выполнить прямой проход CPM (топологическая сортировка + расчёт
           ES/EF); цикл зависимостей -> ValidationError("Cycle detected").
        5. Bulk-обновить поля ``earliest_start``/``earliest_finish`` одним
           ORM-UPDATE и отправить изменения через ``session.flush()``.

        Args:
            session: активная сессия SQLAlchemy.
            event_id: UUID события.

        Returns:
            dict: {"event_id": str, "calculated": int,
            "schedule": {task_id: {"earliest_start": int,
            "earliest_finish": int}}}.

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

        # 5. Bulk-обновление ранних дат одним ORM-UPDATE по набору параметров.
        payload = [
            {
                "id": tid,
                "earliest_start": values["earliest_start"],
                "earliest_finish": values["earliest_finish"],
            }
            for tid, values in forward.items()
        ]
        if payload:
            await session.execute(sa_update(Task), payload)
        await session.flush()

        return {
            "event_id": str(event_id),
            "calculated": len(tasks),
            "schedule": {
                str(tid): {
                    "earliest_start": values["earliest_start"],
                    "earliest_finish": values["earliest_finish"],
                }
                for tid, values in forward.items()
            },
        }
