"""Роутер расчёта расписания события (prefix /api/events).

Роут тонкий: валидацию выполняет Pydantic, бизнес-логику — ScheduleService,
доменные ошибки (404 событие, 400 нет задач / цикл) перехватываются
глобальными обработчиками в main.py.
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from schemas.schedule import ScheduleCalculationResponse
from services.schedule_service import ScheduleService

router = APIRouter(prefix="/api/events", tags=["schedule"])


@router.post(
    "/{event_id}/schedule/calculate",
    response_model=ScheduleCalculationResponse,
    summary="Рассчитать расписание события (прямой проход CPM)",
)
async def calculate_schedule(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> ScheduleCalculationResponse:
    """Рассчитать ранние даты всех задач события.

    Args:
        event_id: UUID события.
        session: сессия БД из зависимости FastAPI.

    Returns:
        ScheduleCalculationResponse: рассчитанные ES/EF по каждой задаче.

    Raises:
        ResourceNotFound: если события нет (404 через обработчик).
        ValidationError: если задач нет или зависимости образуют цикл
            (400 через обработчик).
    """
    result = await ScheduleService.calculate_event_schedule(session, event_id)
    return ScheduleCalculationResponse.model_validate(result)
