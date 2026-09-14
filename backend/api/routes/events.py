"""CRUD-роутер событий EventLMS (prefix /api/events).

Роуты тонкие: валидацию выполняет Pydantic, бизнес-логику — сервисы,
доменные ошибки перехватываются глобальными обработчиками в main.py.
"""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from schemas import EventCreate, EventResponse, EventUpdate
from services import EventService

router = APIRouter(prefix="/api/events", tags=["events"])


@router.post(
    "",
    response_model=EventResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Создать событие",
)
async def create_event(
    data: EventCreate,
    session: AsyncSession = Depends(get_session),
) -> EventResponse:
    """Создать событие.

    Args:
        data: валидированные данные создания события.
        session: сессия БД из зависимости FastAPI.

    Returns:
        EventResponse: созданное событие со статусом 201.
    """
    event = await EventService.create(session, data)
    return EventResponse.model_validate(event)


@router.get("", response_model=list[EventResponse], summary="Список событий")
async def list_events(
    skip: int = Query(default=0, ge=0, description="Сколько записей пропустить"),
    limit: int = Query(default=50, ge=1, le=100, description="Размер страницы"),
    session: AsyncSession = Depends(get_session),
) -> list[EventResponse]:
    """Получить список событий с пагинацией.

    Args:
        skip: количество пропускаемых записей.
        limit: размер страницы (1..100).
        session: сессия БД из зависимости FastAPI.

    Returns:
        list[EventResponse]: страница списка событий.
    """
    events = await EventService.list(session, skip=skip, limit=limit)
    return [EventResponse.model_validate(event) for event in events]


@router.get("/{event_id}", response_model=EventResponse, summary="Получить событие")
async def get_event(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> EventResponse:
    """Получить событие по идентификатору.

    Args:
        event_id: UUID события.
        session: сессия БД из зависимости FastAPI.

    Returns:
        EventResponse: данные события, иначе 404 через обработчик.
    """
    event = await EventService.get_or_404(session, event_id)
    return EventResponse.model_validate(event)


@router.put("/{event_id}", response_model=EventResponse, summary="Обновить событие")
async def update_event(
    event_id: uuid.UUID,
    data: EventUpdate,
    session: AsyncSession = Depends(get_session),
) -> EventResponse:
    """Частично обновить событие.

    Args:
        event_id: UUID события.
        data: схема частичного обновления.
        session: сессия БД из зависимости FastAPI.

    Returns:
        EventResponse: обновлённое событие, иначе 404 через обработчик.
    """
    event = await EventService.update(session, event_id, data)
    return EventResponse.model_validate(event)


@router.delete(
    "/{event_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить событие",
)
async def delete_event(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Удалить событие с каскадом зависимых сущностей.

    Args:
        event_id: UUID события.
        session: сессия БД из зависимости FastAPI.
    """
    await EventService.delete(session, event_id)
