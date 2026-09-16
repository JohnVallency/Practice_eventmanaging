import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TaskCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    author: str = Field(default="Анна", max_length=120)


class TaskCommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    task_id: uuid.UUID
    body: str
    author: str
    created_at: datetime


class TaskHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    task_id: uuid.UUID
    action: str
    from_value: str | None
    to_value: str | None
    author: str
    created_at: datetime