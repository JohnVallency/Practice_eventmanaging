"""Роутер ресурсного расписания события (prefix /api/events).

Роут тонкий: валидацию выполняет Pydantic, бизнес-логику —
ResourceSchedulingService, доменные ошибки (404 событие, 400 нет задач /
нет расчёта / перерасход ресурсов) перехватываются глобальными
обработчиками в main.py.
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from schemas.resource_scheduling import (
    ResourceScheduleResponse,
    ResourceUtilizationResponse,
)
from services.resource_scheduling_service import ResourceSchedulingService

router = APIRouter(prefix="/api/events", tags=["resource-schedule"])


@router.post(
    "/{event_id}/schedule/resource",
    response_model=ResourceScheduleResponse,
    summary="Рассчитать ресурсное расписание события (серийный SGS)",
)
async def calculate_resource_schedule(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> ResourceScheduleResponse:
    """Рассчитать фактические даты задач с учётом ресурсных ограничений.

    Args:
        event_id: UUID события.
        session: сессия БД из зависимости FastAPI.

    Returns:
        ResourceScheduleResponse: фактические даты и задержки по каждой
        задаче, длительность проекта с учётом ресурсов.

    Raises:
        ResourceNotFound: если события нет (404 через обработчик).
        ValidationError: если задач нет или SGS отклонил граф — цикл,
            потребность ресурса > доступности (400 через обработчик).
    """
    result = await ResourceSchedulingService.calculate_resource_schedule(
        session, event_id
    )
    return ResourceScheduleResponse.model_validate(result)


@router.get(
    "/{event_id}/resources/utilization",
    response_model=ResourceUtilizationResponse,
    summary="Загрузка ресурсов события по дням",
)
async def calculate_resource_utilization(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> ResourceUtilizationResponse:
    """Рассчитать профиль загрузки каждого ресурса события по дням.

    Args:
        event_id: UUID события.
        session: сессия БД из зависимости FastAPI.

    Returns:
        ResourceUtilizationResponse: горизонт планирования и профили
        загрузки (по дням, пик и процент утилизации) каждого ресурса.

    Raises:
        ResourceNotFound: если события нет (404 через обработчик).
        ValidationError: если задач нет или ресурсное расписание ещё не
            рассчитано (400 через обработчик).
    """
    result = await ResourceSchedulingService.calculate_resource_utilization(
        session, event_id
    )
    return ResourceUtilizationResponse.model_validate(result)
