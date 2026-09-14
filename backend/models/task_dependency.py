"""ORM-модель связи между задачами EventLMS."""

import uuid

from sqlalchemy import CheckConstraint, Enum as SAEnum, ForeignKey, Integer, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base
from models.enums import DependencyType


class TaskDependency(Base):
    """Связь предшественник-последователь с типом и лагом в днях."""

    __tablename__ = "task_dependencies"

    predecessor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True
    )
    successor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True
    )
    dependency_type: Mapped[DependencyType] = mapped_column(
        SAEnum(DependencyType, native_enum=True, name="dependency_type", validate_strings=True),
        default=DependencyType.FS,
        server_default=DependencyType.FS.value,
        nullable=False,
    )
    lag_days: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0"), nullable=False
    )

    predecessor = relationship(
        "Task", foreign_keys=[predecessor_id], back_populates="dependents"
    )
    successor = relationship(
        "Task", foreign_keys=[successor_id], back_populates="dependencies"
    )

    __table_args__ = (
        CheckConstraint("predecessor_id != successor_id", name="ck_task_dependencies_no_self"),
    )
