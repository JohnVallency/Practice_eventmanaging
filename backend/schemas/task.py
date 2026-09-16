"""Схемы Pydantic v2 для сущности Task."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class TaskCreate(BaseModel):
    """Схема создания задачи."""

    event_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=2000)
    duration_days: int = Field(gt=0)
    archived: bool = False
    status: str = Field(default="todo", pattern="^(todo|in_progress|done|cancelled)$")
    priority: str = Field(default="medium", pattern="^(high|medium|low)$")
    due_date: date | None = None
    assignee: str | None = Field(default=None, max_length=120)
    category: str | None = Field(default=None, max_length=60)
    parent_id: uuid.UUID | None = None
    tags: list[str] = Field(default_factory=list, max_length=12)


class TaskUpdate(BaseModel):
    """Схема частичного обновления задачи."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    duration_days: int | None = Field(default=None, gt=0)
    archived: bool | None = None
    status: str | None = Field(default=None, pattern="^(todo|in_progress|done|cancelled)$")
    priority: str | None = Field(default=None, pattern="^(high|medium|low)$")
    due_date: date | None = None
    assignee: str | None = Field(default=None, max_length=120)
    category: str | None = Field(default=None, max_length=60)
    parent_id: uuid.UUID | None = None
    tags: list[str] | None = Field(default=None, max_length=12)


class TaskResponse(BaseModel):
    """Схема ответа с данными задачи."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    description: str
    duration_days: int
    archived: bool
    status: str
    priority: str
    due_date: date | None
    assignee: str | None
    category: str | None
    parent_id: uuid.UUID | None
    tags: list[str]
    earliest_start: int | None
    earliest_finish: int | None
    latest_start: int | None
    latest_finish: int | None
    total_float: int | None
    free_float: int | None
    actual_start: int | None = None
    actual_finish: int | None = None
    is_critical: bool
    created_at: datetime
