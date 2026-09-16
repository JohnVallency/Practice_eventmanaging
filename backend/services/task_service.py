"""Сервисный слой для сущностей Task и TaskDependency.

Схема транзакций единая со всеми сервисами: методы работают внутри сессии
из зависимости ``get_session``; коммит выполняет сам ``get_session`` после
успешного ответа роута, сервисы делают ``await session.flush()`` для
отправки INSERT в БД и материализации серверных дефолтов. ``async with
session.begin()`` используется только для standalone-сессий из
``async_session_factory`` вне FastAPI-зависимости.
"""

from collections.abc import Sequence
from typing import Any
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from core.exceptions import ConflictError, ResourceNotFound, ValidationError
from models import Event, Task, TaskComment, TaskDependency, TaskHistory
from schemas import TaskCreate, TaskDependencyCreate, TaskUpdate

# Жёсткий верхний предел страницы списка.
MAX_LIMIT: int = 100
# Значение по умолчанию, когда клиент не передал limit.
DEFAULT_LIMIT: int = 50


class TaskService:
    """CRUD-операции над задачами и их связями (зависимостями)."""

    @staticmethod
    async def create(session: AsyncSession, data: TaskCreate) -> Task:
        """Создать задачу в существующем событии.

        Args:
            session: активная сессия SQLAlchemy.
            data: валидированные данные создания.

        Returns:
            Task: сохранённая задача с заполненными серверными полями.

        Raises:
            ResourceNotFound: если событие-родитель не найдено.
        """
        event = await session.get(Event, data.event_id)
        if event is None:
            raise ResourceNotFound("Событие не найдено")
        if data.parent_id is not None:
            parent = await session.get(Task, data.parent_id)
            if parent is None or parent.event_id != data.event_id:
                raise ValidationError("Родительская задача должна принадлежать этому событию")
        task = Task(
            event_id=data.event_id,
            name=data.name,
            description=data.description,
            duration_days=data.duration_days,
            archived=data.archived,
            status=data.status,
            priority=data.priority,
            due_date=data.due_date,
            assignee=data.assignee,
            category=data.category,
            parent_id=data.parent_id,
            tags=data.tags,
        )
        session.add(task)
        await session.flush()
        await session.refresh(task)
        return task

    @staticmethod
    async def get(session: AsyncSession, task_id: uuid.UUID) -> Task | None:
        """Получить задачу по идентификатору.

        Args:
            session: активная сессия SQLAlchemy.
            task_id: UUID задачи.

        Returns:
            Task | None: задача или None, если не найдена.
        """
        return await session.get(Task, task_id)

    @staticmethod
    async def get_or_404(session: AsyncSession, task_id: uuid.UUID) -> Task:
        """Получить задачу или бросить ResourceNotFound.

        Args:
            session: активная сессия SQLAlchemy.
            task_id: UUID задачи.

        Returns:
            Task: найденная задача.

        Raises:
            ResourceNotFound: если задачи с таким UUID нет.
        """
        task = await TaskService.get(session, task_id)
        if task is None:
            raise ResourceNotFound("Задача не найдена")
        return task

    @staticmethod
    async def list(
        session: AsyncSession,
        event_id: uuid.UUID | None = None,
        skip: int = 0,
        limit: int = DEFAULT_LIMIT,
        status: str | None = None,
        priority: str | None = None,
        assignee: str | None = None,
    ) -> Sequence[Task]:
        """Получить список задач с опциональным фильтром по событию.

        Args:
            session: активная сессия SQLAlchemy.
            event_id: фильтр по событию; None — все задачи.
            skip: количество пропускаемых записей, не меньше 0.
            limit: размер страницы (обрезается до 100).

        Returns:
            Sequence[Task]: страница списка задач.
        """
        safe_limit = min(limit, MAX_LIMIT)
        if skip < 0:
            skip = 0
        stmt = select(Task).order_by(Task.created_at)
        if event_id is not None:
            stmt = stmt.where(Task.event_id == event_id)
        if status is not None:
            stmt = stmt.where(Task.status == status)
        if priority is not None:
            stmt = stmt.where(Task.priority == priority)
        if assignee is not None:
            stmt = stmt.where(Task.assignee == assignee)
        result = await session.execute(stmt.offset(skip).limit(safe_limit))
        return result.scalars().all()

    @staticmethod
    async def update(
        session: AsyncSession, task_id: uuid.UUID, data: TaskUpdate
    ) -> Task:
        """Частично обновить задачу по переданным полям.

        Args:
            session: активная сессия SQLAlchemy.
            task_id: UUID задачи.
            data: схема частичного обновления.

        Returns:
            Task: обновлённая задача.

        Raises:
            ResourceNotFound: если задачи нет.
        """
        task = await TaskService.get_or_404(session, task_id)
        payload: dict[str, Any] = data.model_dump(exclude_unset=True)
        for field, value in payload.items():
            if field == "parent_id" and value is not None:
                parent = await session.get(Task, value)
                if parent is None or parent.event_id != task.event_id or parent.id == task.id:
                    raise ValidationError("Родительская задача должна принадлежать этому событию")
            old_value = getattr(task, field)
            setattr(task, field, value)
            if old_value != value:
                session.add(TaskHistory(task_id=task.id, action=field, from_value=str(old_value) if old_value is not None else None, to_value=str(value) if value is not None else None))
        await session.flush()
        await session.refresh(task)
        return task

    @staticmethod
    async def comments(session: AsyncSession, task_id: uuid.UUID) -> Sequence[TaskComment]:
        await TaskService.get_or_404(session, task_id)
        result = await session.execute(select(TaskComment).where(TaskComment.task_id == task_id).order_by(TaskComment.created_at.desc()))
        return result.scalars().all()

    @staticmethod
    async def add_comment(session: AsyncSession, task_id: uuid.UUID, body: str, author: str) -> TaskComment:
        await TaskService.get_or_404(session, task_id)
        comment = TaskComment(task_id=task_id, body=body, author=author)
        session.add(comment)
        await session.flush()
        await session.refresh(comment)
        return comment

    @staticmethod
    async def history(session: AsyncSession, task_id: uuid.UUID) -> Sequence[TaskHistory]:
        await TaskService.get_or_404(session, task_id)
        result = await session.execute(select(TaskHistory).where(TaskHistory.task_id == task_id).order_by(TaskHistory.created_at.desc()))
        return result.scalars().all()

    @staticmethod
    async def delete(session: AsyncSession, task_id: uuid.UUID) -> None:
        """Удалить задачу (связи и назначения удаляются каскадом).

        Args:
            session: активная сессия SQLAlchemy.
            task_id: UUID задачи.

        Raises:
            ResourceNotFound: если задачи нет.
        """
        task = await TaskService.get_or_404(session, task_id)
        await session.delete(task)
        await session.flush()

    @staticmethod
    async def list_dependencies(
        session: AsyncSession, task_id: uuid.UUID
    ) -> Sequence[TaskDependency]:
        """Получить связи, где задача является последователем (successor).

        Предшественник и последователь загружаются joinedload одним запросом.

        Args:
            session: активная сессия SQLAlchemy.
            task_id: UUID задачи-последователя.

        Returns:
            Sequence[TaskDependency]: список входящих связей задачи.
        """
        stmt = (
            select(TaskDependency)
            .where(TaskDependency.successor_id == task_id)
            .options(
                joinedload(TaskDependency.predecessor),
                joinedload(TaskDependency.successor),
            )
            .order_by(TaskDependency.predecessor_id)
        )
        result = await session.execute(stmt)
        # unique() обязателен при joinedload связанных объектов.
        return result.unique().scalars().all()

    @staticmethod
    async def add_dependency(
        session: AsyncSession, task_id: uuid.UUID, data: TaskDependencyCreate
    ) -> TaskDependency:
        """Добавить связь предшественник -> последователь.

        Args:
            session: активная сессия SQLAlchemy.
            task_id: UUID задачи-последователя (из пути запроса).
            data: валидированные данные связи.

        Returns:
            TaskDependency: созданная связь.

        Raises:
            ValidationError: если successor_id из тела не совпал с путём.
            ResourceNotFound: если одна из задач не найдена.
            ConflictError: если такая пара задач уже связана.
        """
        if data.successor_id != task_id:
            raise ValidationError(
                "successor_id в теле запроса должен совпадать с задачей из пути"
            )
        task = await TaskService.get(session, task_id)
        if task is None:
            raise ResourceNotFound("Задача не найдена")
        predecessor = await TaskService.get(session, data.predecessor_id)
        if predecessor is None:
            raise ResourceNotFound("Задача-предшественник не найдена")
        if predecessor.event_id != task.event_id:
            raise ValidationError("Связь должна соединять задачи одного события")
        dependency = TaskDependency(
            predecessor_id=data.predecessor_id,
            successor_id=task_id,
            dependency_type=data.dependency_type,
            lag_days=data.lag_days,
        )
        session.add(dependency)
        try:
            await session.flush()
        except IntegrityError as exc:
            # Составной PK (predecessor_id, successor_id) защищает от дублей.
            raise ConflictError("Связь между задачами уже существует") from exc
        return dependency

    @staticmethod
    async def remove_dependency(
        session: AsyncSession, task_id: uuid.UUID, predecessor_id: uuid.UUID
    ) -> None:
        """Удалить связь между задачами.

        Args:
            session: активная сессия SQLAlchemy.
            task_id: UUID задачи-последователя.
            predecessor_id: UUID задачи-предшественника.

        Raises:
            ResourceNotFound: если связь не найдена.
        """
        dependency = await session.get(TaskDependency, (predecessor_id, task_id))
        if dependency is None:
            raise ResourceNotFound("Связь между задачами не найдена")
        await session.delete(dependency)
        await session.flush()
