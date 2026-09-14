"""Сервисный слой для сущности Event.

Схема транзакций: все методы выполняются внутри сессии, полученной через
зависимость ``get_session`` (см. ``core/database.py``). Commit делает сам
``get_session`` после успешного ответа роута; сервисы используют
``await session.flush()``, чтобы INSERT улетел в БД и серверные дефолты
(gen_random_uuid(), created_at) материализовались. ``async with
session.begin()`` применяется только при создании standalone-сессий
напрямую из ``async_session_factory`` — для FastAPI-роутов он не нужен.
"""

from collections.abc import Sequence
from typing import Any
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.exceptions import ResourceNotFound
from models import Event
from schemas import EventCreate, EventUpdate

# Жёсткий верхний предел страницы списка.
MAX_LIMIT: int = 100
# Значение по умолчанию, когда клиент не передал limit.
DEFAULT_LIMIT: int = 50


class EventService:
    """CRUD-операции над событиями."""

    @staticmethod
    async def create(session: AsyncSession, data: EventCreate) -> Event:
        """Создать событие.

        Args:
            session: активная сессия SQLAlchemy.
            data: валидированные данные создания.

        Returns:
            Event: сохранённое событие с заполненными серверными полями.
        """
        event = Event(
            name=data.name,
            start_date=data.start_date,
            end_date=data.end_date,
            status=data.status,
            total_budget=data.total_budget,
        )
        session.add(event)
        await session.flush()
        await session.refresh(event)
        return event

    @staticmethod
    async def get(session: AsyncSession, event_id: uuid.UUID) -> Event | None:
        """Получить событие по идентификатору.

        Args:
            session: активная сессия SQLAlchemy.
            event_id: UUID события.

        Returns:
            Event | None: событие или None, если не найдено.
        """
        return await session.get(Event, event_id)

    @staticmethod
    async def get_or_404(session: AsyncSession, event_id: uuid.UUID) -> Event:
        """Получить событие или бросить ResourceNotFound.

        Args:
            session: активная сессия SQLAlchemy.
            event_id: UUID события.

        Returns:
            Event: найденное событие.

        Raises:
            ResourceNotFound: если события с таким UUID нет.
        """
        event = await EventService.get(session, event_id)
        if event is None:
            raise ResourceNotFound("Событие не найдено")
        return event

    @staticmethod
    async def list(
        session: AsyncSession,
        skip: int = 0,
        limit: int = DEFAULT_LIMIT,
    ) -> Sequence[Event]:
        """Получить список событий с пагинацией.

        Args:
            session: активная сессия SQLAlchemy.
            skip: количество пропускаемых записей, не меньше 0.
            limit: размер страницы (обрезается до 100).

        Returns:
            Sequence[Event]: страница списка событий.
        """
        safe_limit = min(limit, MAX_LIMIT)
        if skip < 0:
            skip = 0
        result = await session.execute(
            select(Event).order_by(Event.created_at).offset(skip).limit(safe_limit)
        )
        return result.scalars().all()

    @staticmethod
    async def update(
        session: AsyncSession, event_id: uuid.UUID, data: EventUpdate
    ) -> Event:
        """Частично обновить событие по переданным полям.

        Args:
            session: активная сессия SQLAlchemy.
            event_id: UUID события.
            data: схема частичного обновления.

        Returns:
            Event: обновлённое событие.

        Raises:
            ResourceNotFound: если события нет.
        """
        event = await EventService.get_or_404(session, event_id)
        payload: dict[str, Any] = data.model_dump(exclude_unset=True)
        for field, value in payload.items():
            setattr(event, field, value)
        await session.flush()
        await session.refresh(event)
        return event

    @staticmethod
    async def delete(session: AsyncSession, event_id: uuid.UUID) -> None:
        """Удалить событие вместе с зависимыми сущностями (каскад).

        Args:
            session: активная сессия SQLAlchemy.
            event_id: UUID события.

        Raises:
            ResourceNotFound: если события нет.
        """
        event = await EventService.get_or_404(session, event_id)
        await session.delete(event)
        await session.flush()

    @staticmethod
    async def list_with_tasks(session: AsyncSession, skip: int = 0, limit: int = DEFAULT_LIMIT) -> Sequence[Event]:
        """Получить события вместе с задачами (жадная загрузка selectinload).

        Используется selectinload вместо joinedload, чтобы не размножать
        строки события на каждую связанную задачу.
        """
        safe_limit = min(limit, MAX_LIMIT)
        if skip < 0:
            skip = 0
        result = await session.execute(
            select(Event)
            .options(selectinload(Event.tasks))
            .order_by(Event.created_at)
            .offset(skip)
            .limit(safe_limit)
        )
        return result.scalars().all()
