"""Health-check роутер EventLMS API.

Предоставляет проверку живости сервиса без обращения к базе данных:
приложение считается здоровым, если процесс uvicorn отвечает.
"""

from fastapi import APIRouter

from schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Вернуть статус живости сервиса.

    Returns:
        HealthResponse: фиксированный статус "ok" с кодом 200.
    """
    return HealthResponse(status="ok")
