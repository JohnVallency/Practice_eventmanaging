"""CRUD-роутер ресурсов EventLMS (prefix /api/resources).

Роуты тонкие: валидацию выполняет Pydantic, бизнес-логику — сервисы,
доменные ошибки перехватываются глобальными обработчиками в main.py.
"""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from schemas import ResourceCreate, ResourceResponse, ResourceUpdate
from services import ResourceService

router = APIRouter(prefix="/api/resources", tags=["resources"])


@router.post(
    "/",
    response_model=ResourceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Создать ресурс",
)
async def create_resource(
    data: ResourceCreate,
    session: AsyncSession = Depends(get_session),
) -> ResourceResponse:
    """Создать ресурс в существующем событии.

    Args:
        data: валидированные данные создания ресурса.
        session: сессия БД из зависимости FastAPI.

    Returns:
        ResourceResponse: созданный ресурс со статусом 201, иначе 404.
    """
    resource = await ResourceService.create(session, data)
    return ResourceResponse.model_validate(resource)


@router.get("/", response_model=list[ResourceResponse], summary="Список ресурсов")
async def list_resources(
    event_id: uuid.UUID | None = Query(default=None, description="Фильтр по событию"),
    skip: int = Query(default=0, ge=0, description="Сколько записей пропустить"),
    limit: int = Query(default=50, ge=1, le=100, description="Размер страницы"),
    session: AsyncSession = Depends(get_session),
) -> list[ResourceResponse]:
    """Получить список ресурсов с фильтром по событию и пагинацией.

    Args:
        event_id: опциональный фильтр по событию.
        skip: количество пропускаемых записей.
        limit: размер страницы (1..100).
        session: сессия БД из зависимости FastAPI.

    Returns:
        list[ResourceResponse]: страница списка ресурсов.
    """
    resources = await ResourceService.list(session, event_id=event_id, skip=skip, limit=limit)
    return [ResourceResponse.model_validate(resource) for resource in resources]


@router.get("/{resource_id}", response_model=ResourceResponse, summary="Получить ресурс")
async def get_resource(
    resource_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> ResourceResponse:
    """Получить ресурс по идентификатору.

    Args:
        resource_id: UUID ресурса.
        session: сессия БД из зависимости FastAPI.

    Returns:
        ResourceResponse: данные ресурса, иначе 404 через обработчик.
    """
    resource = await ResourceService.get_or_404(session, resource_id)
    return ResourceResponse.model_validate(resource)


@router.put("/{resource_id}", response_model=ResourceResponse, summary="Обновить ресурс")
async def update_resource(
    resource_id: uuid.UUID,
    data: ResourceUpdate,
    session: AsyncSession = Depends(get_session),
) -> ResourceResponse:
    """Частично обновить ресурс.

    Args:
        resource_id: UUID ресурса.
        data: схема частичного обновления.
        session: сессия БД из зависимости FastAPI.

    Returns:
        ResourceResponse: обновлённый ресурс, иначе 404 через обработчик.
    """
    resource = await ResourceService.update(session, resource_id, data)
    return ResourceResponse.model_validate(resource)


@router.delete(
    "/{resource_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить ресурс",
)
async def delete_resource(
    resource_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Удалить ресурс с каскадом назначений.

    Args:
        resource_id: UUID ресурса.
        session: сессия БД из зависимости FastAPI.
    """
    await ResourceService.delete(session, resource_id)
