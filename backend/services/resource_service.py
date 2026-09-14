"""Сервисный слой для сущности Resource.

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
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import ResourceNotFound
from models import Event, Resource
from schemas import ResourceCreate, ResourceUpdate

# Жёсткий верхний предел страницы списка.
MAX_LIMIT: int = 100
# Значение по умолчанию, когда клиент не передал limit.
DEFAULT_LIMIT: int = 50


class ResourceService:
    """CRUD-операции над ресурсами события."""

    @staticmethod
    async def create(session: AsyncSession, data: ResourceCreate) -> Resource:
        """Создать ресурс в существующем событии.

        Args:
            session: активная сессия SQLAlchemy.
            data: валидированные данные создания.

        Returns:
            Resource: сохранённый ресурс с заполненными серверными полями.

        Raises:
            ResourceNotFound: если событие-родитель не найдено.
        """
        event = await session.get(Event, data.event_id)
        if event is None:
            raise ResourceNotFound("Событие не найдено")
        resource = Resource(
            event_id=data.event_id,
            name=data.name,
            type=data.type,
            availability_per_day=data.availability_per_day,
            cost_per_day=data.cost_per_day,
        )
        session.add(resource)
        await session.flush()
        await session.refresh(resource)
        return resource

    @staticmethod
    async def get(session: AsyncSession, resource_id: uuid.UUID) -> Resource | None:
        """Получить ресурс по идентификатору.

        Args:
            session: активная сессия SQLAlchemy.
            resource_id: UUID ресурса.

        Returns:
            Resource | None: ресурс или None, если не найден.
        """
        return await session.get(Resource, resource_id)

    @staticmethod
    async def get_or_404(session: AsyncSession, resource_id: uuid.UUID) -> Resource:
        """Получить ресурс или бросить ResourceNotFound.

        Args:
            session: активная сессия SQLAlchemy.
            resource_id: UUID ресурса.

        Returns:
            Resource: найденный ресурс.

        Raises:
            ResourceNotFound: если ресурса с таким UUID нет.
        """
        resource = await ResourceService.get(session, resource_id)
        if resource is None:
            raise ResourceNotFound("Ресурс не найден")
        return resource

    @staticmethod
    async def list(
        session: AsyncSession,
        event_id: uuid.UUID | None = None,
        skip: int = 0,
        limit: int = DEFAULT_LIMIT,
    ) -> Sequence[Resource]:
        """Получить список ресурсов с опциональным фильтром по событию.

        Args:
            session: активная сессия SQLAlchemy.
            event_id: фильтр по событию; None — все ресурсы.
            skip: количество пропускаемых записей, не меньше 0.
            limit: размер страницы (обрезается до 100).

        Returns:
            Sequence[Resource]: страница списка ресурсов.
        """
        safe_limit = min(limit, MAX_LIMIT)
        if skip < 0:
            skip = 0
        stmt = select(Resource).order_by(Resource.created_at)
        if event_id is not None:
            stmt = stmt.where(Resource.event_id == event_id)
        result = await session.execute(stmt.offset(skip).limit(safe_limit))
        return result.scalars().all()

    @staticmethod
    async def update(
        session: AsyncSession, resource_id: uuid.UUID, data: ResourceUpdate
    ) -> Resource:
        """Частично обновить ресурс по переданным полям.

        Args:
            session: активная сессия SQLAlchemy.
            resource_id: UUID ресурса.
            data: схема частичного обновления.

        Returns:
            Resource: обновлённый ресурс.

        Raises:
            ResourceNotFound: если ресурса нет.
        """
        resource = await ResourceService.get_or_404(session, resource_id)
        payload: dict[str, Any] = data.model_dump(exclude_unset=True)
        for field, value in payload.items():
            setattr(resource, field, value)
        await session.flush()
        await session.refresh(resource)
        return resource

    @staticmethod
    async def delete(session: AsyncSession, resource_id: uuid.UUID) -> None:
        """Удалить ресурс (назначения удаляются каскадом).

        Args:
            session: активная сессия SQLAlchemy.
            resource_id: UUID ресурса.

        Raises:
            ResourceNotFound: если ресурса нет.
        """
        resource = await ResourceService.get_or_404(session, resource_id)
        await session.delete(resource)
        await session.flush()
