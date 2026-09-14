"""Роутер задач и их зависимостей EventLMS (prefix /api/tasks).

Роуты тонкие: валидацию выполняет Pydantic, бизнес-логику — сервисы,
доменные ошибки перехватываются глобальными обработчиками в main.py.
"""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from schemas import (
    TaskCreate,
    TaskDependencyCreate,
    TaskDependencyResponse,
    TaskResponse,
    TaskUpdate,
)
from services import TaskService

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.post(
    "",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Создать задачу",
)
async def create_task(
    data: TaskCreate,
    session: AsyncSession = Depends(get_session),
) -> TaskResponse:
    """Создать задачу в существующем событии.

    Args:
        data: валидированные данные создания задачи.
        session: сессия БД из зависимости FastAPI.

    Returns:
        TaskResponse: созданная задача со статусом 201, иначе 404.
    """
    task = await TaskService.create(session, data)
    return TaskResponse.model_validate(task)


@router.get("", response_model=list[TaskResponse], summary="Список задач")
async def list_tasks(
    event_id: uuid.UUID | None = Query(default=None, description="Фильтр по событию"),
    skip: int = Query(default=0, ge=0, description="Сколько записей пропустить"),
    limit: int = Query(default=50, ge=1, le=100, description="Размер страницы"),
    session: AsyncSession = Depends(get_session),
) -> list[TaskResponse]:
    """Получить список задач с фильтром по событию и пагинацией.

    Args:
        event_id: опциональный фильтр по событию.
        skip: количество пропускаемых записей.
        limit: размер страницы (1..100).
        session: сессия БД из зависимости FastAPI.

    Returns:
        list[TaskResponse]: страница списка задач.
    """
    tasks = await TaskService.list(session, event_id=event_id, skip=skip, limit=limit)
    return [TaskResponse.model_validate(task) for task in tasks]


@router.get("/{task_id}", response_model=TaskResponse, summary="Получить задачу")
async def get_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> TaskResponse:
    """Получить задачу по идентификатору.

    Args:
        task_id: UUID задачи.
        session: сессия БД из зависимости FastAPI.

    Returns:
        TaskResponse: данные задачи, иначе 404 через обработчик.
    """
    task = await TaskService.get_or_404(session, task_id)
    return TaskResponse.model_validate(task)


@router.get(
    "/{task_id}/dependencies",
    response_model=list[TaskDependencyResponse],
    summary="Список связей задачи",
)
async def list_task_dependencies(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[TaskDependencyResponse]:
    """Получить связи, где задача является последователем.

    Args:
        task_id: UUID задачи-последователя.
        session: сессия БД из зависимости FastAPI.

    Returns:
        list[TaskDependencyResponse]: список связей, иначе 404.
    """
    await TaskService.get_or_404(session, task_id)
    dependencies = await TaskService.list_dependencies(session, task_id)
    return [TaskDependencyResponse.model_validate(dep) for dep in dependencies]


@router.post(
    "/{task_id}/dependencies",
    response_model=TaskDependencyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить связь задачи",
)
async def add_task_dependency(
    task_id: uuid.UUID,
    data: TaskDependencyCreate,
    session: AsyncSession = Depends(get_session),
) -> TaskDependencyResponse:
    """Добавить связь предшественник -> последователь.

    Args:
        task_id: UUID задачи-последователя.
        data: валидированные данные связи.
        session: сессия БД из зависимости FastAPI.

    Returns:
        TaskDependencyResponse: созданная связь (201); 400/404/409 при ошибках.
    """
    dependency = await TaskService.add_dependency(session, task_id, data)
    return TaskDependencyResponse.model_validate(dependency)


@router.delete(
    "/{task_id}/dependencies/{predecessor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить связь задачи",
)
async def remove_task_dependency(
    task_id: uuid.UUID,
    predecessor_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Удалить связь между задачами.

    Args:
        task_id: UUID задачи-последователя.
        predecessor_id: UUID задачи-предшественника.
        session: сессия БД из зависимости FastAPI.
    """
    await TaskService.remove_dependency(session, task_id, predecessor_id)


@router.put("/{task_id}", response_model=TaskResponse, summary="Обновить задачу")
async def update_task(
    task_id: uuid.UUID,
    data: TaskUpdate,
    session: AsyncSession = Depends(get_session),
) -> TaskResponse:
    """Частично обновить задачу.

    Args:
        task_id: UUID задачи.
        data: схема частичного обновления.
        session: сессия БД из зависимости FastAPI.

    Returns:
        TaskResponse: обновлённая задача, иначе 404 через обработчик.
    """
    task = await TaskService.update(session, task_id, data)
    return TaskResponse.model_validate(task)


@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить задачу",
)
async def delete_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Удалить задачу с каскадом связей и назначений.

    Args:
        task_id: UUID задачи.
        session: сессия БД из зависимости FastAPI.
    """
    await TaskService.delete(session, task_id)
