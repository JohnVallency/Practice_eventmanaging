"""Схема ответа health-check."""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Тело ответа GET /health."""

    status: str
