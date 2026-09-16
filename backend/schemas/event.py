"""Схемы Pydantic v2 для сущности Event."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator

from models.enums import EventStatus


class EventCreate(BaseModel):
    """Схема создания события."""

    name: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=4000)
    start_date: datetime
    end_date: datetime
    timezone: str = Field(default="Europe/Moscow", max_length=64)
    venue_name: str | None = Field(default=None, max_length=255)
    venue_address: str | None = Field(default=None, max_length=500)
    venue_room: str | None = Field(default=None, max_length=160)
    online_url: HttpUrl | None = None
    organizer_name: str | None = Field(default=None, max_length=160)
    organizer_contact: str | None = Field(default=None, max_length=255)
    max_participants: int | None = Field(default=None, ge=1)
    color: str = Field(default="#E1A24A", pattern=r"^#[0-9A-Fa-f]{6}$")
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
    description: str | None = Field(default=None, max_length=4000)
    start_date: datetime | None = None
    end_date: datetime | None = None
    timezone: str | None = Field(default=None, max_length=64)
    venue_name: str | None = Field(default=None, max_length=255)
    venue_address: str | None = Field(default=None, max_length=500)
    venue_room: str | None = Field(default=None, max_length=160)
    online_url: HttpUrl | None = None
    organizer_name: str | None = Field(default=None, max_length=160)
    organizer_contact: str | None = Field(default=None, max_length=255)
    max_participants: int | None = Field(default=None, ge=1)
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
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
    description: str
    start_date: datetime
    end_date: datetime
    timezone: str
    venue_name: str | None
    venue_address: str | None
    venue_room: str | None
    online_url: HttpUrl | None
    organizer_name: str | None
    organizer_contact: str | None
    max_participants: int | None
    color: str
    status: EventStatus
    total_budget: Decimal
    created_at: datetime
    updated_at: datetime
