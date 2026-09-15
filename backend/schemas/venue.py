"""Схемы Pydantic v2 для сущности Venue (площадки события)."""

import uuid

from pydantic import BaseModel, ConfigDict, Field


class VenueCreate(BaseModel):
    """Схема создания площадки события."""

    name: str = Field(min_length=1, max_length=200)
    address: str | None = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class VenueResponse(BaseModel):
    """Схема ответа с данными площадки."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    address: str | None
    latitude: float
    longitude: float


class MapCenter(BaseModel):
    """Центр карты: средняя широта и долгота по площадкам события."""

    latitude: float
    longitude: float


class MapResponse(BaseModel):
    """Ответ карты площадок события.

    Attributes:
        event_id: UUID события.
        venues: площадки события.
        center: центр карты (None, если площадок нет).
    """

    event_id: uuid.UUID
    venues: list[VenueResponse]
    center: MapCenter | None
