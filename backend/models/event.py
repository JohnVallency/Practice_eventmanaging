"""ORM-модель события EventLMS."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Numeric, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base, uuid_pk
from models.enums import EventStatus


class Event(Base):
    """Событие — корневая сущность планирования с задачами и ресурсами."""

    __tablename__ = "events"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[EventStatus] = mapped_column(
        SAEnum(
            EventStatus,
            native_enum=True,
            name="event_status",
            validate_strings=True,
            # Метки ENUM в БД = значения ("draft"), а не имена ("DRAFT"),
            # иначе server_default='draft' невалиден для типа event_status.
            values_callable=lambda obj: [e.value for e in obj],
        ),
        default=EventStatus.DRAFT,
        server_default=EventStatus.DRAFT.value,
        nullable=False,
    )
    total_budget: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0"),
        server_default=text("0"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tasks = relationship(
        "Task",
        back_populates="event",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    resources = relationship(
        "Resource",
        back_populates="event",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
