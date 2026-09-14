"""Схемы Pydantic v2 для сущности Assignment."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class AssignmentCreate(BaseModel):
    """Схема создания назначения ресурса на задачу."""

    task_id: uuid.UUID
    resource_id: uuid.UUID
    units_allocated: Decimal = Field(gt=0)


class AssignmentUpdate(BaseModel):
    """Схема частичного обновления назначения."""

    units_allocated: Decimal | None = Field(default=None, gt=0)


class AssignmentResponse(BaseModel):
    """Схема ответа с данными назначения."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_id: uuid.UUID
    resource_id: uuid.UUID
    units_allocated: Decimal
    created_at: datetime
