"""ORM-модель задачи EventLMS (узел сетевого графика для расчёта CPM)."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base, uuid_pk


class Task(Base):
    """Задача события: длительность, ранние/поздние даты и запасы CPM."""

    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = uuid_pk()
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True, nullable=False
    )
    event = relationship("Event", back_populates="tasks")
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    # Поля ниже заполняет расчёт критического пути (CPM)
    earliest_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    earliest_finish: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latest_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latest_finish: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_float: Mapped[int | None] = mapped_column(Integer, nullable=True)
    free_float: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_critical: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    dependencies = relationship(
        "TaskDependency",
        foreign_keys="TaskDependency.successor_id",
        back_populates="successor",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    dependents = relationship(
        "TaskDependency",
        foreign_keys="TaskDependency.predecessor_id",
        back_populates="predecessor",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    assignments = relationship(
        "Assignment",
        back_populates="task",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
