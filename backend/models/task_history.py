import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base, uuid_pk


class TaskHistory(Base):
    __tablename__ = "task_history"
    id: Mapped[uuid.UUID] = uuid_pk()
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    from_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    to_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    author: Mapped[str] = mapped_column(String(120), nullable=False, server_default="Анна")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    task = relationship("Task", back_populates="history")