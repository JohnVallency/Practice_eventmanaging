"""ORM-модель назначения ресурса на задачу EventLMS."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base, uuid_pk


class Assignment(Base):
    """Назначение ресурса на задачу с долей загрузки (units) в день."""

    __tablename__ = "assignments"

    id: Mapped[uuid.UUID] = uuid_pk()
    task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), index=True, nullable=False
    )
    resource_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("resources.id", ondelete="CASCADE"), index=True, nullable=False
    )
    units_allocated: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    task = relationship("Task", back_populates="assignments")
    resource = relationship("Resource", back_populates="assignments")

    __table_args__ = (
        CheckConstraint("units_allocated > 0", name="ck_assignments_units_positive"),
    )
