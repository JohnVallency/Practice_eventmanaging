"""Точка входа EventLMS API.

FastAPI-приложение с автогенерацией OpenAPI и Swagger UI на /docs,
CORS для фронтенда и маршрутом живости /health.
"""

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes.health import router as health_router
from core.config import settings
from core.database import dispose_engine


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

    app.include_router(health_router)

    return app


app: FastAPI = create_app()
