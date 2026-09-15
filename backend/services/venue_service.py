"""Сервисный слой для сущности Venue (площадки события).

Схема транзакций единая со всеми сервисами: методы работают внутри сессии
из зависимости ``get_session``; коммит выполняет сам ``get_session`` после
успешного ответа роута, сервис делает ``await session.flush()``.
"""

import uuid
from statistics import mean

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Event, Venue
from schemas.venue import VenueCreate
from services.event_service import EventService


class VenueService:
    """Операции над площадками и картой события."""

    @staticmethod
    async def create_venue(
        session: AsyncSession, event_id: uuid.UUID, data: VenueCreate
    ) -> Venue:
        """Создать площадку в существующем событии.

        Args:
            session: активная сессия SQLAlchemy.
            event_id: UUID события-родителя.
            data: валидированные данные создания площадки.

        Returns:
            Venue: сохранённая площадка с заполненными серверными полями.

        Raises:
            ResourceNotFound: если событие-родитель не найдено.
        """
        await EventService.get_or_404(session, event_id)
        venue = Venue(**data.model_dump(), event_id=event_id)
        session.add(venue)
        await session.flush()
        await session.refresh(venue)
        return venue

    @staticmethod
    async def list_venues(
        session: AsyncSession, event_id: uuid.UUID
    ) -> list[Venue]:
        """Получить все площадки события, отсортированные по имени и id.

        Args:
            session: активная сессия SQLAlchemy.
            event_id: UUID события.

        Returns:
            list[Venue]: площадки события.

        Raises:
            ResourceNotFound: если событие не найдено.
        """
        await EventService.get_or_404(session, event_id)
        result = await session.execute(
            select(Venue)
            .where(Venue.event_id == event_id)
            .order_by(Venue.name, Venue.id)
        )
        return list(result.scalars().all())

    @staticmethod
    async def build_map(
        session: AsyncSession, event_id: uuid.UUID
    ) -> dict[str, object]:
        """Построить данные карты площадок события.

        Args:
            session: активная сессия SQLAlchemy.
            event_id: UUID события.

        Returns:
            dict: {"event_id": UUID, "venues": list[Venue],
            "center": {"latitude": float, "longitude": float} | None}.
            center — среднее арифметическое координат (округление до 6
            знаков); None, если у события нет площадок.

        Raises:
            ResourceNotFound: если событие не найдено.
        """
        await EventService.get_or_404(session, event_id)
        venues = await VenueService.list_venues(session, event_id)
        if not venues:
            return {"event_id": event_id, "venues": [], "center": None}
        center: dict[str, float] = {
            "latitude": round(
                mean(float(venue.latitude) for venue in venues), 6
            ),
            "longitude": round(
                mean(float(venue.longitude) for venue in venues), 6
            ),
        }
        return {
            "event_id": event_id,
            "venues": venues,
            "center": center,
        }
