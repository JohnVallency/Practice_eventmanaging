"""ORM-модель уведомления EventLMS."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base, uuid_pk
from models.enums import NotificationType


class Notification(Base):
    """Уведомление по событию: тип, текст и статус прочтения."""

    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = uuid_pk()
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True, nullable=False
    )
    event = relationship("Event")
    type: Mapped[NotificationType] = mapped_column(
        SAEnum(
            NotificationType,
            native_enum=True,
            name="notificationtype",
            validate_strings=True,
            # Метки ENUM в БД = значения ("task_overdue"), а не имена ("TASK_OVERDUE").
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
