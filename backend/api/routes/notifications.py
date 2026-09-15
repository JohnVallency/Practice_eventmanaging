"""Роутер уведомлений события (prefix /api/events).

Роут тонкий: валидацию выполняет Pydantic, бизнес-логику — NotificationService,
доменные ошибки (404 событие) перехватываются глобальными обработчиками в main.py.
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from schemas.notification import NotificationResponse
from services.notification_service import NotificationService

router = APIRouter(prefix="/api/events", tags=["notifications"])


@router.get(
    "/{event_id}/notifications",
    response_model=list[NotificationResponse],
    summary="Список уведомлений события",
)
async def list_notifications(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[NotificationResponse]:
    """Получить все уведомления события.

    Args:
        event_id: UUID события.
        session: сессия БД из зависимости FastAPI.

    Returns:
        list[NotificationResponse]: список уведомлений события, иначе 404.
    """
    notifications = await NotificationService.list_notifications(session, event_id)
    return [NotificationResponse.model_validate(notification) for notification in notifications]
