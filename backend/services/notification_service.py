"""Сервисный слой для сущности Notification (уведомления события).

Схема транзакций единая со всеми сервисами: методы работают внутри сессии
из зависимости ``get_session``; коммит выполняет сам ``get_session`` после
успешного ответа роута, сервис делает ``await session.flush()`` и никогда
не коммитит сам — уведомления могут создаваться внутри активной сессии
запроса (например, из хука в schedule_service).
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Event, Notification
from models.enums import NotificationType
from services.event_service import EventService


class NotificationService:
    """Операции над уведомлениями события."""

    @staticmethod
    async def create_notification(
        session: AsyncSession,
        event_id: uuid.UUID,
        notification_type: NotificationType,
        message: str,
    ) -> Notification:
        """Создать уведомление события (без commit — внутри активной сессии).

        Args:
            session: активная сессия SQLAlchemy.
            event_id: UUID события-родителя.
            notification_type: тип уведомления (str-enum NotificationType).
            message: текст уведомления.

        Returns:
            Notification: сохранённое уведомление с заполненными
            серверными полями.
        """
        notification = Notification(
            event_id=event_id,
            type=notification_type,
            message=message,
            is_read=False,
        )
        session.add(notification)
        await session.flush()
        await session.refresh(notification)
        return notification

    @staticmethod
    async def list_notifications(
        session: AsyncSession, event_id: uuid.UUID
    ) -> list[Notification]:
        """Получить уведомления события (новые первыми).

        Args:
            session: активная сессия SQLAlchemy.
            event_id: UUID события.

        Returns:
            list[Notification]: уведомления события; сортировка по
            created_at DESC, затем id DESC (при отсутствии created_at
            в модели порядок фактически определяет id DESC).

        Raises:
            ResourceNotFound: если событие не найдено.
        """
        await EventService.get_or_404(session, event_id)
        result = await session.execute(
            select(Notification)
            .where(Notification.event_id == event_id)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
        )
        return list(result.scalars().all())
