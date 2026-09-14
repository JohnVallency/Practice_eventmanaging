"""CRUD-роутер назначений ресурсов EventLMS (prefix /api/assignments).

Роуты тонкие: валидацию выполняет Pydantic, бизнес-логику — сервисы,
доменные ошибки перехватываются глобальными обработчиками в main.py.
"""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from schemas import AssignmentCreate, AssignmentResponse, AssignmentUpdate
from services import AssignmentService

router = APIRouter(prefix="/api/assignments", tags=["assignments"])


@router.post(
    "",
    response_model=AssignmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Создать назначение",
)
async def create_assignment(
    data: AssignmentCreate,
    session: AsyncSession = Depends(get_session),
) -> AssignmentResponse:
    """Создать назначение ресурса на задачу.

    Args:
        data: валидированные данные создания назначения.
        session: сессия БД из зависимости FastAPI.

    Returns:
        AssignmentResponse: созданное назначение (201); 400/404/409 при ошибках.
    """
    assignment = await AssignmentService.create(session, data)
    return AssignmentResponse.model_validate(assignment)


@router.get("", response_model=list[AssignmentResponse], summary="Список назначений")
async def list_assignments(
    task_id: uuid.UUID | None = Query(default=None, description="Фильтр по задаче"),
    resource_id: uuid.UUID | None = Query(default=None, description="Фильтр по ресурсу"),
    skip: int = Query(default=0, ge=0, description="Сколько записей пропустить"),
    limit: int = Query(default=50, ge=1, le=100, description="Размер страницы"),
    session: AsyncSession = Depends(get_session),
) -> list[AssignmentResponse]:
    """Получить список назначений с фильтрами и пагинацией.

    Args:
        task_id: опциональный фильтр по задаче.
        resource_id: опциональный фильтр по ресурсу.
        skip: количество пропускаемых записей.
        limit: размер страницы (1..100).
        session: сессия БД из зависимости FastAPI.

    Returns:
        list[AssignmentResponse]: страница списка назначений.
    """
    assignments = await AssignmentService.list(
        session, task_id=task_id, resource_id=resource_id, skip=skip, limit=limit
    )
    return [AssignmentResponse.model_validate(item) for item in assignments]


@router.get(
    "/{assignment_id}",
    response_model=AssignmentResponse,
    summary="Получить назначение",
)
async def get_assignment(
    assignment_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> AssignmentResponse:
    """Получить назначение по идентификатору.

    Args:
        assignment_id: UUID назначения.
        session: сессия БД из зависимости FastAPI.

    Returns:
        AssignmentResponse: данные назначения, иначе 404 через обработчик.
    """
    assignment = await AssignmentService.get_or_404(session, assignment_id)
    return AssignmentResponse.model_validate(assignment)


@router.put(
    "/{assignment_id}",
    response_model=AssignmentResponse,
    summary="Обновить назначение",
)
async def update_assignment(
    assignment_id: uuid.UUID,
    data: AssignmentUpdate,
    session: AsyncSession = Depends(get_session),
) -> AssignmentResponse:
    """Частично обновить назначение с пересчётом переаллокации.

    Args:
        assignment_id: UUID назначения.
        data: схема частичного обновления.
        session: сессия БД из зависимости FastAPI.

    Returns:
        AssignmentResponse: обновлённое назначение; 409 при переаллокации.
    """
    assignment = await AssignmentService.update(session, assignment_id, data)
    return AssignmentResponse.model_validate(assignment)


@router.delete(
    "/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить назначение",
)
async def delete_assignment(
    assignment_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Удалить назначение ресурса с задачи.

    Args:
        assignment_id: UUID назначения.
        session: сессия БД из зависимости FastAPI.
    """
    await AssignmentService.delete(session, assignment_id)
