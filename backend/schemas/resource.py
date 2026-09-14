"""Схемы Pydantic v2 для сущности Resource."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from models.enums import ResourceType


class ResourceCreate(BaseModel):
    """Схема создания ресурса."""

    event_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    type: ResourceType
    availability_per_day: Decimal = Field(gt=0)
    cost_per_day: Decimal = Field(ge=0)


class ResourceUpdate(BaseModel):
    """Схема частичного обновления ресурса."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: ResourceType | None = None
    availability_per_day: Decimal | None = Field(default=None, gt=0)
    cost_per_day: Decimal | None = Field(default=None, ge=0)


class ResourceResponse(BaseModel):
    """Схема ответа с данными ресурса."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    type: ResourceType
    availability_per_day: Decimal
    cost_per_day: Decimal
    created_at: datetime
