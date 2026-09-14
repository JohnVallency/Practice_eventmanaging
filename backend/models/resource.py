"""ORM-модель ресурса EventLMS."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base, uuid_pk
from models.enums import ResourceType


class Resource(Base):
    """Ресурс события: человек, оборудование или площадка."""

    __tablename__ = "resources"

    id: Mapped[uuid.UUID] = uuid_pk()
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True, nullable=False
    )
    event = relationship("Event", back_populates="resources")
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[ResourceType] = mapped_column(
        SAEnum(
            ResourceType,
            native_enum=True,
            name="resource_type",
            validate_strings=True,
            # Метки ENUM в БД = значения ("human"), а не имена ("HUMAN").
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
    )
    availability_per_day: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    cost_per_day: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    assignments = relationship(
        "Assignment",
        back_populates="resource",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
