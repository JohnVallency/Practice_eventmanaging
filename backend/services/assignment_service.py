"""Сервисный слой для сущности Assignment.

Схема транзакций единая со всеми сервисами: методы работают внутри сессии
из зависимости ``get_session``; коммит выполняет сам ``get_session`` после
успешного ответа роута, сервисы делают ``await session.flush()`` для
отправки INSERT в БД и материализации серверных дефолтов. ``async with
session.begin()`` используется только для standalone-сессий из
``async_session_factory`` вне FastAPI-зависимости.
"""

from collections.abc import Sequence
from decimal import Decimal
from typing import Any
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import ConflictError, ResourceNotFound, ValidationError
from models import Assignment, Resource, Task
from schemas import AssignmentCreate, AssignmentUpdate

# Жёсткий верхний предел страницы списка.
MAX_LIMIT: int = 100
# Значение по умолчанию, когда клиент не передал limit.
DEFAULT_LIMIT: int = 50


class AssignmentService:
    """CRUD-операции над назначениями ресурсов на задачи."""

    @staticmethod
    async def _committed_load(
        session: AsyncSession,
        resource_id: uuid.UUID,
        exclude_assignment_id: uuid.UUID | None = None,
    ) -> Decimal:
        """Суммарная уже занятая нагрузка ресурса по всем назначениям.

        Args:
            session: активная сессия SQLAlchemy.
            resource_id: UUID ресурса.
            exclude_assignment_id: UUID назначения, исключаемого из суммы
                (само назначение при пересчёте после update).

        Returns:
            Decimal: сумма units_allocated по назначениям ресурса; 0, если их нет.
        """
        load_expr = func.coalesce(func.sum(Assignment.units_allocated), 0)
        stmt = select(load_expr).where(Assignment.resource_id == resource_id)
        if exclude_assignment_id is not None:
            stmt = stmt.where(Assignment.id != exclude_assignment_id)
        result = await session.execute(stmt)
        value = result.scalar_one()
        return Decimal(value)

    @staticmethod
    async def create(session: AsyncSession, data: AssignmentCreate) -> Assignment:
        """Создать назначение ресурса на задачу с проверкой переаллокации.

        Args:
            session: активная сессия SQLAlchemy.
            data: валидированные данные создания.

        Returns:
            Assignment: сохранённое назначение.

        Raises:
            ResourceNotFound: если задача или ресурс не найдены.
            ValidationError: если ресурс привязан к другому событию.
            ConflictError: если суммарная нагрузка превысит availability_per_day.
        """
        task = await session.get(Task, data.task_id)
        if task is None:
            raise ResourceNotFound("Задача не найдена")
        resource = await session.get(Resource, data.resource_id)
        if resource is None:
            raise ResourceNotFound("Ресурс не найден")
        if resource.event_id != task.event_id:
            raise ValidationError("Ресурс привязан к другому событию")
        committed_load = await AssignmentService._committed_load(session, data.resource_id)
        if committed_load + data.units_allocated > resource.availability_per_day:
            raise ConflictError("Переаллокация ресурса")
        assignment = Assignment(
            task_id=data.task_id,
            resource_id=data.resource_id,
            units_allocated=data.units_allocated,
        )
        session.add(assignment)
        await session.flush()
        await session.refresh(assignment)
        return assignment

    @staticmethod
    async def get(session: AsyncSession, assignment_id: uuid.UUID) -> Assignment | None:
        """Получить назначение по идентификатору.

        Args:
            session: активная сессия SQLAlchemy.
            assignment_id: UUID назначения.

        Returns:
            Assignment | None: назначение или None, если не найдено.
        """
        return await session.get(Assignment, assignment_id)

    @staticmethod
    async def get_or_404(session: AsyncSession, assignment_id: uuid.UUID) -> Assignment:
        """Получить назначение или бросить ResourceNotFound.

        Args:
            session: активная сессия SQLAlchemy.
            assignment_id: UUID назначения.

        Returns:
            Assignment: найденное назначение.

        Raises:
            ResourceNotFound: если назначения с таким UUID нет.
        """
        assignment = await AssignmentService.get(session, assignment_id)
        if assignment is None:
            raise ResourceNotFound("Назначение не найдено")
        return assignment

    @staticmethod
    async def list(
        session: AsyncSession,
        task_id: uuid.UUID | None = None,
        resource_id: uuid.UUID | None = None,
        skip: int = 0,
        limit: int = DEFAULT_LIMIT,
    ) -> Sequence[Assignment]:
        """Получить список назначений с фильтрами по задаче и ресурсу.

        Args:
            session: активная сессия SQLAlchemy.
            task_id: фильтр по задаче; None — без фильтра.
            resource_id: фильтр по ресурсу; None — без фильтра.
            skip: количество пропускаемых записей, не меньше 0.
            limit: размер страницы (обрезается до 100).

        Returns:
            Sequence[Assignment]: страница списка назначений.
        """
        safe_limit = min(limit, MAX_LIMIT)
        if skip < 0:
            skip = 0
        stmt = select(Assignment).order_by(Assignment.created_at)
        if task_id is not None:
            stmt = stmt.where(Assignment.task_id == task_id)
        if resource_id is not None:
            stmt = stmt.where(Assignment.resource_id == resource_id)
        result = await session.execute(stmt.offset(skip).limit(safe_limit))
        return result.scalars().all()

    @staticmethod
    async def update(
        session: AsyncSession,
        assignment_id: uuid.UUID,
        data: AssignmentUpdate,
    ) -> Assignment:
        """Частично обновить назначение с пересчётом переаллокации.

        При изменении units_allocated текущее назначение исключается из
        суммы уже занятой нагрузки, затем проверяется новая суммарная
        нагрузка относительно availability_per_day ресурса.

        Args:
            session: активная сессия SQLAlchemy.
            assignment_id: UUID назначения.
            data: схема частичного обновления.

        Returns:
            Assignment: обновлённое назначение.

        Raises:
            ResourceNotFound: если назначение или ресурс не найдены.
            ConflictError: если новая суммарная нагрузка превысит лимит.
        """
        assignment = await AssignmentService.get_or_404(session, assignment_id)
        payload: dict[str, Any] = data.model_dump(exclude_unset=True)
        if "units_allocated" in payload:
            resource = await session.get(Resource, assignment.resource_id)
            if resource is None:
                raise ResourceNotFound("Ресурс не найден")
            committed_load = await AssignmentService._committed_load(
                session, assignment.resource_id, exclude_assignment_id=assignment.id
            )
            new_units = payload["units_allocated"]
            if committed_load + new_units > resource.availability_per_day:
                raise ConflictError("Переаллокация ресурса")
        for field, value in payload.items():
            setattr(assignment, field, value)
        await session.flush()
        await session.refresh(assignment)
        return assignment

    @staticmethod
    async def delete(session: AsyncSession, assignment_id: uuid.UUID) -> None:
        """Удалить назначение ресурса с задачи.

        Args:
            session: активная сессия SQLAlchemy.
            assignment_id: UUID назначения.

        Raises:
            ResourceNotFound: если назначения нет.
        """
        assignment = await AssignmentService.get_or_404(session, assignment_id)
        await session.delete(assignment)
        await session.flush()
