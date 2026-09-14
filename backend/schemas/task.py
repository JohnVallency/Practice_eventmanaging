"""Схемы Pydantic v2 для сущности Task."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TaskCreate(BaseModel):
    """Схема создания задачи."""

    event_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    duration_days: int = Field(gt=0)


class TaskUpdate(BaseModel):
    """Схема частичного обновления задачи."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    duration_days: int | None = Field(default=None, gt=0)


class TaskResponse(BaseModel):
    """Схема ответа с данными задачи."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    duration_days: int
    earliest_start: int | None
    earliest_finish: int | None
    latest_start: int | None
    latest_finish: int | None
    total_float: int | None
    free_float: int | None
    is_critical: bool
    created_at: datetime
