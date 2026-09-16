"""ORM-модель задачи EventLMS (узел сетевого графика для расчёта CPM)."""

import uuid
from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, func, text
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
    description: Mapped[str] = mapped_column(String(2000), nullable=False, server_default="")
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="todo", server_default=text("'todo'")
    )
    priority: Mapped[str] = mapped_column(
        String(16), nullable=False, default="medium", server_default=text("'medium'")
    )
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    assignee: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Категория задачи (например, «Музыка», «Логистика») — полоса на графе плана.
    category: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, server_default=text("'[]'::json"))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Поля ниже заполняет расчёт критического пути (CPM)
    earliest_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    earliest_finish: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latest_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latest_finish: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Фактические даты после ресурсного планирования (RCPSP),
    # в отличие от ранних/поздних дат CPM.
    actual_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actual_finish: Mapped[int | None] = mapped_column(Integer, nullable=True)
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
    parent = relationship("Task", remote_side=[id], back_populates="subtasks")
    subtasks = relationship(
        "Task", back_populates="parent", cascade="all, delete-orphan", passive_deletes=True
    )
    comments = relationship("TaskComment", back_populates="task", cascade="all, delete-orphan", passive_deletes=True)
    history = relationship("TaskHistory", back_populates="task", cascade="all, delete-orphan", passive_deletes=True)
    assignments = relationship(
        "Assignment",
        back_populates="task",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
