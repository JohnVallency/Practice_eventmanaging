"""Роутер площадок и карты события (prefix /api/events).

Роуты тонкие: валидацию выполняет Pydantic, бизнес-логику — VenueService,
доменные ошибки (404 событие) перехватываются глобальными обработчиками в main.py.
"""

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from schemas.venue import MapResponse, VenueCreate, VenueResponse
from services.venue_service import VenueService

router = APIRouter(prefix="/api/events", tags=["maps"])


@router.post(
    "/{event_id}/venues",
    response_model=VenueResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Создать площадку",
)
async def create_venue(
    event_id: uuid.UUID,
    data: VenueCreate,
    session: AsyncSession = Depends(get_session),
) -> VenueResponse:
    """Добавить площадку в существующее событие.

    Args:
        event_id: UUID события.
        data: валидированные данные создания площадки.
        session: сессия БД из зависимости FastAPI.

    Returns:
        VenueResponse: созданная площадка со статусом 201, иначе 404.
    """
    venue = await VenueService.create_venue(session, event_id, data)
    return VenueResponse.model_validate(venue)


@router.get(
    "/{event_id}/venues",
    response_model=list[VenueResponse],
    summary="Список площадок события",
)
async def list_venues(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[VenueResponse]:
    """Получить все площадки события.

    Args:
        event_id: UUID события.
        session: сессия БД из зависимости FastAPI.

    Returns:
        list[VenueResponse]: список площадок события, иначе 404.
    """
    venues = await VenueService.list_venues(session, event_id)
    return [VenueResponse.model_validate(venue) for venue in venues]


@router.get(
    "/{event_id}/map",
    response_model=MapResponse,
    summary="Карта площадок события",
)
async def get_event_map(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> MapResponse:
    """Получить данные карты площадок события.

    Args:
        event_id: UUID события.
        session: сессия БД из зависимости FastAPI.

    Returns:
        MapResponse: карта с точками площадок, иначе 404.
    """
    event_map = await VenueService.build_map(session, event_id)
    return MapResponse.model_validate(event_map)
