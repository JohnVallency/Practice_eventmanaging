"""Схемы Pydantic v2 для сущности Notification (уведомления события)."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, field_serializer

from models.enums import NotificationType


class NotificationResponse(BaseModel):
    """Схема ответа с данными уведомления."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    type: str
    message: str
    is_read: bool
    created_at: datetime | None = None

    @field_serializer("type")
    def serialize_type(self, value: Any) -> str:
        """Сериализовать str-enum типа уведомления в строковое значение."""
        return str(getattr(value, "value", value))
