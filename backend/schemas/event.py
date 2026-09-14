"""Схемы Pydantic v2 для сущности Event."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from models.enums import EventStatus


class EventCreate(BaseModel):
    """Схема создания события."""

    name: str = Field(min_length=1, max_length=255)
    start_date: datetime
    end_date: datetime
    status: EventStatus = EventStatus.DRAFT
    total_budget: Decimal = Field(default=Decimal("0"), ge=0)

    @model_validator(mode="after")
    def validate_date_range(self) -> "EventCreate":
        """Проверить, что дата окончания позже даты начала."""
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


class EventUpdate(BaseModel):
    """Схема частичного обновления события."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    start_date: datetime | None = None
    end_date: datetime | None = None
    status: EventStatus | None = None
    total_budget: Decimal | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_date_range(self) -> "EventUpdate":
        """Проверить даты только если заданы обе."""
        if self.start_date is not None and self.end_date is not None:
            if self.end_date <= self.start_date:
                raise ValueError("end_date must be after start_date")
        return self


class EventResponse(BaseModel):
    """Схема ответа с данными события."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    start_date: datetime
    end_date: datetime
    status: EventStatus
    total_budget: Decimal
    created_at: datetime
    updated_at: datetime
