"""Точка входа EventLMS API.

FastAPI-приложение с автогенерацией OpenAPI и Swagger UI на /docs,
CORS для фронтенда, маршрутом живости /health, доменными CRUD-роутерами
(events, tasks, resources, assignments) и глобальными обработчиками
ошибок (AppError -> статус исключения, IntegrityError -> 409).
"""

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from api.routes import (
    assignments_router,
    events_router,
    health_router,
    resources_router,
    schedule_router,
    tasks_router,
)
from core.config import settings
from core.database import dispose_engine
from core.exceptions import AppError


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Управление жизненным циклом приложения.

    Args:
        app: экземпляр FastAPI.

    Yields:
        None: период активной работы приложения.
    """
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    """Собрать приложение EventLMS.

    Returns:
        Настроенный экземпляр FastAPI с OpenAPI, CORS и роутерами.
    """
    app = FastAPI(
        title=settings.project_name,
        debug=settings.debug,
        openapi_url="/openapi.json",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Глобальные обработчики доменных ошибок сервисного слоя.
    app.add_exception_handler(AppError, app_error_handler)
    # Ошибки БД, не перехваченные сервисами (FK, уникальность, CHECK).
    app.add_exception_handler(IntegrityError, integrity_error_handler)

    app.include_router(health_router)
    app.include_router(events_router)
    app.include_router(tasks_router)
    app.include_router(resources_router)
    app.include_router(assignments_router)
    app.include_router(schedule_router)

    return app


def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Превратить доменное исключение в JSON-ответ.

    Args:
        request: HTTP-запрос (требование сигнатуры FastAPI).
        exc: доменное исключение с message и status_code.

    Returns:
        JSONResponse: ответ с телом {"detail": message} и статусом ошибки.
    """
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    """Превратить IntegrityError SQLAlchemy в ответ 409.

    Args:
        request: HTTP-запрос (требование сигнатуры FastAPI).
        exc: исключение нарушения целостности БД.

    Returns:
        JSONResponse: ответ 409 с телом {"detail": "Нарушение целостности данных"}.
    """
    return JSONResponse(
        status_code=409,
        content={"detail": "Нарушение целостности данных"},
    )


app: FastAPI = create_app()
